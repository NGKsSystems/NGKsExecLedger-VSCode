import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TaskState, LedgerEvent } from '../core/execLedgerState';
import {
  loadActiveContext,
  saveActiveContext,
  loadTaskMeta,
  saveTaskMeta,
  appendLedgerEvent,
} from '../core/execLedgerStore';
import { updateStatusBar, getIndicatorFromState } from '../core/execLedgerStatusBar';

export async function closeTaskCommand(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const workspaceRoot = workspace.uri.fsPath;
  const execLedgerRoot = path.join(workspaceRoot, '.execledger');

  if (!fs.existsSync(execLedgerRoot)) {
    vscode.window.showErrorMessage('No active task');
    return;
  }

  // Find latest session
  const dateFolders = fs
    .readdirSync(execLedgerRoot)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}$/))
    .sort()
    .reverse();

  if (dateFolders.length === 0) {
    vscode.window.showErrorMessage('No session found');
    return;
  }

  const latestDateFolder = dateFolders[0];
  const dateDir = path.join(execLedgerRoot, latestDateFolder);
  const sessionDirs = fs
    .readdirSync(dateDir)
    .filter(f => f.startsWith('session_'))
    .sort()
    .reverse();

  if (sessionDirs.length === 0) {
    vscode.window.showErrorMessage('No session found');
    return;
  }

  const latestSessionPath = path.join(dateDir, sessionDirs[0]);
  const contextData = loadActiveContext(latestSessionPath);

  if (!contextData.taskPath) {
    vscode.window.showErrorMessage('No active task');
    return;
  }

  // Seal task
  const taskMeta = loadTaskMeta(contextData.taskPath);
  taskMeta.state = TaskState.SEALED;
  taskMeta.sealedAt = new Date().toISOString();
  saveTaskMeta(contextData.taskPath, taskMeta);

  // Update context
  contextData.taskState = TaskState.SEALED;
  saveActiveContext(contextData);

  // Log event
  const event: LedgerEvent = {
    ts: new Date().toISOString(),
    kind: 'TASK_SEALED',
    sessionId: contextData.sessionId,
    taskId: contextData.taskId,
    payload: { totalSteps: taskMeta.totalSteps, sealed: true },
  };
  appendLedgerEvent(contextData.taskPath, event);

  // Clear active task
  contextData.taskId = undefined;
  contextData.taskPath = undefined;
  contextData.taskState = TaskState.READY;
  contextData.currentStep = undefined;
  contextData.stepState = undefined;
  saveActiveContext(contextData);

  // Update status bar
  updateStatusBar(getIndicatorFromState(TaskState.SEALED), 'ExecLedger: Ready');

  vscode.window.showInformationMessage(`✅ Task sealed with ${taskMeta.totalSteps} step(s).`);
}
