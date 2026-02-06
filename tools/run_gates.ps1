# NGKs Autologger Extension - Release Gates Runner
# Phase 9 - Deterministic release gate validation
# This script validates all release criteria and outputs PASS/FAIL

param(
    [string]$ExtensionPath = ".\extension",
    [string]$AuditPath = ".\.ngkssys\audit"
)

Write-Host "NGKs Autologger Release Gates Runner" -ForegroundColor Cyan
Write-Host "=================================="

# Ensure audit directory exists
New-Item -ItemType Directory -Force -Path $AuditPath | Out-Null

# Initialize gate results
$gateResults = @{}
$overallPass = $true

# GATE 1: Compilation
Write-Host "`n[GATE 1] Testing compilation..." -ForegroundColor Yellow
try {
    $compileResult = & pnpm -C $ExtensionPath run compile 2>&1
    $compileOutput = $compileResult -join "`n"
    $compileOutput | Out-File -FilePath "$AuditPath\p9_gate_compile.txt" -Encoding UTF8
    
    if ($LASTEXITCODE -eq 0) {
        $gateResults["COMPILE"] = "PASS"
        Write-Host "✅ Compilation: PASS" -ForegroundColor Green
    } else {
        $gateResults["COMPILE"] = "FAIL"
        $overallPass = $false
        Write-Host "❌ Compilation: FAIL" -ForegroundColor Red
    }
} catch {
    $gateResults["COMPILE"] = "FAIL"
    $overallPass = $false
    Write-Host "❌ Compilation: FAIL (Exception)" -ForegroundColor Red
}

# GATE 2: process.on( audit - should ONLY be in core/crashGuard.ts
Write-Host "`n[GATE 2] Auditing process.on( usage..." -ForegroundColor Yellow
$processOnMatches = Get-ChildItem "$ExtensionPath\src" -Recurse -Filter "*.ts" | 
    ForEach-Object { Select-String -Path $_.FullName -Pattern "\bprocess\.on\(" } |
    ForEach-Object { 
        $relativePath = $_.Filename -replace [regex]::Escape($ExtensionPath), ""
        "$relativePath`: $($_.LineNumber): $($_.Line.Trim())"
    }

$processOnOutput = if ($processOnMatches) {
    $processOnMatches -join "`n"
} else {
    "No process.on( calls found"
}

$processOnOutput | Out-File -FilePath "$AuditPath\p9_gate_process_on.txt" -Encoding UTF8

# Check if process.on only appears in crashGuard.ts
$allowedProcessOn = $processOnMatches | Where-Object { $_ -match "crashGuard\.ts" }
$forbiddenProcessOn = $processOnMatches | Where-Object { $_ -notmatch "crashGuard\.ts" }

if ($forbiddenProcessOn) {
    $gateResults["PROCESS_ON"] = "FAIL"
    $overallPass = $false
    Write-Host "❌ process.on( audit: FAIL - Found in non-crashGuard files" -ForegroundColor Red
} else {
    $gateResults["PROCESS_ON"] = "PASS"
    Write-Host "✅ process.on( audit: PASS" -ForegroundColor Green
}

# GATE 3: Direct log("SESSION_END") audit 
Write-Host "`n[GATE 3] Auditing direct log('SESSION_END') calls..." -ForegroundColor Yellow
$sessionEndMatches = Get-ChildItem "$ExtensionPath\src" -Recurse -Filter "*.ts" | 
    ForEach-Object { Select-String -Path $_.FullName -Pattern 'log\(\s*[""'']SESSION_END[""'']' } |
    ForEach-Object { 
        $relativePath = $_.Filename -replace [regex]::Escape($ExtensionPath), ""
        "$relativePath`: $($_.LineNumber): $($_.Line.Trim())"
    }

$sessionEndOutput = if ($sessionEndMatches) {
    $sessionEndMatches -join "`n"
} else {
    "No direct log('SESSION_END') calls found"
}

$sessionEndOutput | Out-File -FilePath "$AuditPath\p9_gate_session_end_direct.txt" -Encoding UTF8

if ($sessionEndMatches) {
    $gateResults["SESSION_END_DIRECT"] = "FAIL"
    $overallPass = $false
    Write-Host "❌ SESSION_END direct calls: FAIL - Found direct calls" -ForegroundColor Red
} else {
    $gateResults["SESSION_END_DIRECT"] = "PASS"
    Write-Host "✅ SESSION_END direct calls: PASS" -ForegroundColor Green
}

# GATE 4: FileWatcher filters audit
Write-Host "`n[GATE 4] Auditing FileWatcher exclusion filters..." -ForegroundColor Yellow
$requiredFilters = @('.ngkssys', 'node_modules', 'dist', '.git')
$fileWatcherFiles = Get-ChildItem "$ExtensionPath\src" -Recurse -Filter "*fileWatcher*" -File

$filterResults = @()
foreach ($file in $fileWatcherFiles) {
    $content = Get-Content $file.FullName -Raw
    foreach ($filter in $requiredFilters) {
        $hasFilter = $content -match [regex]::Escape($filter)
        $filterResults += "$($file.Name): $filter = $hasFilter"
    }
}

$filterOutput = if ($filterResults) {
    "FileWatcher filter audit:`n" + ($filterResults -join "`n")
} else {
    "No fileWatcher files found"
}

$filterOutput | Out-File -FilePath "$AuditPath\p9_gate_filewatcher_filters.txt" -Encoding UTF8

# Check if all required filters are present
$hasAllFilters = $requiredFilters | ForEach-Object { 
    $filter = $_
    $fileWatcherFiles | Where-Object { 
        $content = Get-Content $_.FullName -Raw
        $content -match [regex]::Escape($filter) 
    }
} | Measure-Object | Select-Object -ExpandProperty Count

if ($hasAllFilters -ge $requiredFilters.Count) {
    $gateResults["FILEWATCHER_FILTERS"] = "PASS"
    Write-Host "✅ FileWatcher filters: PASS" -ForegroundColor Green
} else {
    $gateResults["FILEWATCHER_FILTERS"] = "FAIL"
    $overallPass = $false
    Write-Host "❌ FileWatcher filters: FAIL - Missing required exclusions" -ForegroundColor Red
}

# Generate summary
Write-Host "`n[SUMMARY] Release Gate Results" -ForegroundColor Cyan
Write-Host "=============================="

$summaryLines = @(
    "NGKs Autologger Extension - Release Gates Summary",
    "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "",
    "GATE RESULTS:",
    "============"
)

foreach ($gate in $gateResults.Keys) {
    $status = $gateResults[$gate]
    $emoji = if ($status -eq "PASS") { "✅" } else { "❌" }
    $color = if ($status -eq "PASS") { "Green" } else { "Red" }
    
    $line = "$emoji $gate`: $status"
    $summaryLines += $line
    Write-Host $line -ForegroundColor $color
}

$summaryLines += ""
$summaryLines += "OVERALL RESULT: $(if ($overallPass) { '✅ PASS' } else { '❌ FAIL' })"
$summaryLines += ""
$summaryLines += "AUDIT FILES GENERATED:"
$summaryLines += "- p9_gate_compile.txt"
$summaryLines += "- p9_gate_process_on.txt"  
$summaryLines += "- p9_gate_session_end_direct.txt"
$summaryLines += "- p9_gate_filewatcher_filters.txt"
$summaryLines += "- p9_gate_summary.txt"

# Write summary
$summaryContent = $summaryLines -join "`n"
$summaryContent | Out-File -FilePath "$AuditPath\p9_gate_summary.txt" -Encoding UTF8

# Final output
if ($overallPass) {
    Write-Host "`n🎉 ALL RELEASE GATES PASSED! 🎉" -ForegroundColor Green
    exit 0
} else {
    Write-Host "`n💥 RELEASE GATES FAILED! 💥" -ForegroundColor Red
    exit 1
}