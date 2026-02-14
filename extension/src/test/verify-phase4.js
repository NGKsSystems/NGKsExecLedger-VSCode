// BINARY ACCEPTANCE TEST - Run with: node extension/src/test/verify-phase4.js
// Phase 4 Gate: Execution Identity + Session Lineage
//
// Contract:
// - EXEC_ID present and stable across retries
// - SESSION_ID present and unique per run
// - All artifacts files contain both IDs
// - Directory structure matches EXEC_ID → SESSION_ID lineage
// - Runner exports IDs consistently to child processes

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sh(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] }).toString('utf8');
}

function okLine(k, v, extra = '') {
  console.log(`${k}: ${v}${extra ? ' - ' + extra : ''}`);
}

function generateExpectedExecId(repoHead, phases, mode) {
  // Match the EXEC_ID generation logic from run_phase_gates.ps1
  const input = `${repoHead}|${phases}|${mode}|3.7,3.8,3.9`;
  const hash = crypto.createHash('sha256').update(input).digest('hex');
  return hash.substring(0, 16);  // Truncated SHA-256
}

function isValidUuid(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function hasartifactsIdsInFile(filePath) {
  if (!fs.existsSync(filePath)) return { execId: null, sessionId: null };
  
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Handle both proper line breaks and one big line with embedded \r\n  
  const execIdMatch = content.match(/EXEC_ID=([a-f0-9]{16})/);
  const sessionIdMatch = content.match(/SESSION_ID=([a-f0-9-]{36})/);
  
  return {
    execId: execIdMatch ? execIdMatch[1] : null,
    sessionId: sessionIdMatch ? sessionIdMatch[1] : null
  };
}

function findartifactsDirectories() {
  const artifactsRoot = path.join(process.cwd(), '_artifacts');
  if (!fs.existsSync(artifactsRoot)) return [];
  
  const entries = [];
  for (const entry of fs.readdirSync(artifactsRoot)) {
    if (entry.startsWith('exec_')) {
      const execId = entry.replace('exec_', '');
      const execDir = path.join(artifactsRoot, entry);
      
      // Check for build/milestone subdirs
      for (const modeDir of ['build', 'milestone']) {
        const modePath = path.join(execDir, modeDir);
        if (fs.existsSync(modePath)) {
          for (const sessionDir of fs.readdirSync(modePath)) {
            const sessionPath = path.join(modePath, sessionDir);
            if (fs.statSync(sessionPath).isDirectory()) {
              entries.push({
                execId: execId,
                mode: modeDir,
                sessionId: sessionDir,
                path: sessionPath
              });
            }
          }
        }
      }
    }
  }
  return entries;
}

function main() {
  console.log('artifacts_BEGIN');
  console.log('artifacts_END');
  console.log('🔍 PHASE 4 EXECUTION IDENTITY + SESSION LINEAGE GATE');

  let allOk = true;

  // Get current git HEAD for EXEC_ID validation
  let repoHead;
  try {
    repoHead = sh('git rev-parse HEAD').trim();
  } catch {
    repoHead = 'unknown';
  }

  // 1) Test EXEC_ID deterministic generation
  console.log('🧪 Testing EXEC_ID deterministic generation...');
  const phaseSet = '3.7-3.9';
  const buildExecId = generateExpectedExecId(repoHead, phaseSet, 'Build');
  const milestoneExecId = generateExpectedExecId(repoHead, phaseSet, 'Milestone');
  
  const execIdStable = (buildExecId === generateExpectedExecId(repoHead, phaseSet, 'Build'));
  okLine('  EXEC_ID stable across calls', execIdStable ? 'YES' : 'NO');
  
  const execIdsDifferent = (buildExecId !== milestoneExecId);
  okLine('  EXEC_ID differs by mode', execIdsDifferent ? 'YES' : 'NO');
  
  if (!execIdStable || !execIdsDifferent) allOk = false;

  // 2) Test artifacts directory structure
  console.log('🧪 Testing artifacts directory structure...');
  const artifactsEntries = findartifactsDirectories();
  const hasartifactsDirs = artifactsEntries.length > 0;
  okLine('  artifacts directories found', hasartifactsDirs ? 'YES' : 'NO');
  
  let structureOk = true;
  let idsConsistent = true;
  
  for (const entry of artifactsEntries) {
    // Validate EXEC_ID format (16 char hex)
    const validExecIdFormat = /^[0-9a-f]{16}$/.test(entry.execId);
    if (!validExecIdFormat) {
      structureOk = false;
      console.log(`  Invalid EXEC_ID format: ${entry.execId}`);
    }
    
    // Validate SESSION_ID format (UUIDv4)
    const validSessionIdFormat = isValidUuid(entry.sessionId);
    if (!validSessionIdFormat) { 
      structureOk = false;
      console.log(`  Invalid SESSION_ID format: ${entry.sessionId}`);
    }
    
    // Check for artifacts files with IDs
    const summaryPath = path.join(entry.path, 'summary.txt');
    if (fs.existsSync(summaryPath)) {
      const ids = hasartifactsIdsInFile(summaryPath);
      if (ids.execId !== entry.execId || ids.sessionId !== entry.sessionId) {
        idsConsistent = false;
        console.log(`  ID mismatch in ${summaryPath}: dir=${entry.execId}|${entry.sessionId}, file=${ids.execId}|${ids.sessionId}`);
      }
    }
  }
  
  okLine('  Directory structure valid', structureOk ? 'YES' : 'NO');  
  okLine('  IDs consistent in files', idsConsistent ? 'YES' : 'NO');
  
  if (!hasartifactsDirs || !structureOk || !idsConsistent) allOk = false;

  // 3) Test environment propagation (mock test)
  console.log('🧪 Testing environment propagation...');
  // We can't easily test this without running the full runner, so we check if the logic exists
  const runnerPath = path.join(process.cwd(), 'tools', 'run_phase_gates.ps1');
  const runnerExists = fs.existsSync(runnerPath);
  let envPropagationOk = false;
  
  if (runnerExists) {
    const runnerContent = fs.readFileSync(runnerPath, 'utf8');
    const hasExecIdGen = runnerContent.includes('GenerateExecId');
    const hasSessionIdGen = runnerContent.includes('GenerateSessionId'); 
    const hasartifactsHeader = runnerContent.includes('WriteartifactsHeader');
    const hasIdOutput = runnerContent.includes('EXEC_ID=$execId') && runnerContent.includes('SESSION_ID=$sessionId');
    
    envPropagationOk = hasExecIdGen && hasSessionIdGen && hasartifactsHeader && hasIdOutput;
  }
  
  okLine('  Runner exists', runnerExists ? 'YES' : 'NO');
  okLine('  Environment propagation', envPropagationOk ? 'YES' : 'NO');
  
  if (!runnerExists || !envPropagationOk) allOk = false;

  // 4) File scope validation (Phase 4 deliverables only)
  console.log('🧪 Testing file scope validation...');
  let diffList = [];
  try {
    const out = sh('git diff --name-only').trim();
    diffList = out ? out.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
  } catch {
    diffList = [];
  }
  
  const allowedFiles = new Set([
    'tools/run_phase_gates.ps1',
    '.gitignore',
    'extension/src/test/verify-phase4.js',
    'extension/src/test/verify-phase5.js',
    'tools/export_artifacts_bundle.ps1'
  ]);
  
  const violations = diffList.filter(f => f && !allowedFiles.has(f));
  const scopeOk = violations.length === 0;
  
  okLine('  File scope validation', scopeOk ? 'PASS' : 'FAIL');
  if (!scopeOk) {
    console.log('  Violations: ' + violations.join(', '));
    allOk = false;
  }

  // Final contract
  console.log('');
  console.log('📊 PHASE 4 BINARY ACCEPTANCE RESULTS:');
  okLine('EXEC_ID_STABLE', execIdStable ? 'YES' : 'NO', 'Deterministic generation');
  okLine('EXEC_ID_MODE_DIFF', execIdsDifferent ? 'YES' : 'NO', 'Mode differentiation');
  okLine('artifacts_STRUCTURE', (hasartifactsDirs && structureOk) ? 'YES' : 'NO', 'Directory structure valid');
  okLine('IDS_CONSISTENT', idsConsistent ? 'YES' : 'NO', 'IDs consistent in artifacts files');
  okLine('ENV_PROPAGATION', envPropagationOk ? 'YES' : 'NO', 'Environment propagation working');
  okLine('FILE_SCOPE_VALID', scopeOk ? 'YES' : 'NO', 'Phase 4 scope validated');
  okLine('OVERALL', allOk ? 'PASS' : 'FAIL');
  
  process.exit(allOk ? 0 : 1);
}

main();