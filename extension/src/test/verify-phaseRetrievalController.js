const path = require('path');
const fs = require('fs');

console.log('=== PHASE 2 RETRIEVAL CONTROLLER VERIFICATION ===');

// Create test fixtures
const fixturesPath = path.join(process.cwd(), '_artifacts', 'fixtures');
if (!fs.existsSync(fixturesPath)) {
  fs.mkdirSync(fixturesPath, { recursive: true });
}

// Clean up any previous test data
const testDirs = fs.readdirSync(fixturesPath).filter(name => name.startsWith('exec_'));
testDirs.forEach(dir => {
  fs.rmSync(path.join(fixturesPath, dir), { recursive: true, force: true });
});

try {
  // Create two test exec directories with different timestamps
  const older = path.join(fixturesPath, 'exec_1000000000');
  const newer = path.join(fixturesPath, 'exec_2000000000');  
  
  // Create older session structure
  const olderMilestone = path.join(older, 'milestone');
  const olderSession = path.join(olderMilestone, 'old-session-id');
  fs.mkdirSync(olderSession, { recursive: true });
  fs.writeFileSync(path.join(olderSession, 'summary.txt'), 'old summary');
  fs.writeFileSync(path.join(olderSession, 'report.txt'), 'old report');
  
  // Create newer session structure  
  const newerMilestone = path.join(newer, 'milestone');
  const newerSession = path.join(newerMilestone, 'new-session-id');
  fs.mkdirSync(newerSession, { recursive: true });
  fs.writeFileSync(path.join(newerSession, 'summary.txt'), 'new summary');
  fs.writeFileSync(path.join(newerSession, 'report.txt'), 'new report');
  
  // Adjust timestamps to ensure deterministic ordering
  const now = Date.now();
  const olderTime = now - 60000; // 1 minute ago
  
  fs.utimesSync(olderSession, new Date(olderTime), new Date(olderTime));
  fs.utimesSync(newerSession, new Date(now), new Date(now));
  
  // Test the retrieval controller
  const { RetrievalController } = require('../../dist/core/retrievalController');
  const controller = new RetrievalController(fixturesPath);
  
  const latestSummary = controller.getLatestSummaryPath();
  const latestReport = controller.getLatestReportPath();
  const latestFolder = controller.getLatestartifactsFolderPath();
  
  // Verify it picked the newer session
  const expectedFolder = newerSession;
  if (latestFolder !== expectedFolder) {
    console.log(`RETRIEVAL_CONTROLLER_OK=NO - Expected ${expectedFolder}, got ${latestFolder}`);
    process.exit(1);
  }
  
  if (latestSummary !== path.join(newerSession, 'summary.txt')) {
    console.log(`RETRIEVAL_CONTROLLER_OK=NO - Wrong summary path: ${latestSummary}`);
    process.exit(1);
  }
  
  if (latestReport !== path.join(newerSession, 'report.txt')) {
    console.log(`RETRIEVAL_CONTROLLER_OK=NO - Wrong report path: ${latestReport}`);
    process.exit(1);
  }
  
  // Verify files exist and have correct content
  const summaryContent = fs.readFileSync(latestSummary, 'utf8');
  if (summaryContent !== 'new summary') {
    console.log(`RETRIEVAL_CONTROLLER_OK=NO - Wrong summary content: ${summaryContent}`);
    process.exit(1);
  }
  
  console.log('RETRIEVAL_CONTROLLER_OK=YES');
  
  // Clean up test fixtures
  testDirs.forEach(dir => {
    fs.rmSync(path.join(fixturesPath, dir), { recursive: true, force: true });
  });
  fs.rmSync(path.join(fixturesPath, 'exec_1000000000'), { recursive: true, force: true });
  fs.rmSync(path.join(fixturesPath, 'exec_2000000000'), { recursive: true, force: true });
  
} catch (error) {
  console.log(`RETRIEVAL_CONTROLLER_OK=NO - Error: ${error.message}`);
  process.exit(1);
}