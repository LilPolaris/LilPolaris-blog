param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Post
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$postFile = Join-Path $repoRoot "source\_posts\$Post.md"
$assetDir = Join-Path $repoRoot "source\_posts\$Post"

if (Test-Path -LiteralPath $postFile) {
  throw "Post already exists: source/_posts/$Post.md"
}

Push-Location $repoRoot
try {
  Write-Host "Creating post: $Post"
  & npx hexo new post $Post
  if ($LASTEXITCODE -ne 0) {
    throw "hexo new failed."
  }

  if (-not (Test-Path -LiteralPath $assetDir -PathType Container)) {
    New-Item -ItemType Directory -Path $assetDir | Out-Null
  }

  Write-Host ""
  Write-Host "Created:"
  Write-Host "source/_posts/$Post.md"
  Write-Host "source/_posts/$Post/"
  Write-Host ""
  Write-Host "This command is for local theme/build development only."
  Write-Host "It cannot publish content. Use the Blog Admin for real articles and media."
}
finally {
  Pop-Location
}
