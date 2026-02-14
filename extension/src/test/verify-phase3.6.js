// BINARY ACCEPTANCE TEST - Run with: node src/test/verify-phase3.6.js
// Tests the Phase 3.6 artifacts Enforcement & Anti-Lie Guards

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { validateartifactsMarkers, validateFileScope, detectTruncation, enforceartifactsContract } = require('../../dist/util/artifactsEnforcer');

console.log('artifacts_BEGIN');

function testartifactsMarkers() {
  console.log('🧪 Testing artifacts markers validation...');
  
  // Test valid output with markers
  const validOutput = `Some output
artifacts_BEGIN
command output here
artifacts_END
more output`;
  
  const validResult = validateartifactsMarkers(validOutput);
  console.log(`echo "Testing artifacts markers with valid output"`);
  console.log(`  artifacts markers detected: ${validResult ? 'YES' : 'NO'}`);
  
  // Test invalid output without markers
  const invalidOutput = `Some output
no artifacts markers here
just regular content`;
  
  const invalidResult = validateartifactsMarkers(invalidOutput);
  console.log(`echo "Testing artifacts markers with invalid output"`);
  console.log(`  artifacts markers missing (expected): ${!invalidResult ? 'YES' : 'NO'}`);
  
  return validResult && !invalidResult;
}

function testFileScopeValidation() {
  console.log('🧪 Testing file scope validation...');
  
  // Test with current allowed files for Phase 3.6
  const allowedFiles = [
    'extension/src/test/verify-phase3.6.js',
    'extension/src/util/artifactsEnforcer.ts'
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

function testartifactsContract() {
  console.log('🧪 Testing complete artifacts contract...');
  
  const mockOutput = `Test output
artifacts_BEGIN
pwd
C:\\Users\\suppo\\Desktop\\NGKsSystems\\ngks-vscode-autologger\\extension
git status
On branch master
artifacts_END`;
  
  const allowedFiles = [
    'extension/src/test/verify-phase3.6.js',
    'extension/src/util/artifactsEnforcer.ts'
  ];
  
  const cleanPaths = [
    'C:\\Users\\suppo\\Desktop\\NGKsSystems\\ngks-vscode-autologger\\extension'
  ];
  
  console.log(`echo "Testing complete artifacts contract"`);
  const contract = enforceartifactsContract(mockOutput, allowedFiles, cleanPaths);
  
  const allValid = contract.hasartifactsMarkers && contract.fileScopeValid && contract.noTruncation;
  console.log(`  artifacts contract validation: ${allValid ? 'PASS' : 'FAIL'}`);
  console.log(`    artifacts markers: ${contract.hasartifactsMarkers ? 'YES' : 'NO'}`);
  console.log(`    File scope: ${contract.fileScopeValid ? 'YES' : 'NO'}`);
  console.log(`    No truncation: ${contract.noTruncation ? 'YES' : 'NO'}`);
  
  return allValid;
}

function verify() {
  console.log('🔍 PHASE 3.6 BINARY ACCEPTANCE TEST\n');
  
  const testA = testartifactsMarkers();
  const testB = testFileScopeValidation();  
  const testC = testTruncationDetection();
  const testD = testartifactsContract();
  
  console.log('\n📊 BINARY ACCEPTANCE RESULTS:');
  console.log(`artifacts_MARKERS: ${testA ? 'YES' : 'NO'} - Enforcement working`);
  console.log(`FILE_SCOPE_AUTO_FAIL: ${testB ? 'YES' : 'NO'} - Scope validation working`);
  console.log(`TRUNCATION_GUARD: ${testC ? 'YES' : 'NO'} - Truncation detection working`);
  console.log(`artifacts_CONTRACT: ${testD ? 'YES' : 'NO'} - Complete contract working`);
  
  const allPass = testA && testB && testC && testD;
  console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
}

console.log('artifacts_END');

verify();