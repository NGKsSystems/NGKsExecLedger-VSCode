# Proof Runner Script for Phase 3.8
# Generates non-truncated proof files in _proof/ directory

param()

# Ensure we are in repo root
$repoRoot = "C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger"
Set-Location $repoRoot

Write-Host "NGKs ExecLedger Proof Runner - Phase 3.8"
Write-Host "Working Directory: $(Get-Location)"

# Create _proof directory if missing
if (-not (Test-Path "_proof")) {
    New-Item -ItemType Directory -Path "_proof" | Out-Null
    Write-Host "Created _proof directory"
}

# Initialize exit code
$exitCode = 0

# 1) Git status
Write-Host "1) Capturing git status..."
try {
    git status --porcelain=v1 > "_proof\status.txt" 2>&1
    Write-Host "   -> _proof\status.txt"
} catch {
    Write-Host "   ERROR: Failed to capture git status"
    $exitCode = 1
}

# 2) Git diff name-only
Write-Host "2) Capturing git diff --name-only..."
try {
    git diff --name-only > "_proof\diff_name_only.txt" 2>&1
    Write-Host "   -> _proof\diff_name_only.txt"
} catch {
    Write-Host "   ERROR: Failed to capture git diff"
    $exitCode = 1
}

# 3) TypeScript compile
Write-Host "3) Running TypeScript compile..."
try {
    pnpm --dir extension run compile > "_proof\compile.txt" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ERROR: Compilation failed (exit code: $LASTEXITCODE)"
        $exitCode = 1
    } else {
        Write-Host "   -> _proof\compile.txt (SUCCESS)"
    }
} catch {
    Write-Host "   ERROR: Failed to run compile"
    $exitCode = 1
}

# 4) Phase 3.7 verification
Write-Host "4) Running Phase 3.7 verification..."
try {
    node extension/src/test/verify-phase3.7.js > "_proof\verify_3_7.txt" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ERROR: Phase 3.7 verification failed (exit code: $LASTEXITCODE)"
        $exitCode = 1
    } else {
        Write-Host "   -> _proof\verify_3_7.txt (SUCCESS)"
    }
} catch {
    Write-Host "   ERROR: Failed to run Phase 3.7 verification"
    $exitCode = 1
}

# Summary
Write-Host ""
Write-Host "PROOF RUNNER SUMMARY:"
Write-Host "Proof files written to: $repoRoot\_proof\"
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