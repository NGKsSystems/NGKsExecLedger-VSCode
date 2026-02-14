/**
 * Premium Desktop Engine Verification Test
 * Tests CLI functionality and contract compliance
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('=== PREMIUM DESKTOP ENGINE VERIFICATION ===');

// Test setup
const testRoot = path.join(process.cwd(), 'execledger', 'fixtures_premium_engine');
const enginePath = path.join(process.cwd(), 'desktop-companion', 'engine', 'src', 'index.js');

try {
  // Clean up any previous test data
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });

  // Create test fixture structure for layout detection priority
  // Test case 1: Newest exec with flat layout (should be selected due to newest priority)
  const newestExec = path.join(testRoot, 'exec_zzz_newest_flat');
  fs.mkdirSync(newestExec, { recursive: true });
  fs.writeFileSync(path.join(newestExec, 'summary.txt'), 'Newest flat exec summary content');
  fs.writeFileSync(path.join(newestExec, 'report.txt'), 'Newest flat exec report content');

  // Test case 2: Mid exec with direct session layout
  const midExec = path.join(testRoot, 'exec_mmm_mid_direct');
  const midSession = path.join(midExec, 'direct-session-xyz789');
  fs.mkdirSync(midSession, { recursive: true });
  fs.writeFileSync(path.join(midSession, 'summary.txt'), 'Mid direct session summary content');
  fs.writeFileSync(path.join(midSession, 'report.txt'), 'Mid direct session report content');

  // Test case 3: Older exec with milestone layout
  const oldExec = path.join(testRoot, 'exec_aaa_old_milestone');
  const oldMilestone = path.join(oldExec, 'milestone');
  const oldSession = path.join(oldMilestone, 'milestone-session-pqr567');
  fs.mkdirSync(oldSession, { recursive: true });
  fs.writeFileSync(path.join(oldSession, 'summary.txt'), 'Old milestone session summary content');
  fs.writeFileSync(path.join(oldSession, 'report.txt'), 'Old milestone session report content');

  // Create test fixture structure for backward compatibility
  // Older exec folder
  const olderExec = path.join(testRoot, 'exec_1234567890');
  const olderMilestone = path.join(olderExec, 'milestone');
  const olderSession = path.join(olderMilestone, 'old-session-abc123');
  fs.mkdirSync(olderSession, { recursive: true });
  fs.writeFileSync(path.join(olderSession, 'summary.txt'), 'Old session summary content');
  fs.writeFileSync(path.join(olderSession, 'report.txt'), 'Old session report content');

  // Newer exec folder  
  const newerExec = path.join(testRoot, 'exec_2345678901');
  const newerMilestone = path.join(newerExec, 'milestone');
  const newerSession = path.join(newerMilestone, 'new-session-def456');
  fs.mkdirSync(newerSession, { recursive: true });
  fs.writeFileSync(path.join(newerSession, 'summary.txt'), 'New session summary content');
  fs.writeFileSync(path.join(newerSession, 'report.txt'), 'New session report content');

  // Set timestamps to ensure deterministic ordering
  const now = Date.now();
  const olderTime = now - 120000; // 2 minutes ago

  fs.utimesSync(olderSession, new Date(olderTime), new Date(olderTime));
  fs.utimesSync(newerSession, new Date(now), new Date(now));

  // Test 1: Latest session resolution - should pick newest (flat exec) based on priority
  console.log('Testing latest session resolution (layout priority)...');
  const latestResult = execSync(`node "${enginePath}" --root "${testRoot}" --latest`, { encoding: 'utf8' });
  const latestContract = JSON.parse(latestResult.trim());

  // Verify it picked the newest exec (flat layout)
  if (!latestContract.sessionRoot.includes('exec_zzz_newest_flat')) {
    console.log(`PREMIUM_ENGINE_OK=NO - Wrong session selected: ${latestContract.sessionRoot}`);
    console.log('Expected: exec_zzz_newest_flat');
    process.exit(1);
  }

  if (latestContract.sessionId !== 'exec_zzz_newest_flat') {
    console.log(`PREMIUM_ENGINE_OK=NO - Wrong sessionId for flat exec: ${latestContract.sessionId}`);
    process.exit(1);
  }

  // Test 2: Specific session resolution with different layouts
  console.log('Testing specific session resolution (milestone layout)...');
  const milestoneResult = execSync(`node "${enginePath}" --root "${testRoot}" --exec "exec_aaa_old_milestone" --session "milestone-session-pqr567"`, { encoding: 'utf8' });
  const milestoneContract = JSON.parse(milestoneResult.trim());

  if (!milestoneContract.sessionRoot.includes('milestone-session-pqr567')) {
    console.log(`PREMIUM_ENGINE_OK=NO - Milestone session not found: ${milestoneContract.sessionRoot}`);
    process.exit(1);
  }

  console.log('Testing specific session resolution (direct session layout)...');
  const directResult = execSync(`node "${enginePath}" --root "${testRoot}" --exec "exec_mmm_mid_direct" --session "direct-session-xyz789"`, { encoding: 'utf8' });
  const directContract = JSON.parse(directResult.trim());

  if (!directContract.sessionRoot.includes('direct-session-xyz789')) {
    console.log(`PREMIUM_ENGINE_OK=NO - Direct session not found: ${directContract.sessionRoot}`);
    process.exit(1);
  }

  // Test 3: Backward compatibility test
  console.log('Testing backward compatibility...');
  const specificResult = execSync(`node "${enginePath}" --root "${testRoot}" --exec "exec_1234567890" --session "old-session-abc123"`, { encoding: 'utf8' });
  const specificContract = JSON.parse(specificResult.trim());

  if (!specificContract.sessionRoot.includes('old-session-abc123')) {
    console.log(`PREMIUM_ENGINE_OK=NO - Backward compatibility session not found: ${specificContract.sessionRoot}`);
    process.exit(1);
  }

  // Test 4: Missing files warning (use older exec to avoid affecting latest)
  console.log('Testing missing files warning...');
  const missingSession = path.join(olderMilestone, 'missing-files-session');
  fs.mkdirSync(missingSession, { recursive: true });
  // Don't create summary.txt or report.txt

  const missingResult = execSync(`node "${enginePath}" --root "${testRoot}" --exec "exec_1234567890" --session "missing-files-session"`, { encoding: 'utf8' });
  const missingContract = JSON.parse(missingResult.trim());

  if (!missingContract.warnings || missingContract.warnings.length === 0) {
    console.log(`PREMIUM_ENGINE_OK=NO - Expected warnings for missing files`);
    process.exit(1);
  }

  if (!missingContract.warnings.includes('summary.txt missing')) {
    console.log(`PREMIUM_ENGINE_OK=NO - Expected summary.txt missing warning`);
    process.exit(1);
  }

  // Test 5: Output to file
  console.log('Testing file output...');
  const outputFile = path.join(testRoot, 'test-output.json');
  execSync(`node "${enginePath}" --root "${testRoot}" --latest --out "${outputFile}"`, { encoding: 'utf8' });
  
  if (!fs.existsSync(outputFile)) {
    console.log(`PREMIUM_ENGINE_OK=NO - Output file not created: ${outputFile}`);
    process.exit(1);
  }

  const outputContent = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  if (outputContent.sessionId !== 'exec_zzz_newest_flat') {
    console.log(`PREMIUM_ENGINE_OK=NO - Output file content mismatch, expected: exec_zzz_newest_flat, got: ${outputContent.sessionId}`);
    process.exit(1);
  }

  // Test 6: Error handling - no sessions found
  console.log('Testing error handling...');
  const emptyRoot = path.join(testRoot, 'empty');
  fs.mkdirSync(emptyRoot, { recursive: true });

  try {
    execSync(`node "${enginePath}" --root "${emptyRoot}" --latest`, { encoding: 'utf8', stdio: 'pipe' });
    console.log(`PREMIUM_ENGINE_OK=NO - Should have failed with empty root`);
    process.exit(1);
  } catch (error) {
    if (error.status !== 3) {
      console.log(`PREMIUM_ENGINE_OK=NO - Wrong exit code for empty root: ${error.status}`);
      process.exit(1);
    }
  }

  console.log('PREMIUM_ENGINE_OK=YES');

  // Clean up test fixtures
  fs.rmSync(testRoot, { recursive: true, force: true });

} catch (error) {
  console.log(`PREMIUM_ENGINE_OK=NO - Error: ${error.message}`);
  if (error.stdout) {
    console.log('STDOUT:', error.stdout.toString());
  }
  if (error.stderr) {
    console.log('STDERR:', error.stderr.toString());
  }
  process.exit(1);
}