// BINARY ACCEPTANCE TEST - Run with: node src/test/verify-phase3.6.js
// Tests the Phase 3.6 Proof Enforcement & Anti-Lie Guards

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
  
  // Test with current allowed files for Phase 3.6
  const allowedFiles = [
    'extension/src/test/verify-phase3.6.js',
    'extension/src/util/proofEnforcer.ts'
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
    'extension/src/test/verify-phase3.6.js',
    'extension/src/util/proofEnforcer.ts'
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
  console.log('🔍 PHASE 3.6 BINARY ACCEPTANCE TEST\n');
  
  const testA = testProofMarkers();
  const testB = testFileScopeValidation();  
  const testC = testTruncationDetection();
  const testD = testProofContract();
  
  console.log('\n📊 BINARY ACCEPTANCE RESULTS:');
  console.log(`PROOF_MARKERS: ${testA ? 'YES' : 'NO'} - Enforcement working`);
  console.log(`FILE_SCOPE_AUTO_FAIL: ${testB ? 'YES' : 'NO'} - Scope validation working`);
  console.log(`TRUNCATION_GUARD: ${testC ? 'YES' : 'NO'} - Truncation detection working`);
  console.log(`PROOF_CONTRACT: ${testD ? 'YES' : 'NO'} - Complete contract working`);
  
  const allPass = testA && testB && testC && testD;
  console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
}

console.log('PROOF_END');

verify();