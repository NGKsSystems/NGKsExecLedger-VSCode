// BINARY ACCEPTANCE TEST - Run with: node src/test/verify-phase3.5.js
// Tests the Phase 3.5 Filesystem Self-Defense Hardening

const fs = require('fs');
const path = require('path');
const { createBaseline } = require('../../dist/core/filesystemBaseline');

const testRoot = path.join(__dirname, '../../.ngkssys/test_3_5');

function cleanup() {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

function createTestWorkspace() {
  // Create test workspace structure
  fs.mkdirSync(testRoot, { recursive: true });
  
  // Create legitimate files
  fs.writeFileSync(path.join(testRoot, 'app.js'), 'console.log("app");');
  fs.writeFileSync(path.join(testRoot, 'README.md'), '# Test App');
  
  // Create directories that should be ignored
  const historyDir = path.join(testRoot, '.history');
  fs.mkdirSync(historyDir, { recursive: true });
  fs.writeFileSync(path.join(historyDir, 'old_file.txt'), 'should not be scanned');
  
  const gitDir = path.join(testRoot, '.git');
  fs.mkdirSync(gitDir, { recursive: true });
  fs.writeFileSync(path.join(gitDir, 'config'), 'git config');
  
  const nodeModulesDir = path.join(testRoot, 'node_modules');
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  fs.writeFileSync(path.join(nodeModulesDir, 'package.json'), '{}');
  
  // Create directory with .ngksignore sentinel
  const blockedDir = path.join(testRoot, 'blocked_section');
  fs.mkdirSync(blockedDir, { recursive: true });
  fs.writeFileSync(path.join(blockedDir, '.ngksignore'), 'traversal blocked');
  fs.writeFileSync(path.join(blockedDir, 'secret.txt'), 'should not be scanned');
  
  // Create subdirectory inside blocked section
  const subBlockedDir = path.join(blockedDir, 'subfolder');
  fs.mkdirSync(subBlockedDir, { recursive: true });
  fs.writeFileSync(path.join(subBlockedDir, 'deep_secret.txt'), 'should not be scanned');
}

function testIgnoreContract() {
  console.log('🧪 Testing ignore contract...');
  
  createTestWorkspace();
  
  // Run baseline creation (uses filesystem traversal)
  const baseline = createBaseline(testRoot);
  const foundFiles = baseline.files.map(f => f.relativePath);
  
  // Check that legitimate files are found
  const hasApp = foundFiles.includes('app.js');
  const hasReadme = foundFiles.includes('README.md');
  
  // Check that ignored directories are NOT scanned
  const hasHistoryFile = foundFiles.some(f => f.includes('.history/'));
  const hasGitFile = foundFiles.some(f => f.includes('.git/'));
  const hasNodeModulesFile = foundFiles.some(f => f.includes('node_modules/'));
  
  // Check that .ngksignore blocks traversal
  const hasBlockedFile = foundFiles.some(f => f.includes('blocked_section/'));
  
  console.log(`  Legitimate files found: ${hasApp && hasReadme ? 'YES' : 'NO'}`);
  console.log(`  .history blocked: ${!hasHistoryFile ? 'YES' : 'NO'}`);
  console.log(`  .git blocked: ${!hasGitFile ? 'YES' : 'NO'}`);
  console.log(`  node_modules blocked: ${!hasNodeModulesFile ? 'YES' : 'NO'}`);
  console.log(`  .ngksignore sentinel enforced: ${!hasBlockedFile ? 'YES' : 'NO'}`);
  
  const ignoreContractWorking = !hasHistoryFile && !hasGitFile && !hasNodeModulesFile;
  const sentinelEnforced = !hasBlockedFile;
  
  cleanup();
  
  return { ignoreContractWorking, sentinelEnforced };
}

function verify() {
  console.log('🔍 PHASE 3.5 BINARY ACCEPTANCE TEST\n');
  
  const results = testIgnoreContract();
  
  console.log('\n📊 BINARY ACCEPTANCE RESULTS:');
  console.log(`IGNORE_CONTRACT: ${results.ignoreContractWorking ? 'YES' : 'NO'} - Core patterns blocked`);
  console.log(`SENTINEL_ENFORCED: ${results.sentinelEnforced ? 'YES' : 'NO'} - .ngksignore blocks traversal`);
  
  const allPass = results.ignoreContractWorking && results.sentinelEnforced;
  console.log(`OVERALL: ${allPass ? 'PASS' : 'FAIL'}`);
}

verify();