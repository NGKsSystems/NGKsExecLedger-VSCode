import * as vscode from 'vscode';
import * as path from 'path';
import {
  getExecLedgerRoot,
  getSessionPath,
  getTaskPath,
  generateSid8,
  getLocalTimestamp,
  ensureDir,
} from '../core/execLedgerPaths';
import { TaskState, LedgerEvent } from '../core/execLedgerState';
import {
  loadSessionMeta,
  saveSessionMeta,
  loadTaskMeta,
  saveTaskMeta,
  loadActiveContext,
  saveActiveContext,
  appendLedgerEvent,
} from '../core/execLedgerStore';
import { updateStatusBar, getIndicatorFromState } from '../core/execLedgerStatusBar';

export async function openTaskCommand(context: vscode.ExtensionContext): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const taskName = await vscode.window.showInputBox({
    prompt: 'Enter task name',
    placeHolder: 'e.g., fix naming conventions',
  });

  if (!taskName) return;

  const workspaceRoot = workspace.uri.fsPath;
  const execLedgerRoot = getExecLedgerRoot(workspaceRoot);
  ensureDir(execLedgerRoot);

  const workspaceName = workspace.name || 'workspace';
  const timestamp = getLocalTimestamp();
  const sid8 = generateSid8();

  // Create or load session
  const sessionPath = getSessionPath(workspaceRoot, workspaceName, timestamp, sid8);
  ensureDir(sessionPath);

  let sessionMeta = loadSessionMeta(sessionPath);
  if (!sessionMeta.id) {
    sessionMeta.id = sid8;
    sessionMeta.timestamp = timestamp;
    sessionMeta.workspace = workspaceName;
    sessionMeta.status = 'ACTIVE';
    saveSessionMeta(sessionPath, sessionMeta);
  }

  // Create task
  const taskId = generateSid8();
  const taskPath = getTaskPath(sessionPath, taskName, timestamp, taskId);
  ensureDir(taskPath);

  const taskMeta: TaskMeta = {
    id: taskId,
    timestamp: getLocalTimestamp(),
    name: taskName,
    state: TaskState.IN_PROGRESS,
    createdAt: new Date().toISOString(),
    totalSteps: 0,
  };
  saveTaskMeta(taskPath, taskMeta);

  // Update active context - NO S0001 pre-creation
  const contextData: any = loadActiveContext(sessionPath);
  contextData.sessionId = sessionMeta.id;
  contextData.taskId = taskId;
  contextData.taskPath = taskPath;
  contextData.taskState = TaskState.IN_PROGRESS;
  contextData.currentStep = 0; // Will be set to 1 when Add Guidance creates first step
  contextData.stepState = undefined;
  saveActiveContext(contextData);

  // Log event
  const event: LedgerEvent = {
    ts: new Date().toISOString(),
    kind: 'TASK_OPENED',
    sessionId: sessionMeta.id,
    taskId: taskId,
    payload: { taskName },
  };
  appendLedgerEvent(taskPath, event);

  // Update status bar
  updateStatusBar(getIndicatorFromState(TaskState.IN_PROGRESS), `Task: ${taskName}`);

  vscode.window.showInformationMessage(`✅ Task "${taskName}" opened. Ready to add guidance.`);
}

interface TaskMeta {
  id: string;
  timestamp: string;
  name: string;
  state: TaskState;
  createdAt: string;
  sealedAt?: string;
  totalSteps: number;
}
