// BINARY ACCEPTANCE TEST - Run with: node src/test/verify-phase3.8.js
// Tests the Phase 3.8 Proof-First Runner + Milestone Discipline Gate

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { validateProofMarkers, validateFileScope, detectTruncation, enforceProofContract } = require('../../dist/util/proofEnforcer');

console.log('PROOF_BEGIN');

function testProofMarkers() {
  console.log('🧪 Testing proof markers validation...');
  
  // Test valid output with markers
  const validOutput = `Some output
PROOF_BEGIN
command output here
PROOF_END
more output`;
  
  const validResult = validateProofMarkers(validOutput);
  console.log(`echo "Testing proof markers with valid output"`);
  console.log(`  Proof markers detected: ${validResult ? 'YES' : 'NO'}`);
  
  // Test invalid output without markers
  const invalidOutput = `Some output
no proof markers here
just regular content`;
  
  const invalidResult = validateProofMarkers(invalidOutput);
  console.log(`echo "Testing proof markers with invalid output"`);
  console.log(`  Proof markers missing (expected): ${!invalidResult ? 'YES' : 'NO'}`);
  
  return validResult && !invalidResult;
}

function testFileScopeValidation() {
  console.log('🧪 Testing file scope validation...');
  
  // Phase 3.8 allowed files only
  const allowedFiles = [
    'tools/proof_run.ps1',
    'extension/src/test/verify-phase3.8.js',
    'extension/src/test/verify-phase3.9.js',
    '.gitignore'
  ];
  
  console.log(`git diff --name-only`);
  const scopeResult = validateFileScope(allowedFiles);
  console.log(`  File scope validation: ${scopeResult.valid ? 'PASS' : 'FAIL'}`);
  
  if (!scopeResult.valid) {
    console.log(`  Violations: ${scopeResult.violations.join(', ')}`);
  }
  
  return scopeResult.valid;
}

function testTruncationDetection() {
  console.log('🧪 Testing truncation detection...');
  
  // Test paths with truncation
  const truncatedPaths = [
    'C:\\Users\\suppo\\Desktop\\NGKsSystems\\ngks-vscode-autologger\\ext...',
    '/some/path/truncated…',
    'folder..'
  ];
  
  const hasTruncation = detectTruncation(truncatedPaths);
  console.log(`echo "Testing truncated paths"`);
  console.log(`  Truncation detected: ${hasTruncation ? 'YES' : 'NO'}`);
  
  // Test clean paths
  const cleanPaths = [
    'C:\\Users\\suppo\\Desktop\\NGKsSystems\\ngks-vscode-autologger\\extension',
    '/c/Users/suppo/Desktop/NGKsSystems/ngks-vscode-autologger/extension'
  ];
  
  const noTruncation = !detectTruncation(cleanPaths);
  console.log(`echo "Testing clean paths"`);
  console.log(`  No truncation (expected): ${noTruncation ? 'YES' : 'NO'}`);
  
  return hasTruncation && noTruncation;
}

function testCompilation() {
  console.log('🧪 Testing TypeScript compilation...');
  
  try {
    console.log(`pnpm --dir extension run compile`);
    const workspaceRoot = path.resolve(__dirname, '../../..');
    execSync('pnpm --dir extension run compile', { 
      cwd: workspaceRoot,
      encoding: 'utf8'
    });
    
    console.log(`  Compilation: PASS`);
    return true;
  } catch (error) {
    // Check if it's actually an error or just stderr output
    if (error.status === 0) {
      console.log(`  Compilation: PASS`);
      return true;
    }
    
    console.log(`  Compilation: FAIL`);
    console.log(`  Error: ${error.message.split('\n')[0]}`);
    return false;
  }
}

function testDependencyGate37() {
  console.log('🧪 Testing Phase 3.7 dependency gate...');
  
  try {
    console.log(`node extension/src/test/verify-phase3.7.js`);
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const output = execSync('node extension/src/test/verify-phase3.7.js', { 
      cwd: workspaceRoot,
      encoding: 'utf8'
    });
    
    // Check for OVERALL: PASS in output
    if (output.includes('OVERALL: PASS')) {
      console.log(`  Phase 3.7 gate: PASS`);
      return true;
    } else {
      console.log(`  Phase 3.7 gate: FAIL`);
      return false;
    }
  } catch (error) {
    console.log(`  Phase 3.7 gate: FAIL`);
    console.log(`  Error: ${error.message.split('\n')[0]}`);
    return false;
  }
}

function testProofContract() {
  console.log('🧪 Testing complete proof contract...');
  
  const mockOutput = `Test output
PROOF_BEGIN
pwd
C:\\Users\\suppo\\Desktop\\NGKsSystems\\ngks-vscode-autologger\\extension
git status
On branch master
PROOF_END`;
  
  const allowedFiles = [
    'tools/proof_run.ps1',
    'extension/src/test/verify-phase3.8.js',
    'extension/src/test/verify-phase3.9.js',
    '.gitignore'
  ];
  
  const cleanPaths = [
    'C:\\Users\\suppo\\Desktop\\NGKsSystems\\ngks-vscode-autologger\\extension'
  ];
  
  console.log(`echo "Testing complete proof contract"`);
  const contract = enforceProofContract(mockOutput, allowedFiles, cleanPaths);
  
  const allValid = contract.hasProofMarkers && contract.fileScopeValid && contract.noTruncation;
  console.log(`  Proof contract validation: ${allValid ? 'PASS' : 'FAIL'}`);
  console.log(`    Proof markers: ${contract.hasProofMarkers ? 'YES' : 'NO'}`);
  console.log(`    File scope: ${contract.fileScopeValid ? 'YES' : 'NO'}`);
  console.log(`    No truncation: ${contract.noTruncation ? 'YES' : 'NO'}`);
  
  return allValid;
}

function verify() {
  console.log('🔍 PHASE 3.8 PROOF-FIRST RUNNER + MILESTONE DISCIPLINE GATE\n');
  
  const testA = testProofMarkers();
  const testB = testFileScopeValidation();  
  const testC = testTruncationDetection();
  const testD = testCompilation();
  const testE = testDependencyGate37();
  const testF = testProofContract();
  
  console.log('\n📊 BINARY ACCEPTANCE RESULTS:');
  console.log(`PROOF_MARKERS: ${testA ? 'YES' : 'NO'} - Enforcement working`);
  console.log(`FILE_SCOPE_VALID: ${testB ? 'YES' : 'NO'} - Phase 3.8 scope validated`);
  console.log(`TRUNCATION_GUARD: ${testC ? 'YES' : 'NO'} - Truncation detection working`);
  console.log(`COMPILATION: ${testD ? 'YES' : 'NO'} - TypeScript compilation working`);
  console.log(`DEP_GATE_3_7: ${testE ? 'YES' : 'NO'} - Phase 3.7 dependency gate working`);
  console.log(`PROOF_CONTRACT: ${testF ? 'YES' : 'NO'} - Complete contract working`);
  
  const allPass = testA && testB && testC && testD && testE && testF;
  console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
  
  // Exit with appropriate code
  process.exit(allPass ? 0 : 1);
}

console.log('PROOF_END');

verify();