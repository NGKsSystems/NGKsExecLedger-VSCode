// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\command\auditRunner.ts
import * as vscode from "vscode";
import { SessionManager } from "../core/sessionManager";
import { AuditTerminalProvider } from "../terminal/auditPty";

export class AuditCommandRunner {
  constructor(private readonly sessions: SessionManager) {}

  public async runWithAudit(): Promise<void> {
    if (!this.sessions.isActive()) {
      vscode.window.showWarningMessage("NGKs session not active. Start logging first.");
      return;
    }

    // Prompt user for command
    const command = await vscode.window.showInputBox({
      prompt: "Enter command to run with audit",
      placeHolder: "e.g., node -v, git --version, ls -la",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Command cannot be empty";
        }
        return null;
      }
    });

    if (!command) {
      return; // User cancelled
    }

    try {
      // Get workspace root for execution context
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const workspaceRoot = workspaceFolder?.uri.fsPath;

      // Create or show audit terminal
      const terminal = AuditTerminalProvider.createOrShowAuditTerminal(
        this.sessions,
        workspaceRoot
      );

      // Execute command through PTY
      await AuditTerminalProvider.executeCommand(command.trim(), workspaceRoot);

      vscode.window.setStatusBarMessage("Command executed with audit logging", 3000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to execute audited command: ${errorMessage}`);
    }
  }

  public dispose(): void {
    AuditTerminalProvider.dispose();
  }
}

export function registerAuditCommands(context: vscode.ExtensionContext, sessions: SessionManager): void {
  const auditRunner = new AuditCommandRunner(sessions);

  // Register the "Run with Audit" command
  const runWithAuditCommand = vscode.commands.registerCommand(
    "ngksAutologger.runWithAudit",
    () => auditRunner.runWithAudit()
  );

  context.subscriptions.push(runWithAuditCommand);
  context.subscriptions.push(auditRunner);
}