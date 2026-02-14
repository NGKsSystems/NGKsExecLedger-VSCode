import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getStepPath, ensureDir } from '../core/execLedgerPaths';
import { StepState, TaskState, LedgerEvent } from '../core/execLedgerState';
import {
  loadActiveContext,
  saveActiveContext,
  loadTaskMeta,
  saveTaskMeta,
  appendLedgerEvent,
} from '../core/execLedgerStore';
import { updateStatusBar, getIndicatorFromState } from '../core/execLedgerStatusBar';

export async function addGuidanceCommand(): Promise<void> {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const workspaceRoot = workspace.uri.fsPath;
  const execLedgerRoot = path.join(workspaceRoot, '.execledger');

  // Find latest session by looking at active.json in latest date folder
  const dateFolders = fs.readdirSync(execLedgerRoot)
    .filter(f => f.match(/^\d{4}-\d{2}-\d{2}$/))
    .sort()
    .reverse();

  if (dateFolders.length === 0) {
    vscode.window.showErrorMessage('No ExecLedger session. Open a task first.');
    return;
  }

  // Find latest session in date folder
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
    vscode.window.showErrorMessage('No active task. Open a task first.');
    return;
  }

  const guidanceText = activeEditor.document.getText();

  // Increment step number
  const currentStep = (contextData.currentStep || 0) + 1;
  const stepPath = getStepPath(contextData.taskPath, currentStep);
  ensureDir(stepPath);
  ensureDir(path.join(stepPath, 'artifacts'));

  const guidancePath = path.join(stepPath, 'guidance.md');
  fs.writeFileSync(guidancePath, guidanceText, 'utf-8');

  // Create stub validate.json
  const validatePath = path.join(stepPath, 'validate.json');
  fs.writeFileSync(validatePath, JSON.stringify({}, null, 2), 'utf-8');

  // Update context: step now AWAITING_ARTIFACTS
  contextData.currentStep = currentStep;
  contextData.stepState = StepState.AWAITING_ARTIFACTS;
  saveActiveContext(contextData);

  // Update task meta
  const taskMeta = loadTaskMeta(contextData.taskPath);
  taskMeta.totalSteps = Math.max(taskMeta.totalSteps, currentStep);
  saveTaskMeta(contextData.taskPath, taskMeta);

  // Log event
  const event: LedgerEvent = {
    ts: new Date().toISOString(),
    kind: 'GUIDANCE_ADDED',
    sessionId: contextData.sessionId,
    taskId: contextData.taskId,
    step: currentStep,
    payload: { guidanceLength: guidanceText.length },
  };
  appendLedgerEvent(contextData.taskPath, event);

  // Update status bar
  updateStatusBar(
    getIndicatorFromState(TaskState.IN_PROGRESS, StepState.AWAITING_ARTIFACTS),
    `Task: Awaiting Artifacts [S${String(currentStep).padStart(4, '0')}]`
  );

  vscode.window.showInformationMessage(
    `✅ Guidance saved (Step ${currentStep}). Awaiting artifacts bundle.`
  );
}
