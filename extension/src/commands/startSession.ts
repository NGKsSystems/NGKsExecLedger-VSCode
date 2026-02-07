import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { createBaseline, saveBaseline } from '../core/filesystemBaseline';
import { FilesystemChangeTracker } from '../core/filesystemChangeTracker';

let activeTracker: FilesystemChangeTracker | null = null;

export async function startSessionCommand(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const sessionId = randomUUID();
  const startedAt = new Date().toISOString();
  const workspaceRoot = workspace.uri.fsPath;

  // Create session folder
  const sessionsDir = path.join(workspaceRoot, '.ngkssys', 'sessions', sessionId);
  fs.mkdirSync(sessionsDir, { recursive: true });

  // Write session.json
  const sessionData = {
    sessionId,
    startedAt,
    status: 'active'
  };
  const sessionPath = path.join(sessionsDir, 'session.json');
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');

  // Write activeSession.json
  const activeSessionPath = path.join(workspaceRoot, '.ngkssys', 'activeSession.json');
  const activeData = { sessionId };
  fs.writeFileSync(activeSessionPath, JSON.stringify(activeData, null, 2), 'utf-8');

  // Create baseline snapshot (TASK 1)
  const baseline = createBaseline(workspaceRoot);
  const baselinePath = path.join(sessionsDir, 'baseline.json');
  saveBaseline(baseline, baselinePath);

  // Start filesystem change tracker (TASK 2)
  activeTracker = new FilesystemChangeTracker(workspaceRoot, sessionId);
  activeTracker.start();

  vscode.window.showInformationMessage(`Session started: ${sessionId}`);
}

export function getActiveTracker(): FilesystemChangeTracker | null {
  return activeTracker;
}

export function clearActiveTracker(): void {
  if (activeTracker) {
    activeTracker.stop();
    activeTracker = null;
  }
}
