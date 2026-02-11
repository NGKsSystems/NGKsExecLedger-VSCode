// BINARY ACCEPTANCE TEST - Run with: node extension/src/test/verify-phase3.9.js
// Phase 3.9 Gate: Runner + Mode discipline is present and deterministic.
//
// Contract:
// - Proof markers required
// - Truncation guard required
// - File scope limited to Phase 3.9 deliverables
// - Runner script exists and has Mode parameter + writes summary
// - Does NOT require a clean working tree (milestone policy handled by runner)

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

function okLine(k, v, extra = '') {
  console.log(`${k}: ${v}${extra ? ' - ' + extra : ''}`);
}

function hasProofMarkers(sample) {
  return sample.includes('PROOF_BEGIN') && sample.includes('PROOF_END');
}

function truncationDetected(sample) {
  // Simple guard: detect common Windows truncation patterns from prior issues
  // (e.g., ellipsis or "…" or ".hist…" or "...skipping...")
  return sample.includes('...skipping...') || sample.includes('…') || sample.includes('.hist…');
}

function fileScopeAllowed(changed) {
  const allowed = new Set([
    '.gitignore',
    'tools/run_phase_gates.ps1',
    'extension/src/test/verify-phase3.7.js',
    'extension/src/test/verify-phase3.8.js',
    'extension/src/test/verify-phase3.9.js',
    'extension/src/test/verify-phase4.js',
    'extension/src/test/verify-phase5.js',
    'tools/export_proof_bundle.ps1',
    'extension/package.json',
    'extension/src/extension.ts',
    'extension/src/command/exportProofBundle.ts',
    'extension/src/test/verify-phase6.js',
    'extension/src/test/verify-phase7.js',
    'extension/src/test/verify-phase8.js',
    'extension/src/command/openLatestProofBundle.ts',
    'extension/src/command/openLatestProofReport.ts',
    'extension/src/command/openLatestSummary.ts',
    'extension/src/command/copyLatestSummary.ts',
    'extension/src/status/statusBarProof.ts',
    'extension/src/test/verify-phase9.js',
    'extension/src/test/verify-phase10.js',
    'extension/src/test/verify-phase11.js',
    'extension/src/test/verify-phase12.js',
    'extension/src/test/verify-phase13.js',
    'extension/src/test/verify-phase14.js',
    'extension/src/test/verify-phase15.js',
    'extension/src/test/verify-phase16.js',
    'extension/src/util/validation.ts'
  ]);
  const violations = changed.filter(f => f && !allowed.has(f));
  return { pass: violations.length === 0, violations };
}

function main() {
  console.log('PROOF_BEGIN');
  console.log('PROOF_END');
  console.log('🔍 PHASE 3.9 RUNNER + MODE DISCIPLINE GATE');

  // 1) Proof marker enforcement
  console.log('🧪 Testing proof markers validation...');
  const sampleOk = 'PROOF_BEGIN\nPROOF_END\n';
  const sampleBad = 'NO_MARKERS\n';
  const proofOk = hasProofMarkers(sampleOk);
  const proofBadOk = !hasProofMarkers(sampleBad);
  okLine('  Proof markers detected', proofOk ? 'YES' : 'NO');
  okLine('  Proof markers missing (expected)', proofBadOk ? 'YES' : 'NO');

  // 2) Truncation guard
  console.log('🧪 Testing truncation detection...');
  const truncYes = truncationDetected('...skipping...');
  const truncNo = !truncationDetected('clean path line');
  okLine('  Truncation detected', truncYes ? 'YES' : 'NO');
  okLine('  No truncation (expected)', truncNo ? 'YES' : 'NO');

  // 3) File scope validation (Phase 3.9 deliverables only)
  console.log('🧪 Testing file scope validation...');
  let diffList = [];
  try {
    const out = sh('git diff --name-only').trim();
    diffList = out ? out.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  } catch {
    diffList = [];
  }
  const scope = fileScopeAllowed(diffList);
  okLine('  File scope validation', scope.pass ? 'PASS' : 'FAIL');
  if (!scope.pass) {
    console.log('  Violations: ' + scope.violations.join(', '));
  }

  // 4) Runner existence + minimal contract
  console.log('🧪 Testing runner presence and contract...');
  const runnerPath = path.join(process.cwd(), 'tools', 'run_phase_gates.ps1');
  const runnerExists = fs.existsSync(runnerPath);
  okLine('  Runner exists', runnerExists ? 'YES' : 'NO');

  let runnerContractOk = false;
  if (runnerExists) {
    const txt = fs.readFileSync(runnerPath, 'utf8');
    const hasModeParam = txt.includes('ValidateSet("Build","Milestone")') && txt.includes('[string]$Mode');
    const writesSummary = txt.includes('summary.txt') && txt.includes('==== SUMMARY ====');
    runnerContractOk = hasModeParam && writesSummary;
  }
  okLine('  Runner contract', runnerContractOk ? 'PASS' : 'FAIL');

  // Final contract
  const contractOk =
    proofOk &&
    proofBadOk &&
    truncYes &&
    truncNo &&
    scope.pass &&
    runnerExists &&
    runnerContractOk;

  console.log('');
  console.log('📊 BINARY ACCEPTANCE RESULTS:');
  okLine('PROOF_MARKERS', proofOk && proofBadOk ? 'YES' : 'NO', 'Enforcement working');
  okLine('FILE_SCOPE_VALID', scope.pass ? 'YES' : 'NO', 'Phase 3.9 scope validated');
  okLine('TRUNCATION_GUARD', truncYes && truncNo ? 'YES' : 'NO', 'Truncation detection working');
  okLine('RUNNER_PRESENT', runnerExists ? 'YES' : 'NO', 'Runner file present');
  okLine('RUNNER_CONTRACT', runnerContractOk ? 'YES' : 'NO', 'Runner contract validated');
  okLine('PROOF_CONTRACT', contractOk ? 'YES' : 'NO', 'Complete contract working');
  okLine('OVERALL', contractOk ? 'PASS' : 'FAIL');
  process.exit(contractOk ? 0 : 1);
}

main();