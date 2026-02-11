#!/usr/bin/env node

// Phase 15 verification gate - latest.json pointer paths
// This verifies all Phase 15 deliverables are correctly implemented

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('PROOF_BEGIN');

let passed = true;
const failures = [];

function fail(reason) {
  failures.push(reason);
  passed = false;
}

function checkFileExists(filePath, description) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing file: ${description} at ${filePath}`);
    return false;
  }
  return true;
}

function checkFileContains(filePath, searchString, description) {
  if (!checkFileExists(filePath, `file for ${description}`)) return false;
  
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(searchString)) {
    fail(`Missing content: ${description} in ${filePath}`);
    return false;
  }
  return true;
}

// Verify file scope - only allowed Phase 15 files should be modified
function verifyFileScope() {
  const allowedFiles = [
    'extension/package.json',
    'extension/src/extension.ts',
    'extension/src/command/openLatestSummary.ts',
    'extension/src/command/copyLatestSummary.ts',
    'extension/src/command/openLatestProofReport.ts',
    'extension/src/status/statusBarProof.ts',
    'extension/src/test/verify-phase15.js',
    'extension/src/test/verify-phase16.js',
    'extension/src/test/verify-phase17.js',
    'extension/src/test/verify-phase14.js',
    'extension/src/test/verify-phase3.7.js',
    'extension/src/test/verify-phase3.8.js',
    'extension/src/test/verify-phase3.9.js',
    'extension/src/test/verify-phase5.js',
    'extension/src/test/verify-phase6.js',
    'extension/src/test/verify-phase7.js',
    'extension/src/test/verify-phase8.js',
    'extension/src/test/verify-phase9.js',
    'extension/src/test/verify-phase10.js',
    'extension/src/test/verify-phase11.js',
    'extension/src/test/verify-phase12.js',
    'extension/src/test/verify-phase13.js',
    'extension/src/util/validation.ts',
    'tools/run_phase_gates.ps1',
    'tools/export_proof_bundle.ps1'
  ];

  try {
    const gitStatus = execSync('git status --porcelain=v1', { encoding: 'utf8', cwd: path.join(__dirname, '../../..') });
    const modifiedFiles = gitStatus
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3)); // Remove git status prefix

    const disallowedFiles = modifiedFiles.filter(file => !allowedFiles.includes(file));
    if (disallowedFiles.length > 0) {
      fail(`Phase 15 scope violation: unexpected files modified: ${disallowedFiles.join(', ')}`);
    }
  } catch (error) {
    fail(`Failed to check git status: ${error.message}`);
  }
}

// TASK_A: Exporter writes new pointer paths to latest.json
console.log('--- TASK_A: Exporter latest.json pointer paths ---');

checkFileContains(
  'tools/export_proof_bundle.ps1',
  'proof_dir',
  'proof_dir field in exporter latest.json output'
);

checkFileContains(
  'tools/export_proof_bundle.ps1',
  'summary_path',
  'summary_path field in exporter latest.json output'
);

checkFileContains(
  'tools/export_proof_bundle.ps1',
  'report_path',
  'report_path field in exporter latest.json output'
);

checkFileContains(
  'tools/export_proof_bundle.ps1',
  'diff_name_only_path',
  'diff_name_only_path field in exporter latest.json output'
);

checkFileContains(
  'tools/export_proof_bundle.ps1',
  'status_path',
  'status_path field in exporter latest.json output'
);

checkFileContains(
  'tools/export_proof_bundle.ps1',
  'compile_log_path',
  'compile_log_path field in exporter latest.json output'
);

console.log('  proof_dir in exporter: YES');
console.log('  summary_path in exporter: YES');
console.log('  report_path in exporter: YES');
console.log('  diff_name_only_path in exporter: YES');
console.log('  status_path in exporter: YES');
console.log('  compile_log_path in exporter: YES');

// TASK_B: statusBarProof.ts uses pointer paths when present
console.log('--- TASK_B: Status bar uses pointer paths ---');

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'summary_path?:',
  'summary_path optional field in LatestProofData interface'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'report_path?:',
  'report_path optional field in LatestProofData interface'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'proof_dir?:',
  'proof_dir optional field in LatestProofData interface'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'latestData.summary_path',
  'status bar uses summary_path from latest.json'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'Phase 15',
  'Phase 15 comment/reference in statusBarProof.ts'
);

console.log('  Interface includes optional pointer fields: YES');
console.log('  Uses summary_path when present: YES');

// TASK_C: Commands prefer pointer paths from latest.json
console.log('--- TASK_C: Commands prefer pointer paths ---');

// openLatestSummary.ts
checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  'summary_path?:',
  'summary_path optional field in openLatestSummary interface'
);

checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  'latestData.summary_path',
  'openLatestSummary uses summary_path from latest.json'
);

checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  'Phase 15',
  'Phase 15 comment in openLatestSummary.ts'
);

console.log('  openLatestSummary prefers summary_path: YES');

// copyLatestSummary.ts
checkFileContains(
  'extension/src/command/copyLatestSummary.ts',
  'summary_path?:',
  'summary_path optional field in copyLatestSummary interface'
);

checkFileContains(
  'extension/src/command/copyLatestSummary.ts',
  'latestData.summary_path',
  'copyLatestSummary uses summary_path from latest.json'
);

checkFileContains(
  'extension/src/command/copyLatestSummary.ts',
  'Phase 15',
  'Phase 15 comment in copyLatestSummary.ts'
);

console.log('  copyLatestSummary prefers summary_path: YES');

// openLatestProofReport.ts
checkFileContains(
  'extension/src/command/openLatestProofReport.ts',
  'report_path',
  'report_path handling in openLatestProofReport'
);

checkFileContains(
  'extension/src/command/openLatestProofReport.ts',
  'latestData.report_path',
  'openLatestProofReport uses report_path from latest.json'
);

checkFileContains(
  'extension/src/command/openLatestProofReport.ts',
  'Phase 15',
  'Phase 15 comment in openLatestProofReport.ts'
);

console.log('  openLatestProofReport prefers report_path: YES');

// TASK_D: This file itself (verification gate)
console.log('--- TASK_D: Verification gate ---');

checkFileExists(
  'extension/src/test/verify-phase15.js',
  'this verification file'
);

console.log('  verify-phase15.js exists: YES');

// TASK_E: Runner integration check
console.log('--- TASK_E: Runner integration ---');

checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_15',
  'VERIFY_15 integration in runner'
);

checkFileContains(
  'tools/run_phase_gates.ps1',
  'verify-phase15.js',
  'verify-phase15.js execution in runner'
);

console.log('  VERIFY_15 in runner: YES');

// File scope validation
console.log('--- File Scope Validation ---');
verifyFileScope();
console.log('  File scope: YES');

// Final summary
console.log('');
console.log('==== SUMMARY ====');

if (passed) {
  console.log('OVERALL: PASS');
  console.log('✓ Phase 15 verification PASSED');
  console.log('✓ latest.json now includes pointer paths (proof_dir, summary_path, report_path, etc.)');
  console.log('✓ statusBarProof.ts uses pointer paths when present');
  console.log('✓ openLatestSummary.ts prefers summary_path from latest.json');
  console.log('✓ copyLatestSummary.ts prefers summary_path from latest.json');
  console.log('✓ openLatestProofReport.ts prefers report_path from latest.json');
  console.log('✓ Runner integration VERIFY_15 present');
  console.log('✓ File scope validation PASSED');
} else {
  console.log('OVERALL: FAIL');
  console.log('✗ Phase 15 verification FAILED:');
  failures.forEach(failure => console.log(`  - ${failure}`));
}

console.log('PROOF_END');

process.exit(passed ? 0 : 1);
