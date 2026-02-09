// BINARY ACCEPTANCE TEST - Run with: node src/test/verify-phase3.4.js
// Tests the Phase 3.4 tamper-evident hash chain behavior.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { generateSessionSummary } = require('../../dist/core/sessionSummary');

const CHAIN_GENESIS = 'GENESIS';
const testRoot = path.join(__dirname, '../../.ngkssys/test_3_4');
const sessionId = `session-${Date.now()}`;
const sessionDir = path.join(testRoot, 'sessions', sessionId);

function cleanup() {
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const items = keys.map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${items.join(',')}}`;
  }
  return JSON.stringify(value);
}

function computeLineHash(prevHash, eventWithoutLineHash) {
  const canonical = stableStringify(eventWithoutLineHash);
  const payload = `${prevHash}\n${canonical}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function writeChainedChangesLog(changesLogPath, events) {
  let prevHash = CHAIN_GENESIS;
  let lastHash = CHAIN_GENESIS;

  for (const event of events) {
    const eventWithoutLineHash = { ...event, prevHash };
    const lineHash = computeLineHash(prevHash, eventWithoutLineHash);
    const chainedEvent = { ...eventWithoutLineHash, lineHash };
    fs.appendFileSync(changesLogPath, JSON.stringify(chainedEvent) + '\n', 'utf-8');
    prevHash = lineHash;
    lastHash = lineHash;
  }

  return lastHash;
}

function verify() {
  console.log('🔍 PHASE 3.4 BINARY ACCEPTANCE TEST\n');

  cleanup();
  fs.mkdirSync(sessionDir, { recursive: true });

  const baselinePath = path.join(sessionDir, 'baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify({ timestamp: '', files: [] }, null, 2));

  const changesLogPath = path.join(sessionDir, 'changes.log');
  const events = [
    { timestamp: new Date().toISOString(), eventType: 'create', path: 'alpha.txt', newHash: 'aaa' },
    { timestamp: new Date().toISOString(), eventType: 'modify', path: 'beta.txt', newHash: 'bbb' },
    { timestamp: new Date().toISOString(), eventType: 'delete', path: 'gamma.txt', oldHash: 'ccc' }
  ];

  const expectedHead = writeChainedChangesLog(changesLogPath, events);

  const rawLines = fs.readFileSync(changesLogPath, 'utf-8')
    .split('\n')
    .filter(line => line.trim());

  const hasPrevAndLine = rawLines.every(line => {
    const parsed = JSON.parse(line);
    return typeof parsed.prevHash === 'string' && typeof parsed.lineHash === 'string';
  });

  const summary = generateSessionSummary(sessionDir);
  const headMatches = summary.changesLogHeadHash === expectedHead;

  console.log(`  changes.log chained fields present: ${hasPrevAndLine ? 'YES' : 'NO'}`);
  console.log(`  changesLogHeadHash matches: ${headMatches ? 'YES' : 'NO'}`);

  console.log('\n📊 BINARY ACCEPTANCE RESULTS:');
  console.log(`A: ${hasPrevAndLine ? 'YES' : 'NO'} - prevHash/lineHash present`);
  console.log(`B: ${headMatches ? 'YES' : 'NO'} - summary head hash matches`);

  cleanup();
}

verify();
