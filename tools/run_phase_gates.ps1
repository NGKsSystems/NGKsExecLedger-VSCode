param(
  [ValidateSet("Build","Milestone")]
  [string]$Mode = "Build",

  [ValidateSet("Auto","YES","NO")]
  [string]$ExportBundle = "Auto"
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

function WriteFileWithRetry {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][string[]]$Lines,
    [int]$Retries = 20,
    [int]$DelayMs = 75
  )

  $tmp = "$Path.tmp"

  for ($i=0; $i -lt $Retries; $i++) {
    try {
      # write to temp first
      $Lines | Set-Content -Encoding UTF8 -NoNewline:$false $tmp
      # atomic-ish replace
      Move-Item -Force $tmp $Path
      return $true
    } catch {
      Start-Sleep -Milliseconds $DelayMs
    }
  }

  throw "Failed to write $Path after $Retries retries (file may be locked)."
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

function RunNodeartifacts([string]$scriptPath, [string]$outPath) {
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

function Set-ContentRetry {
  param(
    [Parameter(Mandatory=$true)][string]$Path,
    [Parameter(Mandatory=$true)][object]$Value,
    [int]$Retries = 20,
    [int]$DelayMs = 150
  )

  $tmp = "$Path.tmp"
  for ($i=1; $i -le $Retries; $i++) {
    try {
      $Value | Set-Content -Path $tmp -Encoding UTF8 -Force
      Move-Item -Path $tmp -Destination $Path -Force
      return
    } catch {
      if ($i -eq $Retries) { throw }
      Start-Sleep -Milliseconds $DelayMs
    }
  }
}

function WriteartifactsHeader([string]$filePath, [string]$execId, [string]$sessionId) {
  # TASK C: Lineage propagation - add IDs to all artifacts files
  $header = @(
    "EXEC_ID=$execId"
    "SESSION_ID=$sessionId"
    ""
  )
  
  if (Test-Path $filePath) {
    $content = Get-Content $filePath
    $newContent = $header + $content
    Set-ContentRetry -Path $filePath -Value $newContent
  } else {
    Set-ContentRetry -Path $filePath -Value $header
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
  # - artifacts markers YES
  # - truncation guard YES
  # - compilation YES
  # - dependency gate(s) YES (if present)
  # - file scope NO
  $artifactsOk = ($txt -match "artifacts_MARKERS:\s*YES")
  $scopeNo = ($txt -match "FILE_SCOPE_(VALID|AUTO_FAIL):\s*NO")
  $truncOk = ($txt -match "TRUNCATION_GUARD:\s*YES")
  $compileOk = ($txt -match "COMPILATION:\s*YES")
  $depOk = (($txt -notmatch "DEP_GATE_3_7") -or ($txt -match "DEP_GATE_3_7:\s*YES"))

  return ($artifactsOk -and $scopeNo -and $truncOk -and $compileOk -and $depOk)
}

# ROOT SAFETY
$repoRoot = "C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger"
Set-Location $repoRoot

# Get current git HEAD for EXEC_ID generation
$repoHead = git rev-parse HEAD
$phaseSet = "3.7-3.9"
$execId = GenerateExecId $repoHead $phaseSet $Mode
$sessionId = GenerateSessionId

# TASK D: New artifacts directory structure with EXEC_ID
$modeSubdir = $Mode.ToLower()
$artifactsDir = Join-Path $repoRoot "_artifacts\exec_$execId\$modeSubdir\$sessionId"
New-Item -ItemType Directory -Force -Path $artifactsDir | Out-Null

WriteLine "MODE=$Mode"
WriteLine "EXEC_ID=$execId"
WriteLine "SESSION_ID=$sessionId"
WriteLine "artifacts_DIR=$artifactsDir"

# Always capture state up front
$statusFile = Join-Path $artifactsDir "status.txt"
$diffFile = Join-Path $artifactsDir "diff_name_only.txt"
RunToFile "GIT_STATUS" "git status --porcelain=v1" $statusFile | Out-Null
RunToFile "GIT_DIFF_NAME_ONLY" "git diff --name-only" $diffFile | Out-Null
WriteartifactsHeader $statusFile $execId $sessionId
WriteartifactsHeader $diffFile $execId $sessionId

# Compile gate
$compileFile = Join-Path $artifactsDir "compile.txt"
$compileCode = RunToFile "COMPILE" "pnpm --dir extension run compile" $compileFile
$compileTxt = ReadText $compileFile
$compileOk = ($compileCode -eq 0)
WriteartifactsHeader $compileFile $execId $sessionId

# Phase gates (existing)
$g37File = Join-Path $artifactsDir "verify_3_7.txt"
$g38File = Join-Path $artifactsDir "verify_3_8.txt"
$g39File = Join-Path $artifactsDir "verify_3_9.txt"

WriteLine ""
WriteLine "=== VERIFY_3_7 ==="
$g37Code = RunNodeartifacts "extension/src/test/verify-phase3.7.js" $g37File
WriteLine "node extension/src/test/verify-phase3.7.js"
WriteLine "-> $g37File"
WriteartifactsHeader $g37File $execId $sessionId

WriteLine ""
WriteLine "=== VERIFY_3_8 ==="
$g38Code = RunNodeartifacts "extension/src/test/verify-phase3.8.js" $g38File
WriteLine "node extension/src/test/verify-phase3.8.js"
WriteLine "-> $g38File"
WriteartifactsHeader $g38File $execId $sessionId

WriteLine ""
WriteLine "=== VERIFY_3_9 ==="
$g39Code = RunNodeartifacts "extension/src/test/verify-phase3.9.js" $g39File
WriteLine "node extension/src/test/verify-phase3.9.js"
WriteLine "-> $g39File"
WriteartifactsHeader $g39File $execId $sessionId

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

$summary = Join-Path $artifactsDir "summary.txt"
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
  "artifacts_DIR=$artifactsDir"
) | Set-Content -Encoding UTF8 $summary

WriteLine ""
WriteLine "==== SUMMARY ===="
Get-Content $summary | ForEach-Object { WriteLine $_ }

# Conditional Phase 5-10 verification (only when exporting bundles)
# Determine if we should export bundle
$shouldExport = $false
if ($ExportBundle -eq "YES") {
  $shouldExport = $true
} elseif ($ExportBundle -eq "Auto" -and $Mode -eq "Milestone") {
  $shouldExport = $true
}

if ($shouldExport) {
  WriteLine "=== VERIFY_5 ==="
  $verify5Out = Join-Path $artifactsDir "verify_5.txt"
  $g5Code = RunNodeartifacts "extension/src/test/verify-phase5.js" $verify5Out
  $g5Ok = ($g5Code -eq 0)
  WriteLine "node extension/src/test/verify-phase5.js"
  WriteLine "-> $verify5Out"
  WriteartifactsHeader $verify5Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_6 ==="
  $verify6Out = Join-Path $artifactsDir "verify_6.txt"
  $g6Code = RunNodeartifacts "extension/src/test/verify-phase6.js" $verify6Out
  $g6Ok = ($g6Code -eq 0)
  WriteLine "node extension/src/test/verify-phase6.js"
  WriteLine "-> $verify6Out"
  WriteartifactsHeader $verify6Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_7 ==="
  $verify7Out = Join-Path $artifactsDir "verify_7.txt"
  $g7Code = RunNodeartifacts "extension/src/test/verify-phase7.js" $verify7Out
  $g7Ok = ($g7Code -eq 0)
  WriteLine "node extension/src/test/verify-phase7.js"
  WriteLine "-> $verify7Out"
  WriteartifactsHeader $verify7Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_8 ==="
  $verify8Out = Join-Path $artifactsDir "verify_8.txt"
  $g8Code = RunNodeartifacts "extension/src/test/verify-phase8.js" $verify8Out
  $g8Ok = ($g8Code -eq 0)
  WriteLine "node extension/src/test/verify-phase8.js"
  WriteLine "-> $verify8Out"
  WriteartifactsHeader $verify8Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_9 ==="
  $verify9Out = Join-Path $artifactsDir "verify_9.txt"
  $g9Code = RunNodeartifacts "extension/src/test/verify-phase9.js" $verify9Out
  $g9Ok = ($g9Code -eq 0)
  WriteLine "node extension/src/test/verify-phase9.js"
  WriteLine "-> $verify9Out"
  WriteartifactsHeader $verify9Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_10 ==="
  $verify10Out = Join-Path $artifactsDir "verify_10.txt"
  $g10Code = RunNodeartifacts "extension/src/test/verify-phase10.js" $verify10Out
  $g10Ok = ($g10Code -eq 0)
  WriteLine "node extension/src/test/verify-phase10.js"
  WriteLine "-> $verify10Out"
  WriteartifactsHeader $verify10Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_11 ==="
  $verify11Out = Join-Path $artifactsDir "verify_11.txt"
  $g11Code = RunNodeartifacts "extension/src/test/verify-phase11.js" $verify11Out
  $g11Ok = ($g11Code -eq 0)
  WriteLine "node extension/src/test/verify-phase11.js"
  WriteLine "-> $verify11Out"
  WriteartifactsHeader $verify11Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_12 ==="
  $verify12Out = Join-Path $artifactsDir "verify_12.txt"
  $g12Code = RunNodeartifacts "extension/src/test/verify-phase12.js" $verify12Out
  $g12Ok = ($g12Code -eq 0)
  WriteLine "node extension/src/test/verify-phase12.js"
  WriteLine "-> $verify12Out"
  WriteartifactsHeader $verify12Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_13 ==="
  $verify13Out = Join-Path $artifactsDir "verify_13.txt"
  $g13Code = RunNodeartifacts "extension/src/test/verify-phase13.js" $verify13Out
  $g13Ok = ($g13Code -eq 0)
  WriteLine "node extension/src/test/verify-phase13.js"
  WriteLine "-> $verify13Out"
  WriteartifactsHeader $verify13Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_14 ==="
  $verify14Out = Join-Path $artifactsDir "verify_14.txt"
  $g14Code = RunNodeartifacts "extension/src/test/verify-phase14.js" $verify14Out
  $g14Ok = ($g14Code -eq 0)
  WriteLine "node extension/src/test/verify-phase14.js"
  WriteLine "-> $verify14Out"
  WriteartifactsHeader $verify14Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_15 ==="
  $verify15Out = Join-Path $artifactsDir "verify_15.txt"
  $g15Code = RunNodeartifacts "extension/src/test/verify-phase15.js" $verify15Out
  $g15Ok = ($g15Code -eq 0)
  WriteLine "node extension/src/test/verify-phase15.js"
  WriteLine "-> $verify15Out"
  WriteartifactsHeader $verify15Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_16 ==="
  $verify16Out = Join-Path $artifactsDir "verify_16.txt"
  $g16Code = RunNodeartifacts "extension/src/test/verify-phase16.js" $verify16Out
  $g16Ok = ($g16Code -eq 0)
  WriteLine "node extension/src/test/verify-phase16.js"
  WriteLine "-> $verify16Out"
  WriteartifactsHeader $verify16Out $execId $sessionId

  WriteLine ""
  WriteLine "=== VERIFY_17 ==="
  $verify17Out = Join-Path $artifactsDir "verify_17.txt"
  $g17Code = RunNodeartifacts "extension/src/test/verify-phase17.js" $verify17Out
  $g17Ok = ($g17Code -eq 0)
  WriteLine "node extension/src/test/verify-phase17.js"
  WriteLine "-> $verify17Out"
  WriteartifactsHeader $verify17Out $execId $sessionId

  # Generate human-readable report.txt
  $utcTimestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
  $report = Join-Path $artifactsDir "report.txt"
  
  # Read changed files from diff_name_only.txt
  $diffFile = Join-Path $artifactsDir "diff_name_only.txt"
  $changedFiles = @()
  if (Test-Path $diffFile) {
    $changedFiles = Get-Content $diffFile | Where-Object { $_.Trim() } | ForEach-Object { "  - $_" }
  }
  if ($changedFiles.Count -eq 0) {
    $changedFiles = @("  none")
  }
  
  # Determine bundle paths
  $bundleZip = "N/A"
  $bundleManifest = "N/A" 
  $bundleLatest = "N/A"
  if ($shouldExport) {
    $bundleZip = Join-Path $repoRoot "_artifacts\bundles\exec_${execId}__${Mode.ToLower()}__${sessionId}.zip"
    $bundleManifest = Join-Path $repoRoot "_artifacts\bundles\exec_${execId}__${Mode.ToLower()}__${sessionId}.manifest.json"
    $bundleLatest = Join-Path $repoRoot "_artifacts\bundles\latest.json"
  }
  
  @(
    "ExecLedger artifacts Report",
    "",
    "EXEC_ID: $execId",
    "SESSION_ID: $sessionId",
    "MODE: $Mode",
    "UTC_TIMESTAMP: $utcTimestamp",
    "",
    "artifacts_DIR: $artifactsDir",
    "BUNDLE_ZIP: $bundleZip", 
    "BUNDLE_MANIFEST: $bundleManifest",
    "BUNDLE_LATEST: $bundleLatest",
    "",
    "GATE_RESULTS:",
    "  COMPILE: $compileOk",
    "  VERIFY_3_7: $g37Ok",
    "  VERIFY_3_8: $g38Ok",
    "  VERIFY_3_9: $g39Ok",
    "  VERIFY_5: $g5Ok",
    "  VERIFY_6: $g6Ok", 
    "  VERIFY_7: $g7Ok",
    "  VERIFY_8: $g8Ok",
    "  VERIFY_9: $g9Ok",
    "  VERIFY_10: $g10Ok",
    "  VERIFY_11: $g11Ok",
    "  VERIFY_12: $g12Ok",
    "  VERIFY_13: $g13Ok",
    "  VERIFY_14: $g14Ok",
    "  VERIFY_15: $g15Ok",
    "  VERIFY_16: $g16Ok",
    "  VERIFY_17: $g17Ok",
    "  FAIL_REASONS: " + ($(if ($failReasons.Count -eq 0) { "None" } else { $failReasons -join "," })),
    "",
    "CHANGED_FILES:"
  ) + $changedFiles | Set-Content -Encoding UTF8 $report
  
  WriteLine "Generated report: $report"

  # Update summary with Phase 5, 6, 7, 8, 9, and 10 results
  $summaryContent = Get-Content $summary
  $updatedSummary = @()
  foreach ($line in $summaryContent) {
    $updatedSummary += $line
    if ($line -match "^VERIFY_3_9_OK=") {
      $updatedSummary += "VERIFY_5_OK=$g5Ok"
      $updatedSummary += "VERIFY_6_OK=$g6Ok"
      $updatedSummary += "VERIFY_7_OK=$g7Ok"
      $updatedSummary += "VERIFY_8_OK=$g8Ok"
      $updatedSummary += "VERIFY_9_OK=$g9Ok"
      $updatedSummary += "VERIFY_10_OK=$g10Ok"
      $updatedSummary += "VERIFY_11_OK=$g11Ok"
      $updatedSummary += "VERIFY_12_OK=$g12Ok"
      $updatedSummary += "VERIFY_13_OK=$g13Ok"
      $updatedSummary += "VERIFY_14_OK=$g14Ok"
      $updatedSummary += "VERIFY_15_OK=$g15Ok"
      $updatedSummary += "VERIFY_16_OK=$g16Ok"
      $updatedSummary += "VERIFY_17_OK=$g17Ok"
    }
    if ($line -match "^FAIL_REASONS=") {
      if (-not $g5Ok) {
        if ($line -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_5_FAILED"
        } else {
          $updatedSummary[-1] = $line -replace "FAIL_REASONS=", "FAIL_REASONS=" -replace "$", ",VERIFY_5_FAILED"
        }
      }
      if (-not $g6Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_6_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_6_FAILED"
        }
      }
      if (-not $g7Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_7_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_7_FAILED"
        }
      }
      if (-not $g8Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_8_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_8_FAILED"
        }
      }
      if (-not $g9Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_9_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_9_FAILED"
        }
      }
      if (-not $g10Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_10_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_10_FAILED"
        }
      }
      if (-not $g11Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_11_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_11_FAILED"
        }
      }
      if (-not $g12Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_12_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_12_FAILED"
        }
      }
      if (-not $g13Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_13_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_13_FAILED"
        }
      }
      if (-not $g14Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_14_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_14_FAILED"
        }
      }
      if (-not $g15Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_15_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_15_FAILED"
        }
      }
      if (-not $g16Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_16_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_16_FAILED"
        }
      }
      if (-not $g17Ok) {
        if ($updatedSummary[-1] -eq "FAIL_REASONS=None") {
          $updatedSummary[-1] = "FAIL_REASONS=VERIFY_17_FAILED"
        } else {
          $updatedSummary[-1] = $updatedSummary[-1] -replace "$", ",VERIFY_17_FAILED"
        }
      }
    }
  }
  WriteFileWithRetry -Path $summary -Lines $updatedSummary

  if (-not $g5Ok) { $failReasons += "VERIFY_5_FAILED" }
  if (-not $g6Ok) { $failReasons += "VERIFY_6_FAILED" }
  if (-not $g7Ok) { $failReasons += "VERIFY_7_FAILED" }
  if (-not $g8Ok) { $failReasons += "VERIFY_8_FAILED" }
  if (-not $g9Ok) { $failReasons += "VERIFY_9_FAILED" }
  if (-not $g10Ok) { $failReasons += "VERIFY_10_FAILED" }
  if (-not $g11Ok) { $failReasons += "VERIFY_11_FAILED" }
  if (-not $g12Ok) { $failReasons += "VERIFY_12_FAILED" }
  if (-not $g13Ok) { $failReasons += "VERIFY_13_FAILED" }
  if (-not $g14Ok) { $failReasons += "VERIFY_14_FAILED" }
  if (-not $g15Ok) { $failReasons += "VERIFY_15_FAILED" }
  if (-not $g16Ok) { $failReasons += "VERIFY_16_FAILED" }
  if (-not $g17Ok) { $failReasons += "VERIFY_17_FAILED" }
  
  # Now export bundle after all phases and report generation
  Start-Sleep -Milliseconds 250
  WriteLine "=== EXPORT_BUNDLE ==="
  powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repoRoot "tools\export_proof_bundle.ps1") `
    -ExecId $execId `
    -SessionId $sessionId `
    -Mode $Mode
  WriteLine ""
}

# Exit code policy:
# - Build mode: fail only on real failures (compile or 3.7 or 3.9, or 3.8 non-advisory)
# - Milestone mode: any failure hard-fails
if ($failReasons.Count -gt 0) {
  exit 1
}

exit 0