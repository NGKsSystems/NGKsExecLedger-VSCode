// File: src/core/sessionPaths.ts
// Single Path Authority - One source of truth for all session artifact paths

import * as path from "path";
import * as vscode from "vscode";

export interface SessionPaths {
  workspaceRoot: string;
  execRoot: string;
  sessionRoot: string;
  sessionId: string;
  jsonlPath: string;
  ngksSysRoot: string;
  baselinePath: string;
  changesLogPath: string;
  summaryPath: string;
  lockPath: string;
}

/**
 * Get workspace root path from VS Code workspace
 */
export function getWorkspaceRoot(): string {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    throw new Error("No workspace folder found");
  }
  return workspace.uri.fsPath;
}

/**
 * Get ExecLedger root directory for the workspace
 */
export function getExecRoot(outputRoot: string, workspaceName: string): string {
  const APP_ID = "ngks-vscode-autologger";
  return path.join(outputRoot, APP_ID, workspaceName);
}

/**
 * Get session-specific root directory
 */
export function getSessionRoot(execRoot: string, sessionId: string): string {
  return path.join(execRoot, sessionId);
}

/**
 * Get JSONL audit log path for session
 */
export function getJsonlPath(sessionRoot: string, sessionId: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[:]/g, "")
    .replace(/\./g, "")
    .replace("T", "_")
    .replace("Z", "");
  const filename = `${ts}_${sessionId}.jsonl`;
  return path.join(sessionRoot, filename);
}

/**
 * Get .ngkssys root directory in workspace
 */
export function getNgksSysRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, '.ngkssys');
}

/**
 * Get session directory inside .ngkssys
 */
export function getNgksSysSessionDir(ngksSysRoot: string, sessionId: string): string {
  return path.join(ngksSysRoot, 'sessions', sessionId);
}

/**
 * Get baseline.json path
 */
export function getBaselinePath(ngksSysSessionDir: string): string {
  return path.join(ngksSysSessionDir, 'baseline.json');
}

/**
 * Get changes.log path
 */
export function getChangesLogPath(ngksSysSessionDir: string): string {
  return path.join(ngksSysSessionDir, 'changes.log');
}

/**
 * Get session_summary.json path
 */
export function getSummaryPath(ngksSysSessionDir: string): string {
  return path.join(ngksSysSessionDir, 'session_summary.json');
}

/**
 * Get session lock file path
 */
export function getLockPath(execRoot: string): string {
  return path.join(execRoot, 'session.lock');
}

/**
 * Create complete SessionPaths object for a session
 */
export function createSessionPaths(outputRoot: string, workspaceName: string, sessionId: string): SessionPaths {
  const workspaceRoot = getWorkspaceRoot();
  const execRoot = getExecRoot(outputRoot, workspaceName);
  const sessionRoot = getSessionRoot(execRoot, sessionId);
  const ngksSysRoot = getNgksSysRoot(workspaceRoot);
  const ngksSysSessionDir = getNgksSysSessionDir(ngksSysRoot, sessionId);
  
  return {
    workspaceRoot,
    execRoot,
    sessionRoot,
    sessionId,
    jsonlPath: getJsonlPath(sessionRoot, sessionId),
    ngksSysRoot,
    baselinePath: getBaselinePath(ngksSysSessionDir),
    changesLogPath: getChangesLogPath(ngksSysSessionDir),
    summaryPath: getSummaryPath(ngksSysSessionDir),
    lockPath: getLockPath(execRoot)
  };
}