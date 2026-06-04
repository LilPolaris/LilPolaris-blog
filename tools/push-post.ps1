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

if (-not (Test-Path -LiteralPath $postFile -PathType Leaf)) {
  throw "Post not found: $postRel"
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

  Write-Host "Building site..."
  & npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed. Fix the error above before publishing."
  }

  $trackedFiles = & git -c "safe.directory=$safeDir" ls-files -- $postRel
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect tracked files."
  }
  $isTracked = [bool]$trackedFiles

  $paths = @($postRel)
  if (Test-Path -LiteralPath $assetDir -PathType Container) {
    $paths += $assetRel
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
    $verb = if ($isTracked) { "Update" } else { "Add" }
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
