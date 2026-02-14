# tools/export_artifacts_bundle.ps1
[CmdletBinding()]
param(
  [string]$EXEC_ID,
  [string]$SESSION_ID,
  [string]$artifacts_DIR
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if (-not $root) { throw "Not a git repo (cannot resolve repo root)." }
  return ($root.Trim() -replace "/","\")
}

function Get-SHA256Hex {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  $h = Get-FileHash -Algorithm SHA256 -Path $Path
  return ($h.Hash.ToLowerInvariant())
}

function Get-LatestArtifactsDir {
  param([string]$RepoRoot)

  $artifactsRoot = Join-Path $RepoRoot "_artifacts"
  if (-not (Test-Path $artifactsRoot)) { throw "Missing _artifacts/ folder at: $artifactsRoot" }

  $execDirs = Get-ChildItem -Path $artifactsRoot -Directory -Filter "exec_*" -ErrorAction Stop
  if (-not $execDirs -or $execDirs.Count -eq 0) { throw "No exec_* artifacts dirs found under: $artifactsRoot" }

  # Find newest session dir across build/milestone
  $candidates = @()
  foreach ($ed in $execDirs) {
    foreach ($m in @("build","milestone")) {
      $modeDir = Join-Path $ed.FullName $m
      if (Test-Path $modeDir) {
        Get-ChildItem -Path $modeDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          $candidates += [pscustomobject]@{
            ExecDir   = $ed.FullName
            ExecName  = $ed.Name
            Mode      = $m
            SessionDir= $_.FullName
            SessionId = $_.Name
            LastWrite = $_.LastWriteTimeUtc
          }
        }
      }
    }
  }
  if ($candidates.Count -eq 0) { throw "No artifacts session dirs found under any exec_*/(build|milestone)." }

  $latest = $candidates | Sort-Object LastWrite -Descending | Select-Object -First 1
  return $latest
}

$repoRoot = Get-RepoRoot
$headCommit = (git rev-parse HEAD).Trim()
$utcNow = (Get-Date).ToUniversalTime().ToString("o")

# Resolve artifacts directory
$artifactsSelection = $null
if ($EXEC_ID -and $SESSION_ID -and $artifacts_DIR) {
  # Use provided artifacts_DIR directly
  if (-not (Test-Path $artifacts_DIR)) { throw "Artifacts dir not found: $artifacts_DIR" }
  $artifactsSelection = [pscustomobject]@{ 
    ExecId = $EXEC_ID
    SessionId = $SESSION_ID
    SessionDir = $artifacts_DIR
  }
}
elseif ($EXEC_ID -and $SESSION_ID) {
  # Try to find the artifacts dir from EXEC_ID and SESSION_ID
  $foundDir = $null
  foreach ($m in @("build","milestone")) {
    $testDir = Join-Path $repoRoot ("_artifacts\exec_{0}\{1}\{2}" -f $EXEC_ID, $m, $SESSION_ID)
    if (Test-Path $testDir) {
      $foundDir = $testDir
      break
    }
  }
  if (-not $foundDir) { throw "Could not find artifacts dir for EXEC_ID=$EXEC_ID SESSION_ID=$SESSION_ID" }
  $artifactsSelection = [pscustomobject]@{ 
    ExecId = $EXEC_ID
    SessionId = $SESSION_ID
    SessionDir = $foundDir
  }
}
else {
  # Use latest artifacts directory
  $latest = Get-LatestArtifactsDir -RepoRoot $repoRoot
  $execIdParsed = $latest.ExecName -replace "^exec_",""
  $artifactsSelection = [pscustomobject]@{ 
    ExecId = $execIdParsed
    SessionId = $latest.SessionId
    SessionDir = $latest.SessionDir
  }
}

$execIdFinal = $artifactsSelection.ExecId
$sessionIdFinal = $artifactsSelection.SessionId
$artifactsDirFinal = $artifactsSelection.SessionDir

# Bundle output paths
$bundlesDir = Join-Path $repoRoot "_artifacts\bundles"
if (-not (Test-Path $bundlesDir)) { New-Item -ItemType Directory -Path $bundlesDir | Out-Null }

$baseName = ("exec_{0}____{1}" -f $execIdFinal, $sessionIdFinal)
$zipPath = Join-Path $bundlesDir ($baseName + ".zip")
$manifestPath = Join-Path $bundlesDir ($baseName + ".manifest.json")

# Enumerate files to include (all files under artifacts dir)
$files = Get-ChildItem -Path $artifactsDirFinal -Recurse -File | Sort-Object FullName

$fileEntries = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($artifactsDirFinal.Length).TrimStart("\")
  $sha = Get-SHA256Hex -Path $f.FullName
  $fileEntries += [pscustomobject]@{
    path   = ($rel -replace "\\","/")
    bytes  = [int64]$f.Length
    sha256 = $sha
  }
}

# Build manifest object with stable ordering
$manifest = [ordered]@{
  exec_id        = $execIdFinal
  session_id     = $sessionIdFinal
  repo_root      = ($repoRoot -replace "\\","/")
  head_commit    = $headCommit
  created_at_utc = $utcNow
  artifacts_dir  = ($artifactsDirFinal -replace "\\","/")
  files          = $fileEntries
}

$manifestJson = ($manifest | ConvertTo-Json -Depth 6)
[System.IO.File]::WriteAllText($manifestPath, $manifestJson)

# Create a stable snapshot folder, then zip the snapshot (avoids locked writers)
$tmpRoot = Join-Path $env:TEMP "ngks_execledger_bundle"
if (-not (Test-Path $tmpRoot)) { New-Item -ItemType Directory -Path $tmpRoot | Out-Null }

$snapshotDir = Join-Path $tmpRoot ("snapshot_{0}" -f ([guid]::NewGuid().ToString("N")))
New-Item -ItemType Directory -Path $snapshotDir | Out-Null

# Copy files one-by-one with retry to tolerate brief locks
foreach ($f in $files) {
  $rel = $f.FullName.Substring($artifactsDirFinal.Length).TrimStart("\")
  $dst = Join-Path $snapshotDir $rel
  $dstDir = Split-Path -Parent $dst
  if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }

  $ok = $false
  for ($i=0; $i -lt 10; $i++) {
    try {
      Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
      $ok = $true
      break
    } catch {
      Start-Sleep -Milliseconds 200
    }
  }
  if (-not $ok) { throw "Failed to copy locked file into snapshot: $($f.FullName)" }
}

# Zip the snapshot directory contents
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $snapshotDir "*") -DestinationPath $zipPath -Force

# Required file paths for latest.json
$summaryPath = Join-Path $artifactsDirFinal "summary.txt"
$reportPath = Join-Path $artifactsDirFinal "report.txt"
$diffNameOnlyPath = Join-Path $artifactsDirFinal "diff_name_only.txt"
$statusPath = Join-Path $artifactsDirFinal "status.txt"
$compileLogPath = Join-Path $artifactsDirFinal "compile.txt"

# Phase 16: Generate integrity.json with SHA256 hashes
$integrityPath = Join-Path $bundlesDir "integrity.json"
$integrity = [ordered]@{
  exec_id      = $execIdFinal
  session_id   = $sessionIdFinal
  created_at   = $utcNow
  hashes       = [ordered]@{
    summary        = Get-SHA256Hex -Path $summaryPath
    report         = Get-SHA256Hex -Path $reportPath
    diff_name_only = Get-SHA256Hex -Path $diffNameOnlyPath
    status         = Get-SHA256Hex -Path $statusPath
    compile        = Get-SHA256Hex -Path $compileLogPath
  }
}
$integrityJson = ($integrity | ConvertTo-Json -Depth 3)
[System.IO.File]::WriteAllText($integrityPath, $integrityJson)

# Create/update latest.json with all required fields
$latestPointerPath = Join-Path $bundlesDir "latest.json"
$latestPointer = [ordered]@{
  exec_id             = $execIdFinal
  session_id          = $sessionIdFinal
  zip_path            = ($zipPath -replace "\\","/")
  manifest_path       = ($manifestPath -replace "\\","/")
  created_at          = $utcNow
  artifacts_dir       = ($artifactsDirFinal -replace "\\","/")
  summary_path        = ($summaryPath -replace "\\","/")
  report_path         = ($reportPath -replace "\\","/")
  diff_name_only_path = ($diffNameOnlyPath -replace "\\","/")
  status_path         = ($statusPath -replace "\\","/")
  compile_log_path    = ($compileLogPath -replace "\\","/")
  integrity_path      = ($integrityPath -replace "\\","/")
}
$latestPointerJson = ($latestPointer | ConvertTo-Json -Depth 2)
[System.IO.File]::WriteAllText($latestPointerPath, $latestPointerJson)

# Cleanup temp directory
Remove-Item -Path $snapshotDir -Recurse -Force

Write-Host "BUNDLE_OK=True"
Write-Host ("EXEC_ID={0}" -f $execIdFinal)
Write-Host ("SESSION_ID={0}" -f $sessionIdFinal)
Write-Host ("artifacts_DIR={0}" -f ($artifactsDirFinal -replace "\\","/"))
Write-Host ("ZIP={0}" -f ($zipPath -replace "\\","/"))
Write-Host ("MANIFEST={0}" -f ($manifestPath -replace "\\","/"))
Write-Host ("LATEST={0}" -f ($latestPointerPath -replace "\\","/"))
Write-Host ("INTEGRITY={0}" -f ($integrityPath -replace "\\","/"))