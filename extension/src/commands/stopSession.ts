import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { generateSessionSummary, saveSessionSummary } from '../core/sessionSummary';
import { clearActiveTracker } from './startSession';

export async function stopSessionCommand(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const workspaceRoot = workspace.uri.fsPath;
  const activeSessionPath = path.join(workspaceRoot, '.ngkssys', 'activeSession.json');

  // Read activeSession.json
  if (!fs.existsSync(activeSessionPath)) {
    vscode.window.showErrorMessage('No active session');
    return;
  }

  const activeData = JSON.parse(fs.readFileSync(activeSessionPath, 'utf-8'));
  const sessionId = activeData.sessionId;

  // Update session.json
  const sessionDir = path.join(workspaceRoot, '.ngkssys', 'sessions', sessionId);
  const sessionPath = path.join(sessionDir, 'session.json');
  if (!fs.existsSync(sessionPath)) {
    vscode.window.showErrorMessage('Session file not found');
    return;
  }

  const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
  sessionData.stoppedAt = new Date().toISOString();
  sessionData.status = 'closed';
  fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');

  // Stop filesystem change tracker (TASK 2)
  clearActiveTracker();

  // Generate session summary (TASK 3)
  const summary = generateSessionSummary(sessionDir);
  const summaryPath = path.join(sessionDir, 'session_summary.json');
  saveSessionSummary(summary, summaryPath);

  // Delete activeSession.json
  fs.unlinkSync(activeSessionPath);

  vscode.window.showInformationMessage(
    `Session stopped: ${sessionId} (${summary.filesChanged ? 'Changes detected' : 'No changes'})`
  );
}
