/**
 * Command to show QuickPick menu for tier-gated actions
 */
import * as vscode from 'vscode';
import { RetrievalController } from '../core/retrievalController';

export function registerExecLedgerQuickPickCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand('execLedger.openQuickPick', async () => {
    await showExecLedgerQuickPick();
  });

  context.subscriptions.push(command);
}

async function showExecLedgerQuickPick(): Promise<void> {
  const items: vscode.QuickPickItem[] = [
    {
      label: '$(file-text) Open Latest Summary',
      description: 'View latest summary.txt in editor',
      detail: 'Opens summary.txt from latest artifacts session'
    },
    {
      label: '$(file-code) Open Latest Report', 
      description: 'View latest report.txt in editor',
      detail: 'Opens report.txt from latest artifacts session'
    },
    {
      label: '$(folder-opened) Open Latest Artifacts Folder',
      description: 'Reveal artifacts folder in OS file explorer',
      detail: 'Opens the latest session directory'
    },
    {
      label: '$(play) Run Milestone Gates',
      description: 'Execute full milestone verification',
      detail: 'Runs all phase gates and generates artifacts bundle'
    }
  ];

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Choose an ExecLedger action'
  });

  if (!selected) return;

  try {
    if (selected.label.includes('Open Latest Summary')) {
      await vscode.commands.executeCommand('ngksExecLedger.openLatestSummary');
    } else if (selected.label.includes('Open Latest Report')) {
      await vscode.commands.executeCommand('ngksExecLedger.openLatestartifactsReport');
    } else if (selected.label.includes('Open Latest Artifacts Folder')) {
      // Use retrieval controller to get the folder path and reveal it
      const controller = new RetrievalController();
      const folderPath = controller.getLatestartifactsFolderPath();
      const uri = vscode.Uri.file(folderPath);
      await vscode.commands.executeCommand('revealFileInOS', uri);
    } else if (selected.label.includes('Run Milestone Gates')) {
      await vscode.commands.executeCommand('ngksExecLedger.runMilestoneGates');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: ${errorMessage}`);
  }
}