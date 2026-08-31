[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)][int]$Port = 3199
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "launcher-core.ps1")

$repoRoot = Resolve-PhysicalPath (Join-Path $PSScriptRoot "..\..")
$adminPath = Join-Path $repoRoot "admin"
$environmentPath = Join-Path $adminPath ".env.local"
$launcherPath = Join-Path $adminPath ".launcher"
$artifactsRoot = Join-Path $launcherPath "artifacts"
$stagingRoot = Join-Path $launcherPath "staging"
$quarantineRoot = Join-Path $launcherPath "quarantine"
$logsPath = Join-Path $launcherPath "logs"
$statePath = Join-Path $launcherPath "state.json"
$dependencyStatePath = Join-Path $launcherPath "dependencies.json"
$lockPath = Join-Path $launcherPath "launcher.lock"

foreach ($directory in @($launcherPath, $artifactsRoot, $stagingRoot, $quarantineRoot, $logsPath)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$logPath = Join-Path $logsPath ("launcher-{0}.log" -f [DateTime]::UtcNow.ToString("yyyyMMdd-HHmmss-fff"))
$lock = $null
$readyUrl = "http://127.0.0.1:$Port"

function Get-ToolVersion {
  param([string]$FilePath, [string[]]$Arguments)
  $output = & $FilePath @Arguments 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Could not query tool version: $FilePath" }
  return (@($output) -join "`n").Trim()
}

function Ensure-Dependencies {
  param(
    [string]$NodePath,
    [string]$NodeVersion,
    [string]$NpmPath,
    [string]$NpmVersion
  )

  $fingerprint = Get-DependencyFingerprint -AdminPath $adminPath -NodePath $NodePath -NodeVersion $NodeVersion -NpmPath $NpmPath -NpmVersion $NpmVersion
  $saved = Read-JsonFile -Path $dependencyStatePath
  $nodeModules = Join-Path $adminPath "node_modules"
  $needsInstall = -not (Test-Path -LiteralPath $nodeModules -PathType Container)
  if ($null -eq $saved -or $saved.fingerprint -ne $fingerprint) { $needsInstall = $true }

  if (-not $needsInstall) {
    $exitCode = Invoke-LoggedProcess -FilePath $NpmPath -Arguments @("ls", "--depth=0") -WorkingDirectory $adminPath -LogPath $logPath -Label "npm dependency verification"
    if ($exitCode -ne 0) { $needsInstall = $true }
  }

  if ($needsInstall) {
    Write-LauncherLog -LogPath $logPath -Message "Dependencies changed, are missing, or failed npm verification; running npm ci."
    $exitCode = Invoke-LoggedProcess -FilePath $NpmPath -Arguments @("ci") -WorkingDirectory $adminPath -LogPath $logPath -Label "npm ci"
    if ($exitCode -ne 0) { throw "npm ci failed. See $logPath" }
    $exitCode = Invoke-LoggedProcess -FilePath $NpmPath -Arguments @("ls", "--depth=0") -WorkingDirectory $adminPath -LogPath $logPath -Label "post-install dependency verification"
    if ($exitCode -ne 0) { throw "npm dependencies remain invalid after npm ci. See $logPath" }
    Write-JsonFileAtomic -Path $dependencyStatePath -Value ([ordered]@{
      schemaVersion = 1
      fingerprint = $fingerprint
      verifiedAtUtc = [DateTime]::UtcNow.ToString("o")
    })
  }
  return $fingerprint
}

function Ensure-Artifact {
  param(
    [string]$BuildFingerprint,
    [string]$NpmPath
  )

  $artifactPath = Join-Path $artifactsRoot $BuildFingerprint
  $metadata = Get-ArtifactMetadata -ArtifactsRoot $artifactsRoot -ArtifactPath $artifactPath
  if ($null -ne $metadata -and $metadata.buildFingerprint -eq $BuildFingerprint) {
    Write-LauncherLog -LogPath $logPath -Message "Reusing standalone artifact $BuildFingerprint."
    return [pscustomobject]@{ path = $artifactPath; metadata = $metadata }
  }

  if (Test-Path -LiteralPath $artifactPath) {
    if (-not (Test-PathContained -ParentPath $artifactsRoot -ChildPath $artifactPath)) {
      throw "Refusing to quarantine an artifact outside the launcher artifact root."
    }
    $quarantinePath = Join-Path $quarantineRoot ("{0}-{1}" -f $BuildFingerprint, [Guid]::NewGuid().ToString("N"))
    Write-LauncherLog -LogPath $logPath -Level WARN -Message "Moving an incomplete artifact to launcher quarantine."
    Move-Item -LiteralPath $artifactPath -Destination $quarantinePath
  }

  Write-LauncherLog -LogPath $logPath -Message "Building standalone artifact $BuildFingerprint."
  $exitCode = Invoke-LoggedProcess -FilePath $NpmPath -Arguments @("run", "build") -WorkingDirectory $adminPath -LogPath $logPath -Label "Next.js production build"
  if ($exitCode -ne 0) { throw "Next.js build failed. See $logPath" }

  $standalonePath = Join-Path $adminPath ".next\standalone"
  $buildIdPath = Join-Path $adminPath ".next\BUILD_ID"
  if (-not (Test-Path -LiteralPath (Join-Path $standalonePath "server.js") -PathType Leaf)) {
    throw "The Next.js standalone output does not contain server.js."
  }
  if (-not (Test-Path -LiteralPath $buildIdPath -PathType Leaf)) {
    throw "The Next.js build did not produce BUILD_ID."
  }
  $buildId = (Get-Content -Raw -LiteralPath $buildIdPath).Trim()
  $stagingPath = Join-Path $stagingRoot ([Guid]::NewGuid().ToString("N"))
  if (-not (Test-PathContained -ParentPath $stagingRoot -ChildPath $stagingPath)) {
    throw "Refusing to use a staging directory outside the launcher root."
  }

  New-Item -ItemType Directory -Path $stagingPath | Out-Null
  try {
    Get-ChildItem -LiteralPath $standalonePath -Force | ForEach-Object {
      Copy-Item -LiteralPath $_.FullName -Destination $stagingPath -Recurse -Force
    }

    $staticSource = Join-Path $adminPath ".next\static"
    if (Test-Path -LiteralPath $staticSource -PathType Container) {
      $nextDestination = Join-Path $stagingPath ".next"
      New-Item -ItemType Directory -Path $nextDestination -Force | Out-Null
      Copy-Item -LiteralPath $staticSource -Destination (Join-Path $nextDestination "static") -Recurse -Force
    }
    $publicSource = Join-Path $adminPath "public"
    if (Test-Path -LiteralPath $publicSource -PathType Container) {
      Copy-Item -LiteralPath $publicSource -Destination (Join-Path $stagingPath "public") -Recurse -Force
    }

    Write-JsonFileAtomic -Path (Join-Path $stagingPath "launcher-artifact.json") -Value ([ordered]@{
      schemaVersion = 1
      buildFingerprint = $BuildFingerprint
      buildId = $buildId
      createdAtUtc = [DateTime]::UtcNow.ToString("o")
    })
    Move-Item -LiteralPath $stagingPath -Destination $artifactPath
  } finally {
    if (Test-Path -LiteralPath $stagingPath) {
      if (-not (Test-PathContained -ParentPath $stagingRoot -ChildPath $stagingPath)) {
        throw "Refusing to clean a staging directory outside the launcher root."
      }
      Remove-Item -LiteralPath $stagingPath -Recurse -Force
    }
  }

  $metadata = Get-ArtifactMetadata -ArtifactsRoot $artifactsRoot -ArtifactPath $artifactPath
  if ($null -eq $metadata) { throw "The versioned standalone artifact failed validation." }
  return [pscustomobject]@{ path = $artifactPath; metadata = $metadata }
}

function Start-And-Verify {
  param(
    [string]$ArtifactPath,
    [string]$BuildFingerprint,
    [string]$BuildId,
    [int]$ServerPort,
    [hashtable]$DotEnv,
    [string]$NodePath,
    [int]$TimeoutSeconds = 40
  )

  $instanceId = [Guid]::NewGuid().ToString("N")
  $state = Start-LauncherServer -NodePath $NodePath -ArtifactPath $ArtifactPath -Port $ServerPort -InstanceId $instanceId -BuildFingerprint $BuildFingerprint -BuildId $BuildId -DotEnv $DotEnv -LogsPath $logsPath
  if (-not (Wait-LauncherHealth -Port $ServerPort -InstanceId $instanceId -BuildFingerprint $BuildFingerprint -BuildId $BuildId -TimeoutSeconds $TimeoutSeconds)) {
    if (Test-OwnedLauncherProcess -State $state) { Stop-OwnedLauncherProcess -State $state }
    throw "Standalone health check failed on port $ServerPort. See $($state.stderrLog)"
  }
  return $state
}

try {
  $lock = Enter-LauncherLock -Path $lockPath
  Write-LauncherLog -LogPath $logPath -Message "Launcher acquired its exclusive lock for physical repository $repoRoot."

  $initialState = Read-JsonFile -Path $statePath
  $initialIsManaged = Test-ManagedLauncherState -State $initialState -ArtifactsRoot $artifactsRoot -ExpectedPort $Port
  $initialListeners = @(Get-ListeningProcessIds -Port $Port)
  if ($initialListeners.Count -gt 0 -and -not $initialIsManaged) {
    throw "Port $Port is already owned by an unrecognized process (PID: $($initialListeners -join ', ')). No install, build, reuse, or termination was attempted."
  }

  if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
    Write-LauncherLog -LogPath $logPath -Message "Local configuration is missing; starting the GitHub CLI configuration helper."
    & (Join-Path $PSScriptRoot "configure-local.ps1")
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
      throw "Local configuration could not be created."
    }
  }

  $nodeCommand = Get-Command node.exe -ErrorAction Stop
  $npmCommand = Get-Command npm.cmd -ErrorAction Stop
  $nodePath = Resolve-PhysicalPath $nodeCommand.Source
  $npmPath = Resolve-PhysicalPath $npmCommand.Source
  $nodeVersion = Get-ToolVersion -FilePath $nodePath -Arguments @("--version")
  $npmVersion = Get-ToolVersion -FilePath $npmPath -Arguments @("--version")
  $dependencyFingerprint = Ensure-Dependencies -NodePath $nodePath -NodeVersion $nodeVersion -NpmPath $npmPath -NpmVersion $npmVersion
  $buildFingerprint = Get-BuildFingerprint -AdminPath $adminPath -DependencyFingerprint $dependencyFingerprint -EnvironmentPath $environmentPath
  $artifact = Ensure-Artifact -BuildFingerprint $buildFingerprint -NpmPath $npmPath
  $dotEnv = Read-DotEnvFile -Path $environmentPath

  $previousState = Read-JsonFile -Path $statePath
  $currentIsManaged = Test-ManagedLauncherState -State $previousState -ArtifactsRoot $artifactsRoot -ExpectedPort $Port
  if ($currentIsManaged -and $previousState.buildFingerprint -eq $buildFingerprint) {
    Write-LauncherLog -LogPath $logPath -Message "Reusing healthy launcher instance $($previousState.instanceId) on port $Port."
  } else {
    $listeners = @(Get-ListeningProcessIds -Port $Port)
    if ($listeners.Count -gt 0 -and -not $currentIsManaged) {
      throw "Port $Port is owned by an unrecognized process (PID: $($listeners -join ', ')). The launcher will not stop or reuse it."
    }

    $smokePort = Get-FreeTcpPort
    Write-LauncherLog -LogPath $logPath -Message "Smoke-testing artifact $buildFingerprint on temporary port $smokePort."
    $smokeState = Start-And-Verify -ArtifactPath $artifact.path -BuildFingerprint $buildFingerprint -BuildId $artifact.metadata.buildId -ServerPort $smokePort -DotEnv $dotEnv -NodePath $nodePath
    Stop-OwnedLauncherProcess -State $smokeState
    if (-not (Wait-PortFree -Port $smokePort)) { throw "Temporary smoke-test port $smokePort did not close." }
    Write-LauncherLog -LogPath $logPath -Message "Temporary standalone smoke test passed."

    $rollbackCandidate = Get-RollbackCandidate -State $previousState -ArtifactsRoot $artifactsRoot
    if ($currentIsManaged) {
      Write-LauncherLog -LogPath $logPath -Message "Stopping the verified previous launcher instance $($previousState.instanceId)."
      Stop-OwnedLauncherProcess -State $previousState
      if (-not (Wait-PortFree -Port $Port)) { throw "Managed port $Port did not close after stopping the previous instance." }
    }

    $newState = $null
    try {
      Write-LauncherLog -LogPath $logPath -Message "Starting artifact $buildFingerprint on port $Port."
      $newState = Start-And-Verify -ArtifactPath $artifact.path -BuildFingerprint $buildFingerprint -BuildId $artifact.metadata.buildId -ServerPort $Port -DotEnv $dotEnv -NodePath $nodePath
      Write-JsonFileAtomic -Path $statePath -Value $newState
      Write-LauncherLog -LogPath $logPath -Message "Launcher instance $($newState.instanceId) is healthy and state.json is updated."
    } catch {
      $startError = $_
      if ($null -ne $newState -and (Test-OwnedLauncherProcess -State $newState)) {
        Stop-OwnedLauncherProcess -State $newState
        [void](Wait-PortFree -Port $Port)
      }
      if ($null -ne $rollbackCandidate) {
        Write-LauncherLog -LogPath $logPath -Level WARN -Message "Final startup failed; restoring the last successful artifact $($rollbackCandidate.buildFingerprint)."
        try {
          $rollbackState = Start-And-Verify -ArtifactPath $rollbackCandidate.artifactPath -BuildFingerprint $rollbackCandidate.buildFingerprint -BuildId $rollbackCandidate.buildId -ServerPort $Port -DotEnv $dotEnv -NodePath $nodePath
          Write-JsonFileAtomic -Path $statePath -Value $rollbackState
          Write-LauncherLog -LogPath $logPath -Level WARN -Message "Rollback instance $($rollbackState.instanceId) is healthy."
        } catch {
          Write-LauncherLog -LogPath $logPath -Level ERROR -Message "Rollback also failed: $($_.Exception.Message)"
        }
      }
      throw $startError
    }
  }
} catch {
  if ($null -ne $logPath) {
    Write-LauncherLog -LogPath $logPath -Level ERROR -Message $_.Exception.Message
  }
  Write-Error $_
  exit 1
} finally {
  if ($null -ne $lock) { $lock.Dispose() }
}

if (-not $env:LILPOLARIS_NO_BROWSER) {
  Start-Process $readyUrl
}
Write-Host "LilPolaris Blog Admin is ready at $readyUrl"
exit 0
