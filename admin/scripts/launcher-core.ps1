$ErrorActionPreference = "Stop"

if (-not ("LilPolaris.LauncherNative" -as [type])) {
  Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
using System.Text;

namespace LilPolaris {
  public static class LauncherNative {
    private const uint FILE_READ_ATTRIBUTES = 0x80;
    private const uint FILE_SHARE_READ = 0x1;
    private const uint FILE_SHARE_WRITE = 0x2;
    private const uint FILE_SHARE_DELETE = 0x4;
    private const uint OPEN_EXISTING = 3;
    private const uint FILE_FLAG_BACKUP_SEMANTICS = 0x02000000;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(
      string fileName,
      uint desiredAccess,
      uint shareMode,
      IntPtr securityAttributes,
      uint creationDisposition,
      uint flagsAndAttributes,
      IntPtr templateFile);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern uint GetFinalPathNameByHandleW(
      SafeFileHandle file,
      StringBuilder filePath,
      uint filePathLength,
      uint flags);

    [DllImport("shell32.dll", SetLastError = true)]
    private static extern IntPtr CommandLineToArgvW(
      [MarshalAs(UnmanagedType.LPWStr)] string commandLine,
      out int argumentCount);

    [DllImport("kernel32.dll")]
    private static extern IntPtr LocalFree(IntPtr memory);

    public static string GetFinalPath(string path) {
      using (SafeFileHandle handle = CreateFileW(
        path,
        FILE_READ_ATTRIBUTES,
        FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
        IntPtr.Zero,
        OPEN_EXISTING,
        FILE_FLAG_BACKUP_SEMANTICS,
        IntPtr.Zero)) {
        if (handle.IsInvalid) {
          throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not resolve physical path: " + path);
        }

        var buffer = new StringBuilder(512);
        uint length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, 0);
        if (length == 0) {
          throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not resolve physical path: " + path);
        }
        if (length >= buffer.Capacity) {
          buffer.Capacity = (int)length + 1;
          length = GetFinalPathNameByHandleW(handle, buffer, (uint)buffer.Capacity, 0);
          if (length == 0) {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not resolve physical path: " + path);
          }
        }

        string result = buffer.ToString();
        if (result.StartsWith(@"\\?\UNC\", StringComparison.OrdinalIgnoreCase)) {
          return @"\\" + result.Substring(8);
        }
        if (result.StartsWith(@"\\?\", StringComparison.OrdinalIgnoreCase)) {
          return result.Substring(4);
        }
        return result;
      }
    }

    public static string[] SplitCommandLine(string commandLine) {
      int count;
      IntPtr pointer = CommandLineToArgvW(commandLine, out count);
      if (pointer == IntPtr.Zero) {
        throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not parse process command line.");
      }
      try {
        var result = new string[count];
        for (int index = 0; index < count; index++) {
          IntPtr value = Marshal.ReadIntPtr(pointer, index * IntPtr.Size);
          result[index] = Marshal.PtrToStringUni(value);
        }
        return result;
      } finally {
        LocalFree(pointer);
      }
    }
  }
}
"@
}

function Resolve-PhysicalPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).ProviderPath
  return [LilPolaris.LauncherNative]::GetFinalPath($resolved)
}

function Test-PathContained {
  param(
    [Parameter(Mandatory = $true)][string]$ParentPath,
    [Parameter(Mandatory = $true)][string]$ChildPath
  )

  $parent = [System.IO.Path]::GetFullPath($ParentPath).TrimEnd('\', '/')
  $child = [System.IO.Path]::GetFullPath($ChildPath).TrimEnd('\', '/')
  if ([string]::Equals($parent, $child, [StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  return $child.StartsWith($parent + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)
}

function Get-Sha256Text {
  param([Parameter(Mandatory = $true)][AllowEmptyString()][string]$Text)

  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($Text)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
  } finally {
    $sha.Dispose()
  }
}

function Get-FileFingerprintRecord {
  param(
    [Parameter(Mandatory = $true)][string]$BasePath,
    [Parameter(Mandatory = $true)][string]$FilePath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath).TrimEnd('\', '/')
  $fileFull = [System.IO.Path]::GetFullPath($FilePath)
  if (-not (Test-PathContained -ParentPath $baseFull -ChildPath $fileFull)) {
    throw "Fingerprint input is outside the expected directory: $fileFull"
  }
  $relative = $fileFull.Substring($baseFull.Length).TrimStart('\', '/').Replace('\', '/')
  $file = Get-Item -LiteralPath $fileFull -ErrorAction Stop
  return [ordered]@{
    path = $relative
    length = $file.Length
    sha256 = (Get-FileHash -LiteralPath $fileFull -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

function Get-LauncherBuildInputFiles {
  param([Parameter(Mandatory = $true)][string]$AdminPath)

  $files = New-Object System.Collections.Generic.List[string]
  foreach ($directoryName in @("src", "public")) {
    $directory = Join-Path $AdminPath $directoryName
    if (Test-Path -LiteralPath $directory -PathType Container) {
      Get-ChildItem -LiteralPath $directory -File -Recurse -Force | ForEach-Object { $files.Add($_.FullName) }
    }
  }

  Get-ChildItem -LiteralPath $AdminPath -File -Force | Where-Object {
    $_.Name -match '^(next\.config\.|tsconfig.*\.json$|postcss\.config\.|tailwind\.config\.|eslint\.config\.|instrumentation\.|middleware\.)'
  } | ForEach-Object { $files.Add($_.FullName) }

  return @($files | Sort-Object -Unique)
}

function Get-DependencyFingerprint {
  param(
    [Parameter(Mandatory = $true)][string]$AdminPath,
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$NodeVersion,
    [Parameter(Mandatory = $true)][string]$NpmPath,
    [Parameter(Mandatory = $true)][string]$NpmVersion
  )

  $inputs = @()
  foreach ($name in @("package.json", "package-lock.json")) {
    $path = Join-Path $AdminPath $name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Missing dependency input: $path"
    }
    $inputs += ,(Get-FileFingerprintRecord -BasePath $AdminPath -FilePath $path)
  }

  $manifest = [ordered]@{
    schema = 1
    nodePath = [System.IO.Path]::GetFullPath($NodePath).ToLowerInvariant()
    nodeVersion = $NodeVersion.Trim()
    npmPath = [System.IO.Path]::GetFullPath($NpmPath).ToLowerInvariant()
    npmVersion = $NpmVersion.Trim()
    files = $inputs
  }
  return Get-Sha256Text -Text ($manifest | ConvertTo-Json -Depth 6 -Compress)
}

function Get-BuildFingerprint {
  param(
    [Parameter(Mandatory = $true)][string]$AdminPath,
    [Parameter(Mandatory = $true)][string]$DependencyFingerprint,
    [Parameter(Mandatory = $true)][string]$EnvironmentPath
  )

  $records = @()
  foreach ($path in (Get-LauncherBuildInputFiles -AdminPath $AdminPath)) {
    $records += ,(Get-FileFingerprintRecord -BasePath $AdminPath -FilePath $path)
  }

  $environmentHash = "missing"
  if (Test-Path -LiteralPath $EnvironmentPath -PathType Leaf) {
    $environmentHash = (Get-FileHash -LiteralPath $EnvironmentPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }

  # Only the final digest is returned. Neither environment values nor their direct hash are logged or persisted.
  $manifest = [ordered]@{
    schema = 1
    dependencyFingerprint = $DependencyFingerprint
    physicalAdminPath = [System.IO.Path]::GetFullPath($AdminPath).ToLowerInvariant()
    environmentHash = $environmentHash
    files = $records
  }
  return Get-Sha256Text -Text ($manifest | ConvertTo-Json -Depth 8 -Compress)
}

function Read-DotEnvFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  $values = @{}
  foreach ($rawLine in [System.IO.File]::ReadAllLines($Path)) {
    $line = $rawLine.Trim()
    if ($line.Length -eq 0 -or $line.StartsWith("#")) { continue }
    if ($line.StartsWith("export ")) { $line = $line.Substring(7).TrimStart() }
    $separator = $line.IndexOf('=')
    if ($separator -le 0) { continue }
    $name = $line.Substring(0, $separator).Trim()
    if ($name -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { continue }
    $value = $line.Substring($separator + 1).Trim()
    if ($value.Length -ge 2) {
      $first = $value[0]
      $last = $value[$value.Length - 1]
      if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $values[$name] = $value
  }
  return $values
}

function Test-LauncherProcessIdentity {
  param(
    [Parameter(Mandatory = $true)][string]$ExpectedNodePath,
    [Parameter(Mandatory = $true)][string]$ExpectedServerPath,
    [Parameter(Mandatory = $true)][string]$ActualExecutablePath,
    [Parameter(Mandatory = $true)][string]$ActualCommandLine
  )

  if ([string]::IsNullOrWhiteSpace($ActualExecutablePath) -or [string]::IsNullOrWhiteSpace($ActualCommandLine)) {
    return $false
  }
  $expectedNode = [System.IO.Path]::GetFullPath($ExpectedNodePath)
  $actualNode = [System.IO.Path]::GetFullPath($ActualExecutablePath)
  if (-not [string]::Equals($expectedNode, $actualNode, [StringComparison]::OrdinalIgnoreCase)) {
    return $false
  }

  try {
    $arguments = [LilPolaris.LauncherNative]::SplitCommandLine($ActualCommandLine)
  } catch {
    return $false
  }
  $expectedServer = [System.IO.Path]::GetFullPath($ExpectedServerPath)
  foreach ($argument in @($arguments | Select-Object -Skip 1)) {
    try {
      if ([string]::Equals($expectedServer, [System.IO.Path]::GetFullPath($argument), [StringComparison]::OrdinalIgnoreCase)) {
        return $true
      }
    } catch {
      continue
    }
  }
  return $false
}

function Enter-LauncherLock {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$TimeoutSeconds = 120
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ($true) {
    try {
      return [System.IO.File]::Open($Path, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    } catch [System.IO.IOException] {
      if ([DateTime]::UtcNow -ge $deadline) {
        throw "Another launcher is still running (lock timeout: $Path)."
      }
      Start-Sleep -Milliseconds 250
    }
  }
}

function Write-LauncherLog {
  param(
    [Parameter(Mandatory = $true)][string]$LogPath,
    [Parameter(Mandatory = $true)][string]$Message,
    [ValidateSet("INFO", "WARN", "ERROR")][string]$Level = "INFO"
  )

  $line = "{0} [{1}] {2}" -f [DateTime]::UtcNow.ToString("o"), $Level, $Message
  Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
  Write-Host $line
}

function Invoke-LoggedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$Arguments = @(),
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$LogPath,
    [Parameter(Mandatory = $true)][string]$Label
  )

  $logDirectory = Split-Path -Parent $LogPath
  $stdoutPath = Join-Path $logDirectory ("command-{0}.stdout.tmp" -f [Guid]::NewGuid().ToString("N"))
  $stderrPath = Join-Path $logDirectory ("command-{0}.stderr.tmp" -f [Guid]::NewGuid().ToString("N"))
  Write-LauncherLog -LogPath $LogPath -Message ("Starting {0}." -f $Label)
  try {
    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Wait -PassThru
    foreach ($stream in @($stdoutPath, $stderrPath)) {
      if (Test-Path -LiteralPath $stream) {
        Get-Content -LiteralPath $stream -ErrorAction SilentlyContinue | Add-Content -LiteralPath $LogPath -Encoding UTF8
      }
    }
    Write-LauncherLog -LogPath $LogPath -Message ("{0} exited with code {1}." -f $Label, $process.ExitCode)
    return $process.ExitCode
  } finally {
    Remove-Item -LiteralPath $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function Read-JsonFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
  try {
    return Get-Content -Raw -LiteralPath $Path | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Write-JsonFileAtomic {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Value
  )

  $directory = Split-Path -Parent $Path
  $temporary = Join-Path $directory (".{0}.{1}.tmp" -f ([System.IO.Path]::GetFileName($Path)), [Guid]::NewGuid().ToString("N"))
  $backup = Join-Path $directory (".{0}.{1}.bak" -f ([System.IO.Path]::GetFileName($Path)), [Guid]::NewGuid().ToString("N"))
  $replaced = $false
  $json = $Value | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($temporary, $json, (New-Object System.Text.UTF8Encoding($false)))
  try {
    if (Test-Path -LiteralPath $Path) {
      [System.IO.File]::Replace($temporary, $Path, $backup)
      $replaced = $true
    } else {
      [System.IO.File]::Move($temporary, $Path)
    }
  } finally {
    Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue
    if ($replaced) {
      Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    }
  }
}

function Get-FreeTcpPort {
  $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
  try {
    $listener.Start()
    return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Get-ListeningProcessIds {
  param([Parameter(Mandatory = $true)][int]$Port)

  try {
    return @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique)
  } catch [Microsoft.PowerShell.Cmdletization.Cim.CimJobException] {
    return @()
  } catch [Microsoft.Management.Infrastructure.CimException] {
    return @()
  }
}

function Wait-PortFree {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [int]$TimeoutSeconds = 15
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    if (@(Get-ListeningProcessIds -Port $Port).Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Get-ArtifactMetadata {
  param(
    [Parameter(Mandatory = $true)][string]$ArtifactsRoot,
    [Parameter(Mandatory = $true)][string]$ArtifactPath
  )

  if (-not (Test-PathContained -ParentPath $ArtifactsRoot -ChildPath $ArtifactPath)) { return $null }
  if (-not (Test-Path -LiteralPath $ArtifactPath -PathType Container)) { return $null }
  $metadata = Read-JsonFile -Path (Join-Path $ArtifactPath "launcher-artifact.json")
  if ($null -eq $metadata) { return $null }
  if (-not (Test-Path -LiteralPath (Join-Path $ArtifactPath "server.js") -PathType Leaf)) { return $null }
  if ([string]::IsNullOrWhiteSpace([string]$metadata.buildFingerprint) -or [string]::IsNullOrWhiteSpace([string]$metadata.buildId)) { return $null }
  if (-not [string]::Equals((Split-Path -Leaf $ArtifactPath), [string]$metadata.buildFingerprint, [StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $metadata
}

function Wait-LauncherHealth {
  param(
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$InstanceId,
    [Parameter(Mandatory = $true)][string]$BuildFingerprint,
    [Parameter(Mandatory = $true)][string]$BuildId,
    [int]$TimeoutSeconds = 40
  )

  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $url = "http://127.0.0.1:$Port/api/launcher/health"
  do {
    try {
      $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 2 -UseBasicParsing
      if ($response.status -eq "healthy" -and
          $response.instanceId -eq $InstanceId -and
          $response.buildFingerprint -eq $BuildFingerprint -and
          $response.buildId -eq $BuildId) {
        return $true
      }
    } catch {
      # The standalone server commonly refuses connections while it is booting.
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  return $false
}

function Test-ManagedLauncherState {
  param(
    $State,
    [Parameter(Mandatory = $true)][string]$ArtifactsRoot,
    [Parameter(Mandatory = $true)][int]$ExpectedPort
  )

  if ($null -eq $State -or [int]$State.schemaVersion -ne 1 -or [int]$State.port -ne $ExpectedPort) { return $false }
  $metadata = Get-ArtifactMetadata -ArtifactsRoot $ArtifactsRoot -ArtifactPath ([string]$State.artifactPath)
  if ($null -eq $metadata) { return $false }
  if ($metadata.buildFingerprint -ne $State.buildFingerprint -or $metadata.buildId -ne $State.buildId) { return $false }
  if (-not (Test-Path -LiteralPath ([string]$State.nodePath) -PathType Leaf)) { return $false }

  try {
    $process = Get-Process -Id ([int]$State.pid) -ErrorAction Stop
    if ([long]$process.StartTime.ToUniversalTime().Ticks -ne [long]$State.processStartTimeUtcTicks) { return $false }
    $cim = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f [int]$State.pid) -ErrorAction Stop
    if (-not (Test-LauncherProcessIdentity -ExpectedNodePath ([string]$State.nodePath) -ExpectedServerPath (Join-Path ([string]$State.artifactPath) "server.js") -ActualExecutablePath ([string]$cim.ExecutablePath) -ActualCommandLine ([string]$cim.CommandLine))) {
      return $false
    }
    if (@(Get-ListeningProcessIds -Port $ExpectedPort) -notcontains [int]$State.pid) { return $false }
    return Wait-LauncherHealth -Port $ExpectedPort -InstanceId ([string]$State.instanceId) -BuildFingerprint ([string]$State.buildFingerprint) -BuildId ([string]$State.buildId) -TimeoutSeconds 3
  } catch {
    return $false
  }
}

function Test-OwnedLauncherProcess {
  param([Parameter(Mandatory = $true)]$State)

  try {
    $process = Get-Process -Id ([int]$State.pid) -ErrorAction Stop
    if ([long]$process.StartTime.ToUniversalTime().Ticks -ne [long]$State.processStartTimeUtcTicks) { return $false }
    $cim = Get-CimInstance Win32_Process -Filter ("ProcessId={0}" -f [int]$State.pid) -ErrorAction Stop
    return Test-LauncherProcessIdentity -ExpectedNodePath ([string]$State.nodePath) -ExpectedServerPath (Join-Path ([string]$State.artifactPath) "server.js") -ActualExecutablePath ([string]$cim.ExecutablePath) -ActualCommandLine ([string]$cim.CommandLine)
  } catch {
    return $false
  }
}

function Stop-OwnedLauncherProcess {
  param([Parameter(Mandatory = $true)]$State)

  if (-not (Test-OwnedLauncherProcess -State $State)) {
    throw "Refusing to stop PID $($State.pid): its start time or command identity no longer matches launcher state."
  }
  Stop-Process -Id ([int]$State.pid) -Force -ErrorAction Stop
  try { Wait-Process -Id ([int]$State.pid) -Timeout 10 -ErrorAction SilentlyContinue } catch { }
}

function Start-LauncherServer {
  param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$ArtifactPath,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$InstanceId,
    [Parameter(Mandatory = $true)][string]$BuildFingerprint,
    [Parameter(Mandatory = $true)][string]$BuildId,
    [Parameter(Mandatory = $true)][hashtable]$DotEnv,
    [Parameter(Mandatory = $true)][string]$LogsPath
  )

  $serverPath = Join-Path $ArtifactPath "server.js"
  $stdoutPath = Join-Path $LogsPath ("server-{0}.stdout.log" -f $InstanceId)
  $stderrPath = Join-Path $LogsPath ("server-{0}.stderr.log" -f $InstanceId)
  $environment = @{}
  foreach ($key in $DotEnv.Keys) { $environment[$key] = [string]$DotEnv[$key] }
  $environment["NODE_ENV"] = "production"
  $environment["HOSTNAME"] = "127.0.0.1"
  $environment["PORT"] = [string]$Port
  $environment["LILPOLARIS_LAUNCHER"] = "1"
  $environment["LILPOLARIS_LAUNCHER_INSTANCE_ID"] = $InstanceId
  $environment["LILPOLARIS_LAUNCHER_BUILD_FINGERPRINT"] = $BuildFingerprint
  $environment["LILPOLARIS_LAUNCHER_BUILD_ID"] = $BuildId

  $backup = @{}
  foreach ($key in $environment.Keys) {
    $backup[$key] = [Environment]::GetEnvironmentVariable($key, [EnvironmentVariableTarget]::Process)
    [Environment]::SetEnvironmentVariable($key, $environment[$key], [EnvironmentVariableTarget]::Process)
  }
  try {
    $argument = '"' + $serverPath.Replace('"', '\"') + '"'
    $process = Start-Process -FilePath $NodePath -ArgumentList $argument -WorkingDirectory $ArtifactPath -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    $startTicks = [long]$process.StartTime.ToUniversalTime().Ticks
  } finally {
    foreach ($key in $environment.Keys) {
      [Environment]::SetEnvironmentVariable($key, $backup[$key], [EnvironmentVariableTarget]::Process)
    }
  }

  return [pscustomobject]@{
    schemaVersion = 1
    pid = $process.Id
    processStartTimeUtcTicks = $startTicks
    nodePath = [System.IO.Path]::GetFullPath($NodePath)
    artifactPath = [System.IO.Path]::GetFullPath($ArtifactPath)
    instanceId = $InstanceId
    buildFingerprint = $BuildFingerprint
    buildId = $BuildId
    port = $Port
    startedAtUtc = [DateTime]::UtcNow.ToString("o")
    stdoutLog = $stdoutPath
    stderrLog = $stderrPath
  }
}

function Get-RollbackCandidate {
  param(
    $State,
    [Parameter(Mandatory = $true)][string]$ArtifactsRoot
  )

  if ($null -eq $State) { return $null }
  $metadata = Get-ArtifactMetadata -ArtifactsRoot $ArtifactsRoot -ArtifactPath ([string]$State.artifactPath)
  if ($null -eq $metadata) { return $null }
  if ($metadata.buildFingerprint -ne $State.buildFingerprint -or $metadata.buildId -ne $State.buildId) { return $null }
  return [pscustomobject]@{
    artifactPath = [string]$State.artifactPath
    buildFingerprint = [string]$State.buildFingerprint
    buildId = [string]$State.buildId
  }
}
