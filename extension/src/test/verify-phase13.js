#!/usr/bin/env node

// Phase 13 verification gate - run milestone proof gates command
// This verifies all Phase 13 deliverables are correctly implemented

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

// Verify file scope - only allowed Phase 13 files should be modified
function verifyFileScope() {
  const allowedFiles = [
    'extension/package.json',
    'extension/src/extension.ts', 
    'extension/src/command/runMilestoneGates.ts',
    'extension/src/command/openLatestProofReport.ts',
    'extension/src/command/openLatestSummary.ts',
    'extension/src/command/copyLatestSummary.ts',
    'extension/src/status/statusBarProof.ts',
    'extension/src/test/verify-phase13.js',
    'tools/run_phase_gates.ps1',
    'tools/export_proof_bundle.ps1',
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
    'extension/src/test/verify-phase14.js',
    'extension/src/test/verify-phase15.js'
  ];

  try {
    const gitStatus = execSync('git status --porcelain=v1', { encoding: 'utf8', cwd: path.join(__dirname, '../../..') });
    const modifiedFiles = gitStatus
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3)); // Remove git status prefix

    const disallowedFiles = modifiedFiles.filter(file => !allowedFiles.includes(file));
    if (disallowedFiles.length > 0) {
      fail(`Phase 13 scope violation: unexpected files modified: ${disallowedFiles.join(', ')}`);
    }
  } catch (error) {
    fail(`Failed to check git status: ${error.message}`);
  }
}

// TASK_A: Command exists in package.json
checkFileContains(
  'extension/package.json',
  '"command": "ngksExecLedger.runMilestoneGates"',
  'command definition in package.json'
);

checkFileContains(
  'extension/package.json', 
  '"title": "ExecLedger: Run Milestone Proof Gates"',
  'command title in package.json'
);

// TASK_B: Implementation file exists with correct structure
checkFileExists(
  'extension/src/command/runMilestoneGates.ts',
  'runMilestoneGates.ts command file'
);

checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'export function registerRunMilestoneGatesCommand',
  'register function in command file'
);

checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  '"ngksExecLedger.runMilestoneGates"',
  'correct command id in command file'
);

// PowerShell runner invocation
checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'powershell -NoProfile -ExecutionPolicy Bypass -File',
  'PowerShell runner invocation'
);

checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'run_phase_gates.ps1',
  'runner script path'
);

checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  '-Mode Milestone -ExportBundle Auto',
  'correct runner parameters'
);

// Summary reading logic
checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'summary.txt',
  'summary reading logic'
);

checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'findNewestMilestoneSummary',
  'function to find newest summary'
);

checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'parseSummaryResults',
  'function to parse summary results'
);

// Phase 12 proof status bar refresh integration
checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'import { refreshProofStatus }',
  'import of proof status bar refresh function'
);

checkFileContains(
  'extension/src/command/runMilestoneGates.ts',
  'refreshProofStatus()',
  'call to refresh proof status bar'
);

// TASK_C: Extension.ts registers the command
checkFileContains(
  'extension/src/extension.ts',
  'import { registerRunMilestoneGatesCommand }',
  'import statement for run milestone gates command in extension.ts'
);

checkFileContains(
  'extension/src/extension.ts',
  'registerRunMilestoneGatesCommand(context)',
  'command registration in extension.ts'
);

// TASK_E: Runner integration check basic structure 
checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_13',
  'VERIFY_13 integration in runner'
);

// TASK_D: This file itself (verification gate)
checkFileExists(
  'extension/src/test/verify-phase13.js',
  'this verification file'
);

// File scope validation
verifyFileScope();

if (passed) {
  console.log('✓ Phase 13 verification PASSED');
  console.log('✓ Command ngksExecLedger.runMilestoneGates defined');
  console.log('✓ Implementation file exists with PowerShell runner invocation');
  console.log('✓ Summary reading and parsing logic implemented');
  console.log('✓ Phase 12 proof status bar refresh integration present');
  console.log('✓ Extension registration completed');
  console.log('✓ Runner integration present');
  console.log('✓ File scope validation PASSED');
} else {
  console.log('✗ Phase 13 verification FAILED:');
  failures.forEach(failure => console.log(`  - ${failure}`));
}

console.log('PROOF_END');

process.exit(passed ? 0 : 1);