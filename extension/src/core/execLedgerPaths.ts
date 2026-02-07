import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

/**
 * Helper: Generate sid8 (first 8 chars of UUID without hyphens)
 */
export function generateSid8(): string {
  const uuid = randomUUID();
  return uuid.replace(/-/g, '').substring(0, 8);
}

/**
 * Helper: Get local YYYYMMDD-HHmmss timestamp
 */
export function getLocalTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

/**
 * Helper: Get date folder YYYY-MM-DD
 */
export function getDateFolder(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Slugify a task name (lowercase, alphanumeric + dash)
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build ExecLedger root: workspaceRoot/.execledger
 */
export function getExecLedgerRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.execledger');
}

/**
 * Build root active.json: workspaceRoot/.execledger/active.json
 */
export function getRootActivePath(workspaceRoot: string): string {
  return path.join(getExecLedgerRoot(workspaceRoot), 'active.json');
}

/**
 * Build date folder: .execledger/YYYY-MM-DD
 */
export function getDatePath(workspaceRoot: string, dateFolder?: string): string {
  const df = dateFolder || getDateFolder();
  return path.join(getExecLedgerRoot(workspaceRoot), df);
}

/**
 * Build session folder: .execledger/YYYY-MM-DD/session_YYYYMMDD-HHmmss_<workspace>_<sid8>
 */
export function getSessionPath(
  workspaceRoot: string,
  workspaceName: string,
  timestamp?: string,
  sid8?: string
): string {
  const ts = timestamp || getLocalTimestamp();
  const s8 = sid8 || generateSid8();
  const sessionDir = `session_${ts}_${workspaceName}_${s8}`;
  return path.join(getDatePath(workspaceRoot), sessionDir);
}

/**
 * Build task folder: session_path/task_YYYYMMDD-HHmmss_<slug>_<sid8>
 */
export function getTaskPath(
  sessionPath: string,
  taskName: string,
  timestamp?: string,
  sid8?: string
): string {
  const ts = timestamp || getLocalTimestamp();
  const s8 = sid8 || generateSid8();
  const slug = slugify(taskName);
  const taskDir = `task_${ts}_${slug}_${s8}`;
  return path.join(sessionPath, taskDir);
}

/**
 * Build step folder: task_path/S####
 */
export function getStepPath(taskPath: string, stepNumber: number): string {
  const stepDir = `S${String(stepNumber).padStart(4, '0')}`;
  return path.join(taskPath, stepDir);
}

/**
 * Ensure directory exists (recursive)
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}
