import * as fs from 'fs';
import * as path from 'path';
import { ActiveContext, TaskMeta, SessionMeta, LedgerEvent } from './execLedgerState';
import { ensureDir } from './execLedgerPaths';

const TEMP_SUFFIX = '.tmp';

/**
 * Atomic write: write to temp, then rename
 */
function atomicWriteJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const tempPath = filePath + TEMP_SUFFIX;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
  fs.renameSync(tempPath, filePath);
}

/**
 * Read JSON safely
 */
function readJson<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

/**
 * Load or create root active context
 */
export function loadRootActiveContext(rootActivePath: string): ActiveContext {
  return readJson<ActiveContext>(rootActivePath, {
    sessionId: '',
    sessionPath: '',
    taskState: 'READY' as any,
  });
}

/**
 * Save root active context atomically
 */
export function saveRootActiveContext(rootActivePath: string, context: ActiveContext): void {
  atomicWriteJson(rootActivePath, context);
}

/**
 * Load or create active context within session
 */
export function loadActiveContext(sessionPath: string): ActiveContext {
  const activePath = path.join(sessionPath, 'active.json');
  return readJson<ActiveContext>(activePath, {
    sessionId: '',
    sessionPath,
    taskState: 'READY' as any,
  });
}

/**
 * Save active context within session atomically
 */
export function saveActiveContext(context: ActiveContext): void {
  const activePath = path.join(context.sessionPath, 'active.json');
  atomicWriteJson(activePath, context);
}

/**
 * Load or create session meta
 */
export function loadSessionMeta(sessionPath: string): SessionMeta {
  const metaPath = path.join(sessionPath, 'session.meta.json');
  return readJson<SessionMeta>(metaPath, {
    id: '',
    timestamp: '',
    workspace: '',
    status: 'ACTIVE',
    openedAt: new Date().toISOString(),
  });
}

/**
 * Save session meta atomically
 */
export function saveSessionMeta(sessionPath: string, meta: SessionMeta): void {
  const metaPath = path.join(sessionPath, 'session.meta.json');
  atomicWriteJson(metaPath, meta);
}

/**
 * Load or create task meta
 */
export function loadTaskMeta(taskPath: string): TaskMeta {
  const metaPath = path.join(taskPath, 'task.meta.json');
  return readJson<TaskMeta>(metaPath, {
    id: '',
    timestamp: '',
    name: '',
    state: 'READY' as any,
    createdAt: new Date().toISOString(),
    totalSteps: 0,
  });
}

/**
 * Save task meta atomically
 */
export function saveTaskMeta(taskPath: string, meta: TaskMeta): void {
  const metaPath = path.join(taskPath, 'task.meta.json');
  atomicWriteJson(metaPath, meta);
}

/**
 * Append event to ledger.jsonl
 */
export function appendLedgerEvent(taskPath: string, event: LedgerEvent): void {
  const ledgerPath = path.join(taskPath, 'ledger.jsonl');
  ensureDir(path.dirname(ledgerPath));
  const line = JSON.stringify(event) + '\n';
  fs.appendFileSync(ledgerPath, line, 'utf-8');
}
