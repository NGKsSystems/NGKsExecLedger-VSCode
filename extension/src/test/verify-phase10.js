#!/usr/bin/env node

// Phase 10 verification gate - human-readable report.txt included in proof bundles
// This verifies all Phase 10 deliverables are correctly implemented

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

// Verify file scope - only allowed Phase 10 files should be modified
function verifyFileScope() {
  const allowedFiles = [
    'extension/package.json',
    'extension/src/extension.ts',
    'tools/run_phase_gates.ps1',
    'tools/export_proof_bundle.ps1',
    'extension/src/test/verify-phase10.js',
    'extension/src/command/runMilestoneGates.ts',
    'extension/src/test/verify-phase3.8.js',
    'extension/src/test/verify-phase3.9.js',
    'extension/src/test/verify-phase5.js',
    'extension/src/test/verify-phase6.js',
    'extension/src/test/verify-phase7.js',
    'extension/src/test/verify-phase8.js',
    'extension/src/test/verify-phase9.js',
    'extension/src/test/verify-phase11.js',
    'extension/src/test/verify-phase12.js',
    'extension/src/test/verify-phase13.js'
  ];

  try {
    const gitStatus = execSync('git status --porcelain=v1', { encoding: 'utf8', cwd: path.join(__dirname, '../../..') });
    const modifiedFiles = gitStatus
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3)); // Remove git status prefix

    const disallowedFiles = modifiedFiles.filter(file => !allowedFiles.includes(file));
    if (disallowedFiles.length > 0) {
      fail(`Phase 10 scope violation: unexpected files modified: ${disallowedFiles.join(', ')}`);
    }
  } catch (error) {
    fail(`Failed to check git status: ${error.message}`);
  }
}

// TASK_A: Runner writes report.txt
checkFileContains(
  'tools/run_phase_gates.ps1',
  'report.txt',
  'report.txt generation in runner'
);

checkFileContains(
  'tools/run_phase_gates.ps1', 
  'ExecLedger Proof Report',
  'required header in report generation'
);

checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_10',
  'VERIFY_10 integration in runner'
);

// TASK_B: Export script includes report.txt (via directory inclusion)
// The export script automatically includes all files in proof directory,
// so we verify it reads the entire proof directory
checkFileContains(
  'tools/export_proof_bundle.ps1',
  'Get-ChildItem -Path $proofDirFinal -Recurse -File',
  'proof directory recursion in export script'
);

// TASK_C: This file itself (verification gate)
checkFileExists(
  'extension/src/test/verify-phase10.js',
  'this verification file'
);

// TASK_D: Runner integration check
checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_10_OK',
  'VERIFY_10_OK in summary update'
);

checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_10_FAILED',
  'VERIFY_10_FAILED in fail reasons logic'
);

// File scope validation
verifyFileScope();

if (passed) {
  console.log('✓ Phase 10 verification PASSED');
  console.log('✓ Runner generates report.txt with required format');
  console.log('✓ Export script includes report.txt via directory inclusion');
  console.log('✓ VERIFY_10 integration completed');
  console.log('✓ File scope validation PASSED');
} else {
  console.log('✗ Phase 10 verification FAILED:');
  failures.forEach(failure => console.log(`  - ${failure}`));
}

console.log('PROOF_END');

process.exit(passed ? 0 : 1);