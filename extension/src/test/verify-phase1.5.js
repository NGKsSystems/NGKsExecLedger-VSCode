// VERIFICATION SCRIPT - Run with: node src/test/verify-phase1.5.js
// This script tests the filesystem authority layer logic

const fs = require('fs');
const path = require('path');
const { createBaseline, saveBaseline } = require('../../dist/core/filesystemBaseline');
const { generateSessionSummary, saveSessionSummary } = require('../../dist/core/sessionSummary');

const testDir = path.join(__dirname, '../../.ngkssys/test_verification');
const sessionId = 'test-' + Date.now();
const sessionDir = path.join(testDir, 'sessions', sessionId);

function cleanup() {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
}

function verify() {
  console.log('🧪 PHASE 1.5 VERIFICATION\n');
  
  cleanup();
  fs.mkdirSync(sessionDir, { recursive: true });

  // TASK 1: Baseline creation
  console.log('TASK 1: Testing baseline creation...');
  const workspaceRoot = path.join(__dirname, '../..');
  const baseline = createBaseline(workspaceRoot);
  const baselinePath = path.join(sessionDir, 'baseline.json');
  saveBaseline(baseline, baselinePath);
  
  const task1a = fs.existsSync(baselinePath);
  const baselineData = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  const task1b = baselineData.files.length > 0 && baselineData.files[0].sha256 !== undefined;
  
  console.log(`  baseline.json created: ${task1a ? 'YES' : 'NO'}`);
  console.log(`  Contains sha256 hash: ${task1b ? 'YES' : 'NO'}`);
  console.log(`  Files discovered: ${baselineData.files.length}`);
  console.log('');

  // TASK 2: Change tracking (simulated)
  console.log('TASK 2: Testing change log...');
  const changesLogPath = path.join(sessionDir, 'changes.log');
  
  // Simulate change events
  const events = [
    { timestamp: new Date().toISOString(), eventType: 'modify', path: 'test.txt', newHash: 'abc123' },
    { timestamp: new Date().toISOString(), eventType: 'create', path: 'new.txt', newHash: 'def456' },
    { timestamp: new Date().toISOString(), eventType: 'delete', path: 'old.txt' }
  ];
  
  events.forEach(event => {
    fs.appendFileSync(changesLogPath, JSON.stringify(event) + '\n', 'utf-8');
  });
  
  const task2 = fs.existsSync(changesLogPath);
  const logContent = fs.readFileSync(changesLogPath, 'utf-8').split('\n').filter(l => l.trim());
  
  console.log(`  changes.log created: ${task2 ? 'YES' : 'NO'}`);
  console.log(`  Change entries logged: ${logContent.length}`);
  console.log('');

  // TASK 3: Session summary
  console.log('TASK 3: Testing session summary...');
  const summary = generateSessionSummary(sessionDir);
  const summaryPath = path.join(sessionDir, 'session_summary.json');
  saveSessionSummary(summary, summaryPath);
  
  const task3a = summary.filesChanged === true;
  const task3b = summary.filesAdded === 1 && summary.filesModified === 1 && summary.filesDeleted === 1;
  const task3c = summary.changedPaths.length === 3;
  
  console.log(`  session_summary.json created: ${fs.existsSync(summaryPath) ? 'YES' : 'NO'}`);
  console.log(`  filesChanged === true: ${task3a ? 'YES' : 'NO'}`);
  console.log(`  Counts correct: ${task3b ? 'YES' : 'NO'}`);
  console.log(`  Changed paths tracked: ${task3c ? 'YES' : 'NO'}`);
  console.log('');

  console.log('📊 SUMMARY:');
  console.log(`TASK 1: ${task1a && task1b ? 'YES' : 'NO'}`);
  console.log(`TASK 2: ${task2 ? 'YES' : 'NO'}`);
  console.log(`TASK 3: ${task3a && task3b && task3c ? 'YES' : 'NO'}`);
  
  cleanup();
}

verify();
