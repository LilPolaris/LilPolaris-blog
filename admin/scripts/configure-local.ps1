$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$adminPath = Join-Path $repoRoot "admin"
$envPath = Join-Path $adminPath ".env.local"

$ghCommand = Get-Command gh -ErrorAction SilentlyContinue
if (-not $ghCommand) {
  throw "GitHub CLI is not installed. Install it and sign in before using local mode."
}

$login = (& gh api user --jq ".login" 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($login)) {
  throw "GitHub CLI is not signed in."
}
if ($login.ToLowerInvariant() -ne "lilpolaris") {
  throw "The active GitHub CLI account is '$login', not 'LilPolaris'."
}

$token = (& gh auth token 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($token)) {
  throw "Could not read the GitHub CLI token."
}

$secretBytes = New-Object byte[] 48
$random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$random.GetBytes($secretBytes)
$random.Dispose()
$authSecret = [Convert]::ToBase64String($secretBytes)

$lines = @(
  "# Generated locally by admin/scripts/configure-local.ps1. Never commit this file.",
  "GITHUB_TOKEN=$token",
  "GITHUB_OWNER=LilPolaris",
  "GITHUB_REPO=LilPolaris-blog",
  "GITHUB_BRANCH=main",
  "",
  "HEXO_POSTS_PATH=source/_posts",
  "HEXO_DRAFTS_PATH=source/_drafts",
  "HEXO_IMAGES_PATH=source/img",
  "PUBLIC_BLOG_URL=https://lilpolaris.github.io",
  "BLOG_TIMEZONE=Asia/Shanghai",
  "GITHUB_WORKFLOW_ID=deploy.yml",
  "",
  "ADMIN_GITHUB_LOGIN=LilPolaris",
  "AUTH_MODE=local-cli",
  "AUTH_SECRET=$authSecret",
  "CONTENT_WRITE_POLICY=",
  "",
  "DEFAULT_LAYOUT=post",
  "DEFAULT_CATEGORY=",
  "DEFAULT_COMMIT_TEMPLATE=content: {action} post {slug}",
  "EDITOR_DEFAULT_MODE=live",
  "AUTO_DISPATCH_WORKFLOW=false",
  "MAX_UPLOAD_MB=8",
  "REPOSITORY_ADAPTER=github",
  "",
  "AI_PROVIDER=deepseek",
  "AI_BASE_URL=https://api.deepseek.com",
  "AI_MODEL=deepseek-v4-flash",
  "AI_API_KEY=",
  "AI_TIMEOUT_MS=45000"
)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($envPath, $lines, $utf8NoBom)

# Remove sensitive values from the current process as soon as the file is written.
$token = $null
$authSecret = $null
[System.GC]::Collect()

Write-Output "Local configuration created for GitHub user $login."
