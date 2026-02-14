import * as vscode from 'vscode';
import { StatusIndicator, TaskState, StepState } from './execLedgerState';

let statusBarItem: vscode.StatusBarItem | null = null;

export function initStatusBar(context: vscode.ExtensionContext): void {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  // Remove command reference - no showStatus command exists
  context.subscriptions.push(statusBarItem);
  updateStatusBar(StatusIndicator.Blue, 'ExecLedger: Ready');
}

export function updateStatusBar(indicator: StatusIndicator, message: string): void {
  if (!statusBarItem) return;
  
  const colorMap: Record<StatusIndicator, string> = {
    [StatusIndicator.Green]: '$(check)',
    [StatusIndicator.Yellow]: '$(warning)',
    [StatusIndicator.Red]: '$(error)',
    [StatusIndicator.Blue]: '$(info)',
  };
  
  statusBarItem.text = `${colorMap[indicator]} ${message}`;
  statusBarItem.show();
}

export function getIndicatorFromState(taskState: TaskState, stepState?: StepState): StatusIndicator {
  if (taskState === TaskState.SEALED) {
    return StatusIndicator.Green;
  }
  if (taskState === TaskState.BLOCKED_AUDIT_GAP) {
    return StatusIndicator.Red;
  }
  if (stepState === StepState.AWAITING_ARTIFACTS) {
    return StatusIndicator.Yellow;
  }
  return StatusIndicator.Blue;
}
