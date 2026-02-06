// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\activate.ts
import * as vscode from "vscode";
import { SessionManager } from "./core/sessionManager";
import { StatusBarToggle } from "./ui/statusBarToggle";
import { AgentBridgePanel } from "./bridge/agentBridgePanel";
import { registerAgentBridgeCommands } from "./bridge/agentBridgeCommands";
import { registerAuditCommands } from "./command/auditRunner";
import { registerIntegrityCommand } from "./command/integrityCommand";
import { TaskWatcher } from "./watchers/taskWatcher";
import { DebugWatcher } from "./watchers/debugWatcher";
import { FileWatcher } from "./watchers/fileWatcher";

export async function activateExtension(context: vscode.ExtensionContext, sessions: SessionManager): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("ngksAutologger");
  const enabled = !!cfg.get<boolean>("enabled");

  // Create status bar toggle
  const statusBarToggle = new StatusBarToggle(sessions);
  context.subscriptions.push(statusBarToggle);

  // Register agent bridge panel (Explorer view)
  const agentBridgeProvider = new AgentBridgePanel(context.extensionUri, sessions);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AgentBridgePanel.viewType, agentBridgeProvider)
  );

  // Register agent bridge commands (open/focus)
  registerAgentBridgeCommands(context);

  // Register audit commands
  registerAuditCommands(context, sessions);

  // Register integrity verification command
  registerIntegrityCommand(context, sessions);

  // Setup task and debug watchers
  const taskWatcher = new TaskWatcher(sessions);
  const debugWatcher = new DebugWatcher(sessions);
  const fileWatcher = new FileWatcher(sessions);
  
  debugWatcher.activate();
  fileWatcher.activate();
  
  // TaskWatcher auto-activates in constructor
  context.subscriptions.push(
    { dispose: () => taskWatcher.dispose() },
    { dispose: () => debugWatcher.dispose() },
    { dispose: () => fileWatcher.dispose() }
  );
  
  context.subscriptions.push(taskWatcher);
  context.subscriptions.push(debugWatcher);
  context.subscriptions.push(fileWatcher);

  // Commands (manual control)
  context.subscriptions.push(
    vscode.commands.registerCommand("ngksAutologger.startSession", () => {
      sessions.start(context);
      statusBarToggle.render();
      vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ngksAutologger.stopSession", () => {
      sessions.stop("manual_stop");
      statusBarToggle.render();
      vscode.window.setStatusBarMessage("NGKs Log: STOPPED", 2500);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ngksAutologger.toggle", () => {
      if (sessions.isActive()) {
        sessions.stop("manual_stop");
        vscode.window.setStatusBarMessage("NGKs Log: STOPPED", 2500);
      } else {
        sessions.start(context);
        vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
      }
      statusBarToggle.render();
    })
  );

  if (enabled) {
    sessions.start(context);
    statusBarToggle.render();
    vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
  }
}
    