param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Post,

  [Parameter(Mandatory = $true, Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$Images,

  [switch]$NoRename,
  [switch]$AssetTag
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$postFile = Join-Path $repoRoot "source\_posts\$Post.md"
$assetDir = Join-Path $repoRoot "source\_posts\$Post"
$extensions = @(".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif")

if (-not (Test-Path -LiteralPath $postFile -PathType Leaf)) {
  throw "Post not found: $postFile"
}

if (-not (Test-Path -LiteralPath $assetDir -PathType Container)) {
  New-Item -ItemType Directory -Path $assetDir | Out-Null
}

$files = New-Object System.Collections.Generic.List[System.IO.FileInfo]

foreach ($item in $Images) {
  $path = Resolve-Path -LiteralPath $item
  foreach ($resolved in $path) {
    if (Test-Path -LiteralPath $resolved.Path -PathType Container) {
      Get-ChildItem -LiteralPath $resolved.Path -File |
        Where-Object { $extensions -contains $_.Extension.ToLowerInvariant() } |
        Sort-Object Name |
        ForEach-Object { $files.Add($_) }
    } elseif ($extensions -contains ([System.IO.Path]::GetExtension($resolved.Path)).ToLowerInvariant()) {
      $files.Add((Get-Item -LiteralPath $resolved.Path))
    }
  }
}

if ($files.Count -eq 0) {
  throw "No supported images found. Supported: $($extensions -join ', ')"
}

function Get-SafeName {
  param([string]$Name)

  $base = [System.IO.Path]::GetFileNameWithoutExtension($Name)
  $ext = [System.IO.Path]::GetExtension($Name).ToLowerInvariant()
  $base = $base -replace "\s+", "-"
  $base = $base -replace "[^a-zA-Z0-9._-]", ""
  if ([string]::IsNullOrWhiteSpace($base)) {
    $base = "image"
  }
  return "$base$ext"
}

function Get-NextNumberedName {
  param([string]$Extension)

  $i = 1
  while ($true) {
    $name = "{0:D2}{1}" -f $i, $Extension.ToLowerInvariant()
    $target = Join-Path $assetDir $name
    if (-not (Test-Path -LiteralPath $target)) {
      return $name
    }
    $i++
  }
}

$markdown = New-Object System.Collections.Generic.List[string]

foreach ($file in $files) {
  if ($NoRename) {
    $name = Get-SafeName $file.Name
    $target = Join-Path $assetDir $name
    $stem = [System.IO.Path]::GetFileNameWithoutExtension($name)
    $ext = [System.IO.Path]::GetExtension($name)
    $suffix = 2

    while (Test-Path -LiteralPath $target) {
      $name = "{0}-{1}{2}" -f $stem, $suffix, $ext
      $target = Join-Path $assetDir $name
      $suffix++
    }
  } else {
    $name = Get-NextNumberedName $file.Extension
    $target = Join-Path $assetDir $name
  }

  Copy-Item -LiteralPath $file.FullName -Destination $target

  $alt = [System.IO.Path]::GetFileNameWithoutExtension($name)
  if ($AssetTag) {
    $markdown.Add("{% asset_img $name $alt %}")
  } else {
    $markdown.Add("![$alt]($name)")
  }
}

Write-Host ""
Write-Host "Copied $($files.Count) image(s) to source/_posts/$Post/"
Write-Host ""
Write-Host "Paste this into source/_posts/$Post.md:"
Write-Host ""
$markdown | ForEach-Object { Write-Host $_ }
Write-Host ""
Write-Host "This helper is for local theme/build development only."
Write-Host "Use Blog Admin for real article and media publishing."
