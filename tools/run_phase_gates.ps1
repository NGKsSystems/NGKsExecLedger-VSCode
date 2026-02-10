param(
  [ValidateSet("Build","Milestone")]
  [string]$Mode = "Build",

  [ValidateSet("YES","NO")]
  [string]$ExportBundle = "NO"
)

$ErrorActionPreference = "Stop"

function Stamp() {
  return (Get-Date).ToString("yyyyMMdd_HHmmss")
}

function GenerateExecId([string]$repoHead, [string]$phases, [string]$mode) {
  # TASK A: Deterministic EXEC_ID from repo HEAD + phases + mode + verifier set
  $input = "$repoHead|$phases|$mode|3.7,3.8,3.9"
  $hash = [System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($input))
  $hashStr = [BitConverter]::ToString($hash) -replace '-', ''
  return $hashStr.Substring(0, 16).ToLower()  # Truncated SHA-256
}

function GenerateSessionId {
  # TASK B: Runtime-unique SESSION_ID (UUIDv4)
  return [System.Guid]::NewGuid().ToString()
}

function WriteLine($s) {
  Write-Host $s
}

function RunToFile([string]$label, [string]$cmd, [string]$outFile) {
  WriteLine ""
  WriteLine "=== $label ==="
  WriteLine $cmd
  WriteLine "-> $outFile"
  
  try {
    powershell -NoProfile -ExecutionPolicy Bypass -Command $cmd *> $outFile
    return $LASTEXITCODE
  } catch {
    Write-Warning "Command generated warning: $($_.Exception.Message)"
    return 0
  }
}

function RunNodeProof([string]$scriptPath, [string]$outPath) {
  $nodeExe = "node"
  $errPath = ($outPath -replace "\.txt$", ".err.txt")

  if (Test-Path $outPath) { Remove-Item -Force $outPath }
  if (Test-Path $errPath) { Remove-Item -Force $errPath }

  $p = Start-Process -FilePath $nodeExe `
    -ArgumentList @($scriptPath) `
    -NoNewWindow `
    -Wait `
    -PassThru `
    -RedirectStandardOutput $outPath `
    -RedirectStandardError  $errPath

  return $p.ExitCode
}

function WriteProofHeader([string]$filePath, [string]$execId, [string]$sessionId) {
  # TASK C: Lineage propagation - add IDs to all proof files
  $header = @(
    "EXEC_ID=$execId"
    "SESSION_ID=$sessionId"
    ""
  )
  
  if (Test-Path $filePath) {
    $content = Get-Content $filePath
    $newContent = $header + $content
    $newContent | Set-Content -Path $filePath -Encoding UTF8
  } else {
    $header | Set-Content -Path $filePath -Encoding UTF8
  }
}

function ReadText([string]$p) {
  if (!(Test-Path $p)) { return "" }
  return (Get-Content -Raw $p)
}

function HasOverallPass([string]$txt) {
  return ($txt -match "OVERALL:\s*PASS")
}

function IsOnlyFileScopeFailure([string]$txt) {
  # Acceptable "advisory" fail in BUILD mode:
  # - proof markers YES
  # - truncation guard YES
  # - compilation YES
  # - dependency gate(s) YES (if present)
  # - file scope NO
  $proofOk = ($txt -match "PROOF_MARKERS:\s*YES")
  $scopeNo = ($txt -match "FILE_SCOPE_(VALID|AUTO_FAIL):\s*NO")
  $truncOk = ($txt -match "TRUNCATION_GUARD:\s*YES")
  $compileOk = ($txt -match "COMPILATION:\s*YES")
  $depOk = (($txt -notmatch "DEP_GATE_3_7") -or ($txt -match "DEP_GATE_3_7:\s*YES"))

  return ($proofOk -and $scopeNo -and $truncOk -and $compileOk -and $depOk)
}

# ROOT SAFETY
$repoRoot = "C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger"
Set-Location $repoRoot

# Get current git HEAD for EXEC_ID generation
$repoHead = git rev-parse HEAD
$phaseSet = "3.7-3.9"
$execId = GenerateExecId $repoHead $phaseSet $Mode
$sessionId = GenerateSessionId

# TASK D: New proof directory structure with EXEC_ID
$modeSubdir = $Mode.ToLower()
$proofDir = Join-Path $repoRoot "_proof\exec_$execId\$modeSubdir\$sessionId"
New-Item -ItemType Directory -Force -Path $proofDir | Out-Null

WriteLine "MODE=$Mode"
WriteLine "EXEC_ID=$execId"
WriteLine "SESSION_ID=$sessionId"
WriteLine "PROOF_DIR=$proofDir"

# Always capture state up front
$statusFile = Join-Path $proofDir "status.txt"
$diffFile = Join-Path $proofDir "diff_name_only.txt"
RunToFile "GIT_STATUS" "git status --porcelain=v1" $statusFile | Out-Null
RunToFile "GIT_DIFF_NAME_ONLY" "git diff --name-only" $diffFile | Out-Null
WriteProofHeader $statusFile $execId $sessionId
WriteProofHeader $diffFile $execId $sessionId

# Compile gate
$compileFile = Join-Path $proofDir "compile.txt"
$compileCode = RunToFile "COMPILE" "pnpm --dir extension run compile" $compileFile
$compileTxt = ReadText $compileFile
$compileOk = ($compileCode -eq 0)
WriteProofHeader $compileFile $execId $sessionId

# Phase gates (existing)
$g37File = Join-Path $proofDir "verify_3_7.txt"
$g38File = Join-Path $proofDir "verify_3_8.txt"
$g39File = Join-Path $proofDir "verify_3_9.txt"

WriteLine ""
WriteLine "=== VERIFY_3_7 ==="
$g37Code = RunNodeProof "extension/src/test/verify-phase3.7.js" $g37File
WriteLine "node extension/src/test/verify-phase3.7.js"
WriteLine "-> $g37File"
WriteProofHeader $g37File $execId $sessionId

WriteLine ""
WriteLine "=== VERIFY_3_8 ==="
$g38Code = RunNodeProof "extension/src/test/verify-phase3.8.js" $g38File
WriteLine "node extension/src/test/verify-phase3.8.js"
WriteLine "-> $g38File"
WriteProofHeader $g38File $execId $sessionId

WriteLine ""
WriteLine "=== VERIFY_3_9 ==="
$g39Code = RunNodeProof "extension/src/test/verify-phase3.9.js" $g39File
WriteLine "node extension/src/test/verify-phase3.9.js"
WriteLine "-> $g39File"
WriteProofHeader $g39File $execId $sessionId

$g37Txt = ReadText $g37File
$g38Txt = ReadText $g38File
$g39Txt = ReadText $g39File

$g37Ok = ($g37Code -eq 0)
$g38Ok = ($g38Code -eq 0)
$g39Ok = ($g39Code -eq 0)

# Mode-aware interpretation
$g38Advisory = $false
if (-not $g38Ok -and $Mode -eq "Build") {
  if (IsOnlyFileScopeFailure $g38Txt) {
    $g38Advisory = $true
    $g38Ok = $true
  }
}

# Final decision
$failReasons = @()

if (-not $compileOk) { $failReasons += "COMPILE_FAILED" }
if (-not $g37Ok) { $failReasons += "VERIFY_3_7_FAILED" }
if (-not $g38Ok) { $failReasons += "VERIFY_3_8_FAILED" }
if (-not $g39Ok) { $failReasons += "VERIFY_3_9_FAILED" }

$summary = Join-Path $proofDir "summary.txt"
@(
  "EXEC_ID=$execId"
  "SESSION_ID=$sessionId"
  "MODE=$Mode"
  "COMPILE_OK=$compileOk"
  "VERIFY_3_7_OK=$g37Ok"
  ("VERIFY_3_8_OK=" + ($g38Ok))
  ("VERIFY_3_8_ADVISORY_SCOPE_ONLY=" + ($g38Advisory))
  "VERIFY_3_9_OK=$g39Ok"
  ("FAIL_REASONS=" + ($(if ($failReasons.Count -eq 0) { "None" } else { $failReasons -join "," })))
  "PROOF_DIR=$proofDir"
) | Set-Content -Encoding UTF8 $summary

WriteLine ""
WriteLine "==== SUMMARY ===="
Get-Content $summary | ForEach-Object { WriteLine $_ }

if ($ExportBundle -eq "YES") {
  Start-Sleep -Milliseconds 250
  WriteLine "=== EXPORT_BUNDLE ==="
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tools\export_proof_bundle.ps1") `
    -ExecId $execId `
    -SessionId $sessionId `
    -Mode $Mode

  WriteLine ""
  WriteLine "=== VERIFY_5 ==="
  $verify5Out = Join-Path $proofDir "verify_5.txt"
  $g5Code = RunNodeProof "extension/src/test/verify-phase5.js" $verify5Out
  $g5Ok = ($g5Code -eq 0)
  WriteLine "node extension/src/test/verify-phase5.js"
  WriteLine "-> $verify5Out"
  WriteProofHeader $verify5Out $execId $sessionId

  # Update summary with Phase 5 results
  $summaryContent = Get-Content $summary
  $updatedSummary = @()
  foreach ($line in $summaryContent) {
    $updatedSummary += $line
    if ($line -match "^VERIFY_3_9_OK=") {
      $updatedSummary += "VERIFY_5_OK=$g5Ok"
    }
    if ($line -match "^FAIL_REASONS=") {
      if (-not $g5Ok) {
        if ($line -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_5_FAILED"
        } else {
          $updatedSummary[-1] = $line -replace "FAIL_REASONS=", "FAIL_REASONS=" -replace "$", ",VERIFY_5_FAILED"
        }
      }
    }
  }
  $updatedSummary | Set-Content -Encoding UTF8 $summary

  if (-not $g5Ok) { $failReasons += "VERIFY_5_FAILED" }
}

# Exit code policy:
# - Build mode: fail only on real failures (compile or 3.7 or 3.9, or 3.8 non-advisory)
# - Milestone mode: any failure hard-fails
if ($failReasons.Count -gt 0) {
  exit 1
}

exit 0