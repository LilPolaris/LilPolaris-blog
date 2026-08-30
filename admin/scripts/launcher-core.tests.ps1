$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "launcher-core.ps1")

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) { throw "Assertion failed: $Message" }
}

function Assert-Equal {
  param($Expected, $Actual, [string]$Message)
  if ($Expected -ne $Actual) {
    throw "Assertion failed: $Message (expected '$Expected', got '$Actual')"
  }
}

$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("lilpolaris-launcher-tests-{0}" -f [Guid]::NewGuid().ToString("N"))
$junctionPath = Join-Path $testRoot "junction"
New-Item -ItemType Directory -Path $testRoot | Out-Null

try {
  $adminPath = Join-Path $testRoot "admin"
  $sourcePath = Join-Path $adminPath "src"
  New-Item -ItemType Directory -Path $sourcePath -Force | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $adminPath "package.json"), '{"name":"test"}')
  [System.IO.File]::WriteAllText((Join-Path $adminPath "package-lock.json"), '{"lockfileVersion":3}')
  [System.IO.File]::WriteAllText((Join-Path $adminPath "next.config.ts"), 'export default {}')
  [System.IO.File]::WriteAllText((Join-Path $sourcePath "page.ts"), 'export const value = 1;')
  $secret = "do-not-persist-this-secret"
  $environmentPath = Join-Path $adminPath ".env.local"
  [System.IO.File]::WriteAllText($environmentPath, "AUTH_SECRET=$secret")

  $nodePath = Join-Path $PSHOME "powershell.exe"
  if (-not (Test-Path -LiteralPath $nodePath)) { $nodePath = (Get-Process -Id $PID).Path }
  $dependencyOne = Get-DependencyFingerprint -AdminPath $adminPath -NodePath $nodePath -NodeVersion "v22.0.0" -NpmPath $nodePath -NpmVersion "10.0.0"
  $dependencyTwo = Get-DependencyFingerprint -AdminPath $adminPath -NodePath $nodePath -NodeVersion "v22.0.0" -NpmPath $nodePath -NpmVersion "10.0.0"
  Assert-Equal $dependencyOne $dependencyTwo "dependency fingerprints must be deterministic"
  $dependencyChanged = Get-DependencyFingerprint -AdminPath $adminPath -NodePath $nodePath -NodeVersion "v23.0.0" -NpmPath $nodePath -NpmVersion "10.0.0"
  Assert-True ($dependencyOne -ne $dependencyChanged) "the Node version must affect the dependency fingerprint"

  $buildOne = Get-BuildFingerprint -AdminPath $adminPath -DependencyFingerprint $dependencyOne -EnvironmentPath $environmentPath
  $buildTwo = Get-BuildFingerprint -AdminPath $adminPath -DependencyFingerprint $dependencyOne -EnvironmentPath $environmentPath
  Assert-Equal $buildOne $buildTwo "build fingerprints must be deterministic"
  Assert-True (-not $buildOne.Contains($secret)) "the final fingerprint must not expose environment values"
  $relocatedAdmin = Join-Path $testRoot "relocated-admin"
  Copy-Item -LiteralPath $adminPath -Destination $relocatedAdmin -Recurse
  $relocatedBuild = Get-BuildFingerprint -AdminPath $relocatedAdmin -DependencyFingerprint $dependencyOne -EnvironmentPath (Join-Path $relocatedAdmin ".env.local")
  Assert-True ($buildOne -ne $relocatedBuild) "the physical admin path must affect the build fingerprint"
  [System.IO.File]::WriteAllText((Join-Path $sourcePath "page.ts"), 'export const value = 2;')
  $sourceChanged = Get-BuildFingerprint -AdminPath $adminPath -DependencyFingerprint $dependencyOne -EnvironmentPath $environmentPath
  Assert-True ($buildOne -ne $sourceChanged) "source content must affect the build fingerprint"
  [System.IO.File]::WriteAllText((Join-Path $sourcePath "page.ts"), 'export const value = 1;')
  [System.IO.File]::WriteAllText($environmentPath, "AUTH_SECRET=a-different-secret")
  $environmentChanged = Get-BuildFingerprint -AdminPath $adminPath -DependencyFingerprint $dependencyOne -EnvironmentPath $environmentPath
  Assert-True ($buildOne -ne $environmentChanged) "environment content must affect the build fingerprint"

  Assert-True (Test-PathContained -ParentPath $adminPath -ChildPath (Join-Path $adminPath "src\page.ts")) "a child path must be contained"
  Assert-True (-not (Test-PathContained -ParentPath $adminPath -ChildPath (Join-Path $testRoot "admin-evil\page.ts"))) "prefix collisions must not count as containment"
  Assert-True (-not (Test-ManagedLauncherState -State $null -ArtifactsRoot $testRoot -ExpectedPort 3199)) "a first launch without state must be unmanaged"

  $jsonPath = Join-Path $testRoot "state.json"
  Write-JsonFileAtomic -Path $jsonPath -Value ([ordered]@{ version = 1 })
  Write-JsonFileAtomic -Path $jsonPath -Value ([ordered]@{ version = 2 })
  Assert-Equal 2 (Read-JsonFile -Path $jsonPath).version "atomic JSON state must support replacement"

  $serverPath = Join-Path $testRoot "artifact with spaces\server.js"
  New-Item -ItemType Directory -Path (Split-Path -Parent $serverPath) | Out-Null
  [System.IO.File]::WriteAllText($serverPath, "")
  $commandLine = '"' + $nodePath + '" "' + $serverPath + '"'
  Assert-True (Test-LauncherProcessIdentity -ExpectedNodePath $nodePath -ExpectedServerPath $serverPath -ActualExecutablePath $nodePath -ActualCommandLine $commandLine) "the exact node/server command identity must match"
  Assert-True (-not (Test-LauncherProcessIdentity -ExpectedNodePath $nodePath -ExpectedServerPath $serverPath -ActualExecutablePath $nodePath -ActualCommandLine ($commandLine + ".evil"))) "a server-path prefix collision must not match"

  $physicalTarget = Join-Path $testRoot "physical-target"
  New-Item -ItemType Directory -Path $physicalTarget | Out-Null
  New-Item -ItemType Junction -Path $junctionPath -Target $physicalTarget | Out-Null
  Assert-Equal (Resolve-PhysicalPath $physicalTarget) (Resolve-PhysicalPath $junctionPath) "junctions must resolve to their physical target"
  Remove-Item -LiteralPath $junctionPath -Force

  $lockPath = Join-Path $testRoot "launcher.lock"
  $firstLock = Enter-LauncherLock -Path $lockPath -TimeoutSeconds 1
  try {
    $secondWasRejected = $false
    try { $null = Enter-LauncherLock -Path $lockPath -TimeoutSeconds 0 } catch { $secondWasRejected = $true }
    Assert-True $secondWasRejected "a concurrent launcher lock must be rejected"
  } finally {
    $firstLock.Dispose()
  }

  Write-Host "Launcher core tests passed."
} finally {
  if (Test-Path -LiteralPath $junctionPath) { Remove-Item -LiteralPath $junctionPath -Force }
  $safeTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
  if (Test-PathContained -ParentPath $safeTempRoot -ChildPath $testRoot) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
