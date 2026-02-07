import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findLatestSession } from '../core/latestSession';

export async function showLatestSessionSummaryCommand(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const workspaceRoot = workspace.uri.fsPath;
  const latestSession = findLatestSession(workspaceRoot);

  if (!latestSession.found) {
    vscode.window.showWarningMessage('No sessions found. Start a session first.');
    return;
  }

  const summaryPath = path.join(latestSession.sessionDir, 'session_summary.json');

  if (!fs.existsSync(summaryPath)) {
    vscode.window.showWarningMessage(`Session summary not found for session ${latestSession.sessionId}. Stop the session to generate summary.`);
    return;
  }

  // Open the session_summary.json file
  try {
    const summaryUri = vscode.Uri.file(summaryPath);
    const document = await vscode.workspace.openTextDocument(summaryUri);
    await vscode.window.showTextDocument(document);
    
    vscode.window.showInformationMessage(`Opened session summary for session: ${latestSession.sessionId}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to open session summary: ${error}`);
  }
}