param(
  [Parameter(Position = 0)]
  [string]$Post,

  [Parameter(Position = 1, ValueFromRemainingArguments = $true)]
  [string[]]$IgnoredArguments
)

$ErrorActionPreference = "Stop"

$message = @(
  "Local content and site publishing is disabled. No files or Git state were changed."
  ""
  "Articles, drafts, and media must be published through Blog Admin:"
  "  1. Run the Blog Admin launcher in the repository root."
  "  2. Save or publish from the admin editor."
  ""
  "The local repository is for admin, theme, and build development only."
) -join [Environment]::NewLine

Write-Error $message
exit 2
