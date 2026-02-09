param(
  [Parameter(Mandatory=$true)][string]$Message,
  [string[]]$Allow = @(
    "extension/src/core/filesystemChangeTracker.ts",
    "extension/src/core/sessionSummary.ts",
    "extension/.gitignore",
    "extension/src/commands/exportProofBundle.ts",
    "extension/src/test/verify-phase3.4.js"
  ),
  [switch]$Push
)

$ErrorActionPreference = "Stop"

function Die($msg) { Write-Host "FAIL: $msg" -ForegroundColor Red; exit 1 }
function Run($cmd) { Write-Host ">> $cmd"; Invoke-Expression $cmd }

# 1) Ensure we're at repo root
$top = (git rev-parse --show-toplevel 2>$null)
if (-not $top) { Die "Not a git repo." }
$pwdNorm = (Resolve-Path ".").Path.Replace('\','/').TrimEnd('/')
$topNorm = $top.Replace('\','/').TrimEnd('/')
if ($pwdNorm -ne $topNorm) { Die "Run this from repo root: $topNorm" }

# 2) Hard guard: no .history tracked/staged (or other editor junk if you add more)
$trackedHistory = (git ls-files -- ".history" ".vscode/.history" 2>$null)
if ($trackedHistory) { Die "History artifacts are TRACKED. Remove with: git rm -r --cached .history .vscode/.history" }

# 3) Show working state
Run "git status --porcelain=v1"

# 4) Run gates (edit as needed)
Run "pnpm -C extension run compile"
Run "node .\extension\src\test\verify-phase3.4.js"

# 5) Stage ONLY allowed paths
Run "git reset"
foreach ($p in $Allow) {
  if (Test-Path $p) {
    Run ("git add -- " + $p)
  }
}

# 6) Fail if anything staged is not in allowlist
$staged = (git diff --cached --name-only) | Where-Object { $_ -and $_.Trim() -ne "" }
if (-not $staged) { Die "Nothing staged. (Either no changes or Allow list missing files.)" }

$allowSet = @{}
foreach ($a in $Allow) { $allowSet[$a.Replace('\','/')] = $true }

foreach ($s in $staged) {
  $sNorm = $s.Replace('\','/')
  if (-not $allowSet.ContainsKey($sNorm)) {
    Run "git reset"
    Die "Staged file NOT allowed: $sNorm"
  }
}

# 7) Show exact commit contents
Write-Host "`nSTAGED FILES:" -ForegroundColor Cyan
$staged | ForEach-Object { Write-Host "  $_" }
Write-Host ""
Run "git diff --cached --stat"
Write-Host ""
Run "git diff --cached"

# 8) Commit
Run ("git commit -m " + ('"{0}"' -f $Message))

# 9) Optional push
if ($Push) { Run "git push" }

Write-Host "`nOK" -ForegroundColor Green
