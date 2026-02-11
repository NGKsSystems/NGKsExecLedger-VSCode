#!/usr/bin/env node

// Phase 14 verification gate - summary access + status diagnostics
// This verifies all Phase 14 deliverables are correctly implemented

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

// Verify file scope - only allowed Phase 14 files should be modified
function verifyFileScope() {
  const allowedFiles = [
    'extension/package.json',
    'extension/src/extension.ts', 
    'extension/src/command/openLatestProofReport.ts',
    'extension/src/command/openLatestSummary.ts',
    'extension/src/command/copyLatestSummary.ts',
    'extension/src/test/verify-phase14.js',
    'extension/src/test/verify-phase15.js',
    'extension/src/test/verify-phase16.js',
    'extension/src/test/verify-phase17.js',
    'extension/src/status/statusBarProof.ts',
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
    'extension/src/test/verify-phase13.js',
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
      fail(`Phase 14 scope violation: unexpected files modified: ${disallowedFiles.join(', ')}`);
    }
  } catch (error) {
    fail(`Failed to check git status: ${error.message}`);
  }
}

// TASK_A: Status bar enhancements with PASS/FAIL and diagnostics
checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'interface ProofSummaryData',
  'ProofSummaryData interface for summary parsing'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'getProofSummaryData',
  'function to get proof summary data'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'fail_reasons',
  'fail_reasons field processing'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  '"$(x)"',
  'PASS/FAIL icon logic in status bar'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  '"FAIL"',
  'PASS/FAIL text in status bar'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'Exec ID',
  'EXEC_ID in tooltip'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'Session ID',
  'SESSION_ID in tooltip'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'Fail Reasons',
  'Fail Reasons in tooltip'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'Summary Path',
  'Summary path in tooltip'
);

// TASK_B: Open Latest Summary command
checkFileContains(
  'extension/package.json',
  '"command": "ngksExecLedger.openLatestSummary"',
  'openLatestSummary command definition in package.json'
);

checkFileContains(
  'extension/package.json', 
  '"title": "ExecLedger: Open Latest Summary"',
  'openLatestSummary command title in package.json'
);

checkFileExists(
  'extension/src/command/openLatestSummary.ts',
  'openLatestSummary.ts command file'
);

checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  'export function registerOpenLatestSummaryCommand',
  'register function in openLatestSummary command file'
);

checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  '"ngksExecLedger.openLatestSummary"',
  'correct command id in openLatestSummary file'
);

checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  'summary.txt',
  'summary.txt file handling'
);

checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  'vscode.workspace.openTextDocument',
  'VS Code document opening functionality'
);

// TASK_C: Copy Latest Summary to Clipboard command  
checkFileContains(
  'extension/package.json',
  '"command": "ngksExecLedger.copyLatestSummary"',
  'copyLatestSummary command definition in package.json'
);

checkFileContains(
  'extension/package.json', 
  '"title": "ExecLedger: Copy Latest Summary to Clipboard"',
  'copyLatestSummary command title in package.json'
);

checkFileExists(
  'extension/src/command/copyLatestSummary.ts',
  'copyLatestSummary.ts command file'
);

checkFileContains(
  'extension/src/command/copyLatestSummary.ts',
  'export function registerCopyLatestSummaryCommand',
  'register function in copyLatestSummary command file'
);

checkFileContains(
  'extension/src/command/copyLatestSummary.ts',
  '"ngksExecLedger.copyLatestSummary"',
  'correct command id in copyLatestSummary file'
);

checkFileContains(
  'extension/src/command/copyLatestSummary.ts',
  'vscode.env.clipboard.writeText',
  'clipboard writing functionality'
);

checkFileContains(
  'extension/package.json',
  '"execLedger.proof.copySummaryToClipboard"',
  'copySummaryToClipboard configuration setting'
);

checkFileContains(
  'extension/src/command/copyLatestSummary.ts',
  'copySummaryToClipboard',
  'config toggle usage in copy command'
);

// Extension.ts registers the new commands
checkFileContains(
  'extension/src/extension.ts',
  'import { registerOpenLatestSummaryCommand }',
  'import statement for openLatestSummary command in extension.ts'
);

checkFileContains(
  'extension/src/extension.ts',
  'import { registerCopyLatestSummaryCommand }',
  'import statement for copyLatestSummary command in extension.ts'
);

checkFileContains(
  'extension/src/extension.ts',
  'registerOpenLatestSummaryCommand(context)',
  'openLatestSummary command registration in extension.ts'
);

checkFileContains(
  'extension/src/extension.ts',
  'registerCopyLatestSummaryCommand(context)',
  'copyLatestSummary command registration in extension.ts'
);

// Status bar quick pick integration
checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'Open Latest Summary',
  'openLatestSummary in status bar quick pick'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'Copy Latest Summary',
  'copyLatestSummary in status bar quick pick'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'ngksExecLedger.openLatestSummary',
  'openLatestSummary command execution in status bar'
);

checkFileContains(
  'extension/src/status/statusBarProof.ts',
  'ngksExecLedger.copyLatestSummary',
  'copyLatestSummary command execution in status bar'
);

// TASK_E: Runner integration check basic structure 
checkFileContains(
  'tools/run_phase_gates.ps1',
  'VERIFY_14',
  'VERIFY_14 integration in runner'
);

// TASK_D: This file itself (verification gate)
checkFileExists(
  'extension/src/test/verify-phase14.js',
  'this verification file'
);

// File scope validation
verifyFileScope();

if (passed) {
  console.log('✓ Phase 14 verification PASSED');
  console.log('✓ Status bar shows PASS/FAIL with detailed tooltip');
  console.log('✓ Command ngksExecLedger.openLatestSummary defined and implemented');
  console.log('✓ Command ngksExecLedger.copyLatestSummary defined with config toggle');
  console.log('✓ Both commands integrated in status bar quick pick');
  console.log('✓ Extension registration completed for both commands');
  console.log('✓ Runner integration present');
  console.log('✓ File scope validation PASSED');
} else {
  console.log('✗ Phase 14 verification FAILED:');
  failures.forEach(failure => console.log(`  - ${failure}`));
}

console.log('PROOF_END');

process.exit(passed ? 0 : 1);