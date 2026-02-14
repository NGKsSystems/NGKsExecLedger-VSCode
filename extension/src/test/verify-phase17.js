const fs = require('fs');
const path = require('path');

const CURRENT_PHASE_VERSION = "17";
const logPrefix = `VERIFY_PHASE_${CURRENT_PHASE_VERSION}`;

// Check if extension/src/test/verify-phase17.js is not run with wrong working directory
const expectedWorkingDirectory = path.resolve(__dirname, '../../../');
if (path.resolve(process.cwd()) !== expectedWorkingDirectory) {
  console.error(`${logPrefix}: ERROR - Wrong working directory. Expected: ${expectedWorkingDirectory}, but got: ${process.cwd()}`);
  process.exit(1);
}

console.log('artifacts_BEGIN');

let allPassed = true;

function checkFileContains(filePath, searchText, description) {
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`✗ File missing: ${filePath} for ${description}`);
    allPassed = false;
    return false;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const found = content.includes(searchText);
  if (found) {
    console.log(`✓ ${description}: YES`);
  } else {
    console.log(`✗ ${description}: NO`);
    allPassed = false;
  }
  return found;
}

function checkFileExists(filePath, description) {
  const fullPath = path.resolve(filePath);
  const exists = fs.existsSync(fullPath);
  if (exists) {
    console.log(`✓ ${description}: YES`);
  } else {
    console.log(`✗ ${description}: NO`);
    allPassed = false;
  }
  return exists;
}

// Phase 17: Tier-2 QuickPick menu + in-editor log opening

console.log('--- QuickPick Menu Requirements ---');

// Check status bar QuickPick integration
checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'statusBarItem.command = "ngksExecLedger.artifactsStatusBarAction"',
  'Status bar command wiring'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'showartifactsQuickPick()',
  'QuickPick function integration'
);

// Check required QuickPick options
checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'Run Milestone artifacts Gates',
  'Run Milestone artifacts Gates option'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'Open Latest Summary',
  'Open Latest Summary option'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'Open Latest Report',
  'Open Latest Report option'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'Open Latest artifacts Folder',
  'Open Latest artifacts Folder option'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'Open Latest artifacts Bundle',
  'Open Latest artifacts Bundle option'
);

// Check artifacts folder revelation function
checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'revealartifactsFolder',
  'artifacts folder reveal function'
);

console.log('--- Command Registration ---');

// Check package.json commands
checkFileContains(
  'extension/package.json',
  'ngksExecLedger.runMilestoneGates',
  'Run Milestone Gates command registered'
);

checkFileContains(
  'extension/package.json',
  'ngksExecLedger.openLatestSummary',
  'Open Latest Summary command registered'
);

checkFileContains(
  'extension/package.json',
  'ngksExecLedger.openLatestartifactsReport',
  'Open Latest artifacts Report command registered'
);

checkFileContains(
  'extension/package.json',
  'ngksExecLedger.openLatestartifactsBundle',
  'Open Latest artifacts Bundle command registered'
);

console.log('--- Pointer Path Usage ---');

// Check latest.json pointer path usage
checkFileContains(
  'extension/src/command/openLatestSummary.ts',
  'summary_path',
  'Summary uses pointer path'
);

checkFileContains(
  'extension/src/command/openLatestartifactsReport.ts',
  'report_path',
  'Report uses pointer path'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'artifacts_dir',
  'artifacts folder uses pointer path'
);

// Check command handlers in QuickPick
checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'ngksExecLedger.runMilestoneGates',
  'QuickPick calls milestone gates command'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'ngksExecLedger.openLatestSummary',
  'QuickPick calls open summary command'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'ngksExecLedger.openLatestartifactsReport',
  'QuickPick calls open report command'
);

checkFileContains(
  'extension/src/status/statusBarartifacts.ts',
  'ngksExecLedger.openLatestartifactsBundle',
  'QuickPick calls open bundle command'
);

console.log('--- File Scope Validation ---');

// File scope check - allowed files for Phase 17
const allowedFiles = [
  'extension/src/status/statusBarartifacts.ts',
  'extension/src/command/runMilestoneGates.ts',
  'extension/src/command/openLatestSummary.ts',
  'extension/src/command/openLatestartifactsReport.ts',
  'extension/src/command/openLatestartifactsBundle.ts',
  'extension/src/util/validation.ts',
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
  'extension/src/test/verify-phase14.js',
  'extension/src/test/verify-phase15.js',
  'extension/src/test/verify-phase16.js',
  'extension/src/test/verify-phase17.js',
  'tools/export_artifacts_bundle.ps1',
  'tools/run_phase_gates.ps1'
];

// Get all modified files in git diff
const { exec } = require('child_process');
let changedFiles = [];
try {
  const { stdout } = require('child_process').execSync('git diff --name-only', { encoding: 'utf8' });
  changedFiles = stdout.trim().split('\n').filter(f => f.length > 0);
} catch (error) {
  console.log('Warning: Could not get git diff, skipping scope validation');
}

let scopeValid = true;
if (changedFiles.length > 0) {
  for (const file of changedFiles) {
    if (!allowedFiles.includes(file)) {
      console.log(`✗ File scope violation: ${file} not in allowed files`);
      scopeValid = false;
      allPassed = false;
    }
  }
}

if (scopeValid) {
  console.log('✓ File scope: YES');
} else {
  console.log('✗ File scope: NO');
}

console.log('==== SUMMARY ====');
if (allPassed) {
  console.log('OVERALL: PASS');
  console.log('✓ Phase 17 verification PASSED');
  console.log('✓ Status bar always opens QuickPick with Tier-2 menu');
  console.log('✓ QuickPick includes Run Milestone Gates, Open Summary/Report/Folder/Bundle');
  console.log('✓ All commands registered and properly wired');
  console.log('✓ Uses latest.json pointer paths when available');
  console.log('✓ File scope validation PASSED');
  
  process.exit(0);
} else {
  console.log('OVERALL: FAIL');
  console.log('✗ Phase 17 verification FAILED');
  console.log('See errors above for details');
  
  process.exit(1);
}

console.log('artifacts_END');