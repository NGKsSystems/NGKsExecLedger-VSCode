# tools/export_artifacts_bundle.ps1
[CmdletBinding()]
param(
  [string]$ExecId,
  [string]$SessionId,
  [ValidateSet("Build","Milestone")]
  [string]$Mode,
  [string]$OutputRoot = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if (-not $root) { throw "Not a git repo (cannot resolve repo root)." }
  return ($root.Trim() -replace "\\","/")
}

function Get-LatestartifactsDir {
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

function Get-SHA256Hex {
  param([string]$Path)
  $h = Get-FileHash -Algorithm SHA256 -Path $Path
  return ($h.Hash.ToLowerInvariant())
}

function Read-GateResultFromSummaryText {
  param([string]$SummaryPath)
  # Parse the tail "==== SUMMARY ====" file content to detect gate results if present
  # Fallback to empty list if cannot infer.
  $lines = Get-Content -Path $SummaryPath -ErrorAction Stop
  $gates = @()
  foreach ($ln in $lines) {
    if ($ln -match "^(VERIFY_[0-9_]+_OK)=(True|False)$") {
      $gates += [pscustomobject]@{ name=$matches[1]; ok=($matches[2] -eq "True") }
    }
    if ($ln -match "^COMPILE_OK=(True|False)$") {
      $gates += [pscustomobject]@{ name="COMPILE_OK"; ok=($matches[1] -eq "True") }
    }
  }
  return $gates
}

$repoRoot = Get-RepoRoot
$repoRootWin = ($repoRoot -replace "/","\")

$headCommit = (git rev-parse HEAD).Trim()
$utcNow = (Get-Date).ToUniversalTime().ToString("o")

# Resolve artifacts dir
$artifactsSelection = $null
if ($ExecId -and $SessionId -and $Mode) {
  $modeLower = $Mode.ToLowerInvariant()
  $artifactsDir = Join-Path $repoRootWin ("_artifacts\exec_{0}\{1}\{2}" -f $ExecId, $modeLower, $SessionId)
  if (-not (Test-Path $artifactsDir)) { throw "artifacts dir not found: $artifactsDir" }
  $artifactsSelection = [pscustomobject]@{ ExecName="exec_$ExecId"; ExecId=$ExecId; Mode=$modeLower; SessionId=$SessionId; SessionDir=$artifactsDir }
}
elseif ($ExecId -and $Mode -and -not $SessionId) {
  $modeLower = $Mode.ToLowerInvariant() 
  $execDir = Join-Path $repoRootWin ("_artifacts\exec_{0}\{1}" -f $ExecId, $modeLower)
  if (-not (Test-Path $execDir)) { throw "Exec/mode dir not found: $execDir" }
  $sessions = Get-ChildItem -Path $execDir -Directory | Sort-Object LastWriteTimeUtc -Descending
  if (-not $sessions -or $sessions.Count -eq 0) { throw "No sessions found under: $execDir" }
  $artifactsSelection = [pscustomobject]@{ ExecName="exec_$ExecId"; ExecId=$ExecId; Mode=$modeLower; SessionId=$sessions[0].Name; SessionDir=$sessions[0].FullName }
}
else {
  $latest = Get-LatestartifactsDir -RepoRoot $repoRootWin
  $execIdParsed = $latest.ExecName -replace "^exec_",""
  $artifactsSelection = [pscustomobject]@{ ExecName=$latest.ExecName; ExecId=$execIdParsed; Mode=$latest.Mode; SessionId=$latest.SessionId; SessionDir=$latest.SessionDir }
}

$execIdFinal = $artifactsSelection.ExecId
$sessionIdFinal = $artifactsSelection.SessionId
$modeFinal = $artifactsSelection.Mode
$artifactsDirFinal = $artifactsSelection.SessionDir

# Bundle output paths
if ($OutputRoot -and $OutputRoot.Trim()) {
  $bundlesDir = Join-Path $OutputRoot.Trim() "bundles"
} else {
  $bundlesDir = Join-Path $repoRootWin "_artifacts\bundles"
}
if (-not (Test-Path $bundlesDir)) { New-Item -ItemType Directory -Path $bundlesDir | Out-Null }

$baseName = ("exec_{0}__{1}__{2}" -f $execIdFinal, $modeFinal, $sessionIdFinal)
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

# Basic gates info - simplified for now
$gates = @()
$failReasons = $null

# If a verify_*.txt contains "==== SUMMARY ====" we can parse; otherwise leave minimal.
$summaryCandidates = @()
$summaryCandidates += Join-Path $artifactsDirFinal "verify_3_7.txt"
$summaryCandidates += Join-Path $artifactsDirFinal "verify_3_8.txt"
$summaryCandidates += Join-Path $artifactsDirFinal "verify_3_9.txt"
$summaryCandidates += Join-Path $artifactsDirFinal "compile.txt"
$summaryCandidates = $summaryCandidates | Where-Object { Test-Path $_ }

foreach ($sc in $summaryCandidates) {
  $gates += (Read-GateResultFromSummaryText -SummaryPath $sc)
}

# De-dup by name (last wins)
$gatesByName = @{}
foreach ($g in $gates) { $gatesByName[$g.name] = $g.ok }
$gatesOut = @()
foreach ($k in ($gatesByName.Keys | Sort-Object)) {
  $gatesOut += [pscustomobject]@{ name=$k; ok=[bool]$gatesByName[$k] }
}

# Build manifest object with stable ordering
$manifest = [ordered]@{
  exec_id        = $execIdFinal
  session_id     = $sessionIdFinal
  mode           = $modeFinal
  repo_root      = $repoRoot
  head_commit    = $headCommit
  created_at_utc = $utcNow
  artifacts_dir      = ($artifactsDirFinal -replace "\\","/")
  fail_reasons   = $null
  gates          = $gatesOut
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

# Create path variables for pointer and integrity
$latestPointerPath = Join-Path $bundlesDir "latest.json"
$summaryPath = Join-Path $artifactsDirFinal "summary.txt"
$reportPath = Join-Path $artifactsDirFinal "report.txt"

# Phase 16: Generate integrity.json with SHA256 hashes
$integrityPath = Join-Path $bundlesDir "integrity.json"
$integrity = [ordered]@{
  exec_id      = $execIdFinal
  session_id   = $sessionIdFinal
  mode         = $modeFinal
  created_at   = $utcNow
  hashes       = [ordered]@{
    summary  = if (Test-Path $summaryPath) { Get-SHA256Hex -Path $summaryPath } else { $null }
    report   = if (Test-Path $reportPath) { Get-SHA256Hex -Path $reportPath } else { $null }
    manifest = if (Test-Path $manifestPath) { Get-SHA256Hex -Path $manifestPath } else { $null }
  }
}
$integrityJson = ($integrity | ConvertTo-Json -Depth 3)
[System.IO.File]::WriteAllText($integrityPath, $integrityJson)

# Create/update latest bundle pointer with Phase 15 pointer paths
$diffNameOnlyPath = Join-Path $artifactsDirFinal "diff_name_only.txt"
$statusPath = Join-Path $artifactsDirFinal "status.txt"
$compileLogPath = Join-Path $artifactsDirFinal "compile.txt"
$latestPointer = [ordered]@{
  exec_id      = $execIdFinal
  session_id   = $sessionIdFinal
  mode         = $modeFinal
  zip_path     = ($zipPath -replace "\\","/")
  manifest_path = ($manifestPath -replace "\\","/")
  created_at   = $utcNow
  artifacts_dir    = ($artifactsDirFinal -replace "\\","/")
  summary_path = ($summaryPath -replace "\\","/")
  report_path  = ($reportPath -replace "\\","/")
  diff_name_only_path = ($diffNameOnlyPath -replace "\\","/")
  status_path  = ($statusPath -replace "\\","/")
  compile_log_path = ($compileLogPath -replace "\\","/")
  integrity_path = ($integrityPath -replace "\\","/")
}
$latestPointerJson = ($latestPointer | ConvertTo-Json -Depth 2)
[System.IO.File]::WriteAllText($latestPointerPath, $latestPointerJson)

Write-Host "BUNDLE_OK=True"
Write-Host ("EXEC_ID={0}" -f $execIdFinal)
Write-Host ("SESSION_ID={0}" -f $sessionIdFinal)
Write-Host ("MODE={0}" -f $modeFinal)
Write-Host ("artifacts_DIR={0}" -f ($artifactsDirFinal -replace "\\","/"))
Write-Host ("ZIP={0}" -f ($zipPath -replace "\\","/"))
Write-Host ("MANIFEST={0}" -f ($manifestPath -replace "\\","/"))
Write-Host ("LATEST={0}" -f ($latestPointerPath -replace "\\","/"))