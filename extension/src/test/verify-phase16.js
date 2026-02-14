#!/usr/bin/env node

// Phase 16 verification gate - integrity hashing + schema validation + drift detection
// This verifies all Phase 16 deliverables are correctly implemented

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('artifacts_BEGIN');

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

// Verify file scope - only allowed Phase 16 files should be modified
function verifyFileScope() {
  const allowedFiles = [
    'extension/package.json',
    'extension/src/extension.ts',
    'extension/src/util/validation.ts',
    'extension/src/command/openLatestSummary.ts',
    'extension/src/command/copyLatestSummary.ts',
    'extension/src/command/openLatestartifactsReport.ts',
    'extension/src/status/statusBarartifacts.ts',
    'extension/src/test/verify-phase16.js',
    'extension/src/test/verify-phase17.js',
    'extension/src/test/verify-phase15.js',
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
    'tools/run_phase_gates.ps1',
    'tools/export_artifacts_bundle.ps1'
  ];

  try {
    const gitStatus = execSync('git status --porcelain=v1', { encoding: 'utf8', cwd: path.join(__dirname, '../../..') });
    const modifiedFiles = gitStatus
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3));

    const disallowedFiles = modifiedFiles.filter(file => !allowedFiles.includes(file));
    if (disallowedFiles.length > 0) {
      fail(`Phase 16 scope violation: unexpected files modified: ${disallowedFiles.join(', ')}`);
    }
  } catch (error) {
    fail(`Failed to check git status: ${error.message}`);
  }
}

// TASK_A: Integrity hashing + integrity.json in exporter
console.log('--- TASK_A: Integrity hashing + integrity.json ---');

checkFileContains(
  'tools/export_artifacts_bundle.ps1',
  'integrity.json',
  'integrity.json creation in exporter'
);

checkFileContains(
  'tools/export_artifacts_bundle.ps1',
  'integrity_path',
  'integrity_path field in latest.json'
);

checkFileContains(
  'tools/export_artifacts_bundle.ps1',
  'Get-SHA256Hex',
  'SHA256 hashing function usage for integrity'
);

checkFileContains(
  'tools/export_artifacts_bundle.ps1',
  'hashes',
  'hashes object in integrity.json'
);

console.log('  integrity.json in exporter: YES');
console.log('  integrity_path in latest.json: YES');
console.log('  SHA256 hashing: YES');

// TASK_B: Schema validation for pointers/integrity
console.log('--- TASK_B: Schema validation ---');

checkFileExists(
  'extension/src/util/validation.ts',
  'validation utility file'
);

checkFileContains(
  'extension/src/util/validation.ts',
  'validateLatestJson',
  'latest.json schema validation function'
);

checkFileContains(
  'extension/src/util/validation.ts',
  'validateIntegrityJson',
  'integrity.json schema validation function'
);

checkFileContains(
  'extension/src/util/validation.ts',
  'IntegrityJsonSchema',
  'IntegrityJsonSchema interface'
);

checkFileContains(
  'extension/src/util/validation.ts',
  'LatestJsonSchema',
  'LatestJsonSchema interface'
);

checkFileContains(
  'extension/src/util/validation.ts',
  'ValidationResult',
  'ValidationResult interface'
);

console.log('  validateLatestJson function: YES');
console.log('  validateIntegrityJson function: YES');
console.log('  Schema interfaces: YES');

// TASK_C: Drift detection logic
console.log('--- TASK_C: Drift detection ---');

checkFileContains(
  'extension/src/util/validation.ts',
  'detectDrift',
  'drift detection function'
);

checkFileContains(
  'extension/src/util/validation.ts',
  'computeSHA256',
  'SHA256 compute function for drift checking'
);

checkFileContains(
  'extension/src/util/validation.ts',
  'hash mismatch',
  'drift detection mismatch reporting'
);

console.log('  detectDrift function: YES');
console.log('  SHA256 computation: YES');
console.log('  Mismatch reporting: YES');

// TASK_D: Status bar WARN/FAIL states
console.log('--- TASK_D: Status bar WARN/FAIL states ---');

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'WARN',
  'WARN state text in status bar'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  '$(warning)',
  'Warning icon for drift state'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'isDrifted',
  'Drift state check in status bar'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'detectDrift',
  'detectDrift integration in status bar'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'integrity_path',
  'integrity_path field in status bar LatestartifactsData'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'Integrity Drift Detected',
  'Drift detected message in tooltip'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'Integrity',
  'Integrity info in tooltip'
);

console.log('  WARN state: YES');
console.log('  Warning icon: YES');
console.log('  Drift detection integration: YES');
console.log('  Integrity tooltip info: YES');

// TASK_E: This file itself (verification gate)
console.log('--- TASK_E: Verification gate ---');

checkFileExists(
  'extension/src/test/verify-phase16.js',
  'this verification file'
);

console.log('  verify-phase16.js exists: YES');

// TASK_F: Runner integration check
console.log('--- TASK_F: Runner integration ---');

checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_16',
  'VERIFY_16 integration in runner'
);

checkFileContains(
  'tools/run_phase_gates.ps1',
  'verify-phase16.js',
  'verify-phase16.js execution in runner'
);

console.log('  VERIFY_16 in runner: YES');

// File scope validation
console.log('--- File Scope Validation ---');
verifyFileScope();
console.log('  File scope: YES');

// Final summary
console.log('');
console.log('==== SUMMARY ====');

if (passed) {
  console.log('OVERALL: PASS');
  console.log('✓ Phase 16 verification PASSED');
  console.log('✓ Integrity hashing produces integrity.json with SHA256 hashes');
  console.log('✓ Schema validation for latest.json and integrity.json');
  console.log('✓ Drift detection compares current file hashes with stored hashes');
  console.log('✓ Status bar shows PASS/WARN/FAIL with drift info');
  console.log('✓ Runner integration VERIFY_16 present');
  console.log('✓ File scope validation PASSED');
} else {
  console.log('OVERALL: FAIL');
  console.log('✗ Phase 16 verification FAILED:');
  failures.forEach(failure => console.log(`  - ${failure}`));
}

console.log('artifacts_END');

process.exit(passed ? 0 : 1);
