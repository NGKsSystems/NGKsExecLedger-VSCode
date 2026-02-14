import * as vscode from "vscode";
import * as path from "path";
import { SessionManager } from "./core/sessionManager";
import { activateExtension } from "./activate";
import { deactivateExtension } from "./deactivate";
import { CrashGuard } from "./core/crashGuard";
import { openTaskCommand } from "./commands/execLedgerOpenTask";
import { addGuidanceCommand } from "./commands/execLedgerAddGuidance";
import { closeTaskCommand } from "./commands/execLedgerCloseTask";
import { showLatestSessionSummaryCommand } from "./commands/showSessionSummary";
import { showChangedFilesCommand } from "./commands/showChangedFiles";
import { registerExportartifactsBundleCommand } from "./command/exportartifactsBundle";
import { registerOpenLatestartifactsBundleCommand } from "./command/openLatestartifactsBundle";
import { registerOpenLatestSummaryCommand } from "./command/openLatestSummary";
import { registerCopyLatestSummaryCommand } from "./command/copyLatestSummary";
import { registerOpenLatestartifactsReportCommand } from "./command/openLatestartifactsReport";
import { registerRunMilestoneGatesCommand } from "./command/runMilestoneGates";
import { initartifactsStatusBar } from "./status/statusBarartifacts";
import { isProOrHigher } from "./core/tierEngine";
import { registerExecLedgerQuickPickCommand } from "./command/execLedgerQuickPick";

const sessions = new SessionManager();
let crashGuard: CrashGuard | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Hard artifacts in the UI that activation ran
  vscode.window.showInformationMessage("NGKs AutoLogger activated");

  // Initialize primary ExecLedger status bar (artifacts status)
  initartifactsStatusBar(context);
  
  // Initialize tier-gated QuickPick command (always register)
  registerExecLedgerQuickPickCommand(context);
  
  // Status bar handled by initartifactsStatusBar() in statusBarartifacts.ts

  // Register session lifecycle commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ngksAutologger.startSession', async () => {
      try {
        await sessions.start(context);
        vscode.window.showInformationMessage('NGKs Session: STARTED');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to start session: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ngksAutologger.stopSession', async () => {
      try {
        await sessions.stop('manual_stop');
        vscode.window.showInformationMessage('NGKs Session: STOPPED'); 
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to stop session: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ngksAutologger.toggle', async () => {
      try {
        if (sessions.isActive()) {
          await sessions.stop('manual_toggle');
          vscode.window.showInformationMessage('NGKs Session: STOPPED');
        } else {
          await sessions.start(context);
          vscode.window.showInformationMessage('NGKs Session: STARTED');
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to toggle session: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );

  // Register result viewing commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ngksAutologger.showSessionSummary', () => showLatestSessionSummaryCommand())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ngksAutologger.showChangedFiles', () => showChangedFilesCommand())
  );

  // Register ExecLedger Phase 1 commands
  context.subscriptions.push(
    vscode.commands.registerCommand('ngksExecLedger.openTask', () => openTaskCommand(context))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ngksExecLedger.addGuidance', () => addGuidanceCommand())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('ngksExecLedger.closeTask', () => closeTaskCommand())
  );

  // Register artifacts bundle export command
  registerExportartifactsBundleCommand(context);
  registerRunMilestoneGatesCommand(context);
  registerOpenLatestartifactsBundleCommand(context);
  registerOpenLatestSummaryCommand(context);
  registerCopyLatestSummaryCommand(context);
  registerOpenLatestartifactsReportCommand(context);

  // IMPORTANT: this is what was missing
  await activateExtension(context, sessions);

  // Setup crash guard if session is active
  if (sessions.isActive()) {
    const session = sessions.getSession()!;
    const crashLogPath = path.join(session.logDirPath, "crash.jsonl");
    
    crashGuard = new CrashGuard({
      crashLogPath,
      getContext: () => ({
        sessionId: session.sessionId,
        workspacePath: session.workspacePath
      })
    });
    crashGuard.install();
  }

  // Optional marker
  sessions.log("EXTENSION_READY", { vscodeVersion: vscode.version });
}

export async function deactivate(): Promise<void> {
  if (crashGuard) {
    crashGuard.dispose();
    crashGuard = null;
  }
  await deactivateExtension(sessions);
}
