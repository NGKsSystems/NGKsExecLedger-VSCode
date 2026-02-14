#!/usr/bin/env node

// Phase 9 verification gate - command to open latest artifacts bundle
// This verifies all Phase 9 deliverables are correctly implemented

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

// Verify file scope - only allowed Phase 9 files should be modified
function verifyFileScope() {
  const allowedFiles = [
    'extension/package.json',
    'extension/src/extension.ts', 
    'extension/src/command/openLatestartifactsBundle.ts',
    'extension/src/command/openLatestartifactsReport.ts',
    'extension/src/command/openLatestSummary.ts',
    'extension/src/command/copyLatestSummary.ts',
    'extension/src/command/runMilestoneGates.ts',
    'extension/src/status/statusBarartifacts.ts',
    'extension/src/test/verify-phase9.js',
    'tools/run_phase_gates.ps1',
    'tools/export_artifacts_bundle.ps1',
    'extension/src/test/verify-phase3.8.js',
    'extension/src/test/verify-phase3.9.js', 
    'extension/src/test/verify-phase5.js',
    'extension/src/test/verify-phase6.js',
    'extension/src/test/verify-phase7.js',
    'extension/src/test/verify-phase8.js',
    'extension/src/test/verify-phase10.js',
    'extension/src/test/verify-phase11.js',
    'extension/src/test/verify-phase12.js',
    'extension/src/test/verify-phase13.js',
    'extension/src/test/verify-phase14.js',
    'extension/src/test/verify-phase15.js',
    'extension/src/test/verify-phase16.js',
    'extension/src/test/verify-phase17.js',
    'extension/src/util/validation.ts'
  ];

  try {
    const gitStatus = execSync('git status --porcelain=v1', { encoding: 'utf8', cwd: path.join(__dirname, '../../..') });
    const modifiedFiles = gitStatus
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3)); // Remove git status prefix

    const disallowedFiles = modifiedFiles.filter(file => !allowedFiles.includes(file));
    if (disallowedFiles.length > 0) {
      fail(`Phase 9 scope violation: unexpected files modified: ${disallowedFiles.join(', ')}`);
    }
  } catch (error) {
    fail(`Failed to check git status: ${error.message}`);
  }
}

// TASK_A: Command exists in package.json
checkFileContains(
  'extension/package.json',
  '"command": "ngksExecLedger.openLatestartifactsBundle"',
  'command definition in package.json'
);

checkFileContains(
  'extension/package.json', 
  '"title": "ExecLedger: Open Latest artifacts Bundle"',
  'command title in package.json'
);

// TASK_B: Command file exists with correct structure
checkFileExists(
  'extension/src/command/openLatestartifactsBundle.ts',
  'openLatestartifactsBundle.ts command file'
);

checkFileContains(
  'extension/src/command/openLatestartifactsBundle.ts',
  'export function registerOpenLatestartifactsBundleCommand',
  'register function in command file'
);

checkFileContains(
  'extension/src/command/openLatestartifactsBundle.ts',
  '"ngksExecLedger.openLatestartifactsBundle"',
  'correct command id in command file'
);

checkFileContains(
  'extension/src/command/openLatestartifactsBundle.ts',
  'latest.json',
  'latest.json reading logic'
);

// TASK_C: Extension.ts registers the command
checkFileContains(
  'extension/src/extension.ts',
  'import { registerOpenLatestartifactsBundleCommand }',
  'import statement in extension.ts'
);

checkFileContains(
  'extension/src/extension.ts',
  'registerOpenLatestartifactsBundleCommand(context)',
  'command registration in extension.ts'
);

// TASK_E: Runner integration check basic structure 
checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_9',
  'VERIFY_9 integration in runner'
);

// TASK_D: This file itself (verification gate)
checkFileExists(
  'extension/src/test/verify-phase9.js',
  'this verification file'
);

// File scope validation
verifyFileScope();

if (passed) {
  console.log('✓ Phase 9 verification PASSED');
  console.log('✓ Command ngksExecLedger.openLatestartifactsBundle defined');
  console.log('✓ Command implementation exists with latest.json logic');
  console.log('✓ Extension registration completed');
  console.log('✓ Runner integration present');
  console.log('✓ File scope validation PASSED');
} else {
  console.log('✗ Phase 9 verification FAILED:');
  failures.forEach(failure => console.log(`  - ${failure}`));
}

console.log('artifacts_END');

process.exit(passed ? 0 : 1);