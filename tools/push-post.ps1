param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Post,

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$MessageParts
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$safeDir = $repoRoot.Path.Replace("\", "/")
$postFile = Join-Path $repoRoot "source\_posts\$Post.md"
$assetDir = Join-Path $repoRoot "source\_posts\$Post"
$postRel = "source/_posts/$Post.md"
$assetRel = "source/_posts/$Post"
$paths = @($postRel)
if (Test-Path -LiteralPath $assetDir -PathType Container) {
  $paths += $assetRel
}

if (-not (Test-Path -LiteralPath $postFile -PathType Leaf)) {
  throw "Post not found: $postRel"
}

function Assert-PostIsReady {
  param(
    [string]$Path,
    [string]$Slug
  )

  $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $frontMatterMatch = [regex]::Match(
    $text,
    "\A---\r?\n(?<front>.*?)\r?\n---(?:\r?\n)?",
    [System.Text.RegularExpressions.RegexOptions]::Singleline
  )

  if (-not $frontMatterMatch.Success) {
    throw "Invalid front matter in $postRel. The file must start and end its metadata block with ---."
  }

  $front = $frontMatterMatch.Groups["front"].Value
  $titleMatch = [regex]::Match($front, "(?m)^title:\s*(?<title>.*)$")
  $title = if ($titleMatch.Success) { $titleMatch.Groups["title"].Value.Trim() } else { "" }
  $body = $text.Substring($frontMatterMatch.Length).Trim()

  if ([string]::IsNullOrWhiteSpace($title)) {
    throw "The post title is empty. Save a real title in $postRel before publishing."
  }

  if ($title -eq $Slug) {
    throw "The post title is still the generated filename '$Slug'. Save the intended title before publishing."
  }

  if ([string]::IsNullOrWhiteSpace($body)) {
    throw "The post body is empty on disk. Save the editor file (Ctrl+S) before publishing."
  }
}

function Get-ShanghaiTimestamp {
  $zone = $null
  foreach ($zoneId in @("China Standard Time", "Asia/Shanghai")) {
    try {
      $zone = [System.TimeZoneInfo]::FindSystemTimeZoneById($zoneId)
      break
    }
    catch {
      continue
    }
  }
  if (-not $zone) {
    throw "Could not resolve the Asia/Shanghai time zone."
  }
  return [System.TimeZoneInfo]::ConvertTimeFromUtc(
    [System.DateTime]::UtcNow,
    $zone
  ).ToString("yyyy-MM-dd HH:mm:ss")
}

function Update-PostTimestamps {
  param(
    [string]$Path,
    [bool]$FirstPublish
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  $newline = if ($text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $frontMatterMatch = [regex]::Match($text, "\A---\r?\n(?<front>.*?)\r?\n---", [System.Text.RegularExpressions.RegexOptions]::Singleline)

  if (-not $frontMatterMatch.Success) {
    return
  }

  $timestamp = Get-ShanghaiTimestamp
  $front = $frontMatterMatch.Groups["front"].Value
  $lines = New-Object System.Collections.Generic.List[string]
  $front -split "\r?\n" | ForEach-Object { $lines.Add($_) }

  function Get-FieldValue {
    param(
      [System.Collections.Generic.List[string]]$Values,
      [string]$Name
    )
    $escapedName = [regex]::Escape($Name)
    foreach ($line in $Values) {
      if ($line -match "^${escapedName}:\s*(?<value>.*)$") {
        return $Matches["value"].Trim()
      }
    }
    return ""
  }

  function Set-FieldValue {
    param(
      [System.Collections.Generic.List[string]]$Values,
      [string]$Name,
      [string]$Value,
      [string]$After = ""
    )
    $escapedName = [regex]::Escape($Name)
    for ($i = 0; $i -lt $Values.Count; $i++) {
      if ($Values[$i] -match "^${escapedName}:\s*") {
        $Values[$i] = "${Name}: $Value"
        return
      }
    }
    $insertIndex = 0
    if ($After) {
      $escapedAfter = [regex]::Escape($After)
      for ($i = 0; $i -lt $Values.Count; $i++) {
        if ($Values[$i] -match "^${escapedAfter}:\s*") {
          $insertIndex = $i + 1
          break
        }
      }
    }
    $Values.Insert($insertIndex, "${Name}: $Value")
  }

  if ($FirstPublish) {
    Set-FieldValue $lines "date" $timestamp
    Set-FieldValue $lines "first_published_at" $timestamp "date"
  } else {
    $firstPublished = Get-FieldValue $lines "first_published_at"
    $existingDate = Get-FieldValue $lines "date"
    if (-not $firstPublished -and $existingDate) {
      Set-FieldValue $lines "first_published_at" $existingDate "date"
    }
  }
  Set-FieldValue $lines "updated" $timestamp "first_published_at"

  $newFront = $lines -join $newline
  $newText = "---$newline$newFront$newline---" + $text.Substring($frontMatterMatch.Length)
  [System.IO.File]::WriteAllText($Path, $newText, $utf8NoBom)

  if ($FirstPublish) {
    Write-Host "Set first publication timestamp: $timestamp (Asia/Shanghai)"
  } else {
    Write-Host "Updated front matter timestamp: $timestamp (Asia/Shanghai)"
  }
}

Push-Location $repoRoot
try {
  $preStaged = & git -c "safe.directory=$safeDir" diff --cached --name-only
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect staged changes."
  }

  if ($preStaged) {
    Write-Host "There are already staged changes:"
    $preStaged | ForEach-Object { Write-Host "  $_" }
    throw "Commit or unstage those first, then run this command again."
  }

  $savedChanges = & git -c "safe.directory=$safeDir" status --porcelain=v1 --untracked-files=all -- $paths
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect saved article changes."
  }

  if (-not $savedChanges) {
    $ahead = & git -c "safe.directory=$safeDir" rev-list --count '@{upstream}..HEAD'
    if ($LASTEXITCODE -eq 0 -and [int]$ahead -gt 0) {
      & git -c "safe.directory=$safeDir" cat-file -e "@{upstream}:$postRel" 2>$null
      $existsUpstream = $LASTEXITCODE -eq 0
      if (-not $existsUpstream) {
        Write-Host "The new post is committed locally but has not been published yet."
        Assert-PostIsReady $postFile $Post
        Update-PostTimestamps $postFile $true
        Write-Host "Building site..."
        & npm run build
        if ($LASTEXITCODE -ne 0) {
          throw "Build failed. Fix the error above before publishing."
        }
        & git -c "safe.directory=$safeDir" add -- $postRel
        if ($LASTEXITCODE -ne 0) {
          throw "git add failed."
        }
        & git -c "safe.directory=$safeDir" commit -m "Set publication time for $Post"
        if ($LASTEXITCODE -ne 0) {
          throw "Could not commit the first publication timestamp."
        }
      }
      Write-Host "No new article changes, but local commits are waiting to be pushed."
      & git -c "safe.directory=$safeDir" push
      if ($LASTEXITCODE -ne 0) {
        throw "git push failed."
      }
      return
    }

    throw "No saved changes found for $postRel. Save the editor file (Ctrl+S), then run this command again."
  }

  & git -c "safe.directory=$safeDir" cat-file -e "@{upstream}:$postRel" 2>$null
  $existsUpstream = $LASTEXITCODE -eq 0

  Assert-PostIsReady $postFile $Post
  Update-PostTimestamps $postFile (-not $existsUpstream)

  Write-Host "Building site..."
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed. Fix the error above before publishing."
  }

  Write-Host ""
  Write-Host "Staging:"
  $paths | ForEach-Object { Write-Host "  $_" }
  & git -c "safe.directory=$safeDir" add -- $paths
  if ($LASTEXITCODE -ne 0) {
    throw "git add failed."
  }

  & git -c "safe.directory=$safeDir" diff --cached --quiet -- $paths
  if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "No changes to commit for $Post."
    Write-Host "Pushing any local commits..."
    & git -c "safe.directory=$safeDir" push
    if ($LASTEXITCODE -ne 0) {
      throw "git push failed."
    }
    return
  }

  if ($MessageParts -and $MessageParts.Count -gt 0) {
    $message = $MessageParts -join " "
  } else {
    $verb = if ($existsUpstream) { "Update" } else { "Add" }
    $prettyPost = $Post -replace "-", " "
    $message = "$verb $prettyPost"
  }

  Write-Host ""
  Write-Host "Committing: $message"
  & git -c "safe.directory=$safeDir" commit -m $message
  if ($LASTEXITCODE -ne 0) {
    throw "git commit failed."
  }

  Write-Host ""
  Write-Host "Pushing to GitHub..."
  & git -c "safe.directory=$safeDir" push
  if ($LASTEXITCODE -ne 0) {
    throw "git push failed."
  }

  Write-Host ""
  Write-Host "Done. GitHub Actions will deploy the site automatically."
  Write-Host "Post URL should be:"
  Write-Host "https://lilpolaris.github.io/posts/$Post/"
}
finally {
  Pop-Location
}
