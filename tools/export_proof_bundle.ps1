# tools/export_proof_bundle.ps1
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

function Get-LatestProofDir {
  param([string]$RepoRoot)

  $proofRoot = Join-Path $RepoRoot "_proof"
  if (-not (Test-Path $proofRoot)) { throw "Missing _proof/ folder at: $proofRoot" }

  $execDirs = Get-ChildItem -Path $proofRoot -Directory -Filter "exec_*" -ErrorAction Stop
  if (-not $execDirs -or $execDirs.Count -eq 0) { throw "No exec_* proof dirs found under: $proofRoot" }

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
  if ($candidates.Count -eq 0) { throw "No proof session dirs found under any exec_*/(build|milestone)." }

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

# Resolve proof dir
$proofSelection = $null
if ($ExecId -and $SessionId -and $Mode) {
  $modeLower = $Mode.ToLowerInvariant()
  $proofDir = Join-Path $repoRootWin ("_proof\exec_{0}\{1}\{2}" -f $ExecId, $modeLower, $SessionId)
  if (-not (Test-Path $proofDir)) { throw "Proof dir not found: $proofDir" }
  $proofSelection = [pscustomobject]@{ ExecName="exec_$ExecId"; ExecId=$ExecId; Mode=$modeLower; SessionId=$SessionId; SessionDir=$proofDir }
}
elseif ($ExecId -and $Mode -and -not $SessionId) {
  $modeLower = $Mode.ToLowerInvariant() 
  $execDir = Join-Path $repoRootWin ("_proof\exec_{0}\{1}" -f $ExecId, $modeLower)
  if (-not (Test-Path $execDir)) { throw "Exec/mode dir not found: $execDir" }
  $sessions = Get-ChildItem -Path $execDir -Directory | Sort-Object LastWriteTimeUtc -Descending
  if (-not $sessions -or $sessions.Count -eq 0) { throw "No sessions found under: $execDir" }
  $proofSelection = [pscustomobject]@{ ExecName="exec_$ExecId"; ExecId=$ExecId; Mode=$modeLower; SessionId=$sessions[0].Name; SessionDir=$sessions[0].FullName }
}
else {
  $latest = Get-LatestProofDir -RepoRoot $repoRootWin
  $execIdParsed = $latest.ExecName -replace "^exec_",""
  $proofSelection = [pscustomobject]@{ ExecName=$latest.ExecName; ExecId=$execIdParsed; Mode=$latest.Mode; SessionId=$latest.SessionId; SessionDir=$latest.SessionDir }
}

$execIdFinal = $proofSelection.ExecId
$sessionIdFinal = $proofSelection.SessionId
$modeFinal = $proofSelection.Mode
$proofDirFinal = $proofSelection.SessionDir

# Bundle output paths
if ($OutputRoot -and $OutputRoot.Trim()) {
  $bundlesDir = Join-Path $OutputRoot.Trim() "bundles"
} else {
  $bundlesDir = Join-Path $repoRootWin "_proof\bundles"
}
if (-not (Test-Path $bundlesDir)) { New-Item -ItemType Directory -Path $bundlesDir | Out-Null }

$baseName = ("exec_{0}__{1}__{2}" -f $execIdFinal, $modeFinal, $sessionIdFinal)
$zipPath = Join-Path $bundlesDir ($baseName + ".zip")
$manifestPath = Join-Path $bundlesDir ($baseName + ".manifest.json")

# Enumerate files to include (all files under proof dir)
$files = Get-ChildItem -Path $proofDirFinal -Recurse -File | Sort-Object FullName

$fileEntries = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($proofDirFinal.Length).TrimStart("\")
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
$summaryCandidates += Join-Path $proofDirFinal "verify_3_7.txt"
$summaryCandidates += Join-Path $proofDirFinal "verify_3_8.txt"
$summaryCandidates += Join-Path $proofDirFinal "verify_3_9.txt"
$summaryCandidates += Join-Path $proofDirFinal "compile.txt"
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
  proof_dir      = ($proofDirFinal -replace "\\","/")
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
  $rel = $f.FullName.Substring($proofDirFinal.Length).TrimStart("\")
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

# Create/update latest bundle pointer
$latestPointerPath = Join-Path $bundlesDir "latest.json"
$latestPointer = [ordered]@{
  exec_id      = $execIdFinal
  session_id   = $sessionIdFinal
  mode         = $modeFinal
  zip_path     = ($zipPath -replace "\\","/")
  manifest_path = ($manifestPath -replace "\\","/")
  created_at   = $utcNow
}
$latestPointerJson = ($latestPointer | ConvertTo-Json -Depth 2)
[System.IO.File]::WriteAllText($latestPointerPath, $latestPointerJson)

Write-Host "BUNDLE_OK=True"
Write-Host ("EXEC_ID={0}" -f $execIdFinal)
Write-Host ("SESSION_ID={0}" -f $sessionIdFinal)
Write-Host ("MODE={0}" -f $modeFinal)
Write-Host ("PROOF_DIR={0}" -f ($proofDirFinal -replace "\\","/"))
Write-Host ("ZIP={0}" -f ($zipPath -replace "\\","/"))
Write-Host ("MANIFEST={0}" -f ($manifestPath -replace "\\","/"))
Write-Host ("LATEST={0}" -f ($latestPointerPath -replace "\\","/"))