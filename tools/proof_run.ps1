# artifacts Runner Script for Phase 3.8
# Generates non-truncated artifacts files in _artifacts/ directory

param()

# Ensure we are in repo root
$repoRoot = "C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger"
Set-Location $repoRoot

Write-Host "NGKs ExecLedger artifacts Runner - Phase 3.8"
Write-Host "Working Directory: $(Get-Location)"

# Create _artifacts directory if missing
if (-not (Test-Path "_artifacts")) {
    New-Item -ItemType Directory -Path "_artifacts" | Out-Null
    Write-Host "Created _artifacts directory"
}

# Initialize exit code
$exitCode = 0

# 1) Git status
Write-Host "1) Capturing git status..."
try {
    git status --porcelain=v1 > "_artifacts\status.txt" 2>&1
    Write-Host "   -> _artifacts\status.txt"
} catch {
    Write-Host "   ERROR: Failed to capture git status"
    $exitCode = 1
}

# 2) Git diff name-only
Write-Host "2) Capturing git diff --name-only..."
try {
    git diff --name-only > "_artifacts\diff_name_only.txt" 2>&1
    Write-Host "   -> _artifacts\diff_name_only.txt"
} catch {
    Write-Host "   ERROR: Failed to capture git diff"
    $exitCode = 1
}

# 3) TypeScript compile
Write-Host "3) Running TypeScript compile..."
try {
    pnpm --dir extension run compile > "_artifacts\compile.txt" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ERROR: Compilation failed (exit code: $LASTEXITCODE)"
        $exitCode = 1
    } else {
        Write-Host "   -> _artifacts\compile.txt (SUCCESS)"
    }
} catch {
    Write-Host "   ERROR: Failed to run compile"
    $exitCode = 1
}

# 4) Phase 3.7 verification
Write-Host "4) Running Phase 3.7 verification..."
try {
    node extension/src/test/verify-phase3.7.js > "_artifacts\verify_3_7.txt" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ERROR: Phase 3.7 verification failed (exit code: $LASTEXITCODE)"
        $exitCode = 1
    } else {
        Write-Host "   -> _artifacts\verify_3_7.txt (SUCCESS)"
    }
} catch {
    Write-Host "   ERROR: Failed to run Phase 3.7 verification"
    $exitCode = 1
}

# Summary
Write-Host ""
Write-Host "artifacts RUNNER SUMMARY:"
Write-Host "artifacts files written to: $repoRoot\_artifacts\"
Write-Host "- status.txt"
Write-Host "- diff_name_only.txt" 
Write-Host "- compile.txt"
Write-Host "- verify_3_7.txt"

if ($exitCode -eq 0) {
    Write-Host "ALL CHECKS PASSED"
} else {
    Write-Host "SOME CHECKS FAILED (exit code: $exitCode)"
}

exit $exitCode