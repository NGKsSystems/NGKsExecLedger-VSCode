// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\activate.ts
import * as vscode from "vscode";
import { SessionManager } from "./core/sessionManager";
import { StatusBarToggle } from "./ui/statusBarToggle";
import { AgentBridgePanel } from "./bridge/agentBridgePanel";
import { registerAgentBridgeCommands } from "./bridge/agentBridgeCommands";
import { registerAuditCommands } from "./command/auditRunner";
import { registerIntegrityCommand } from "./command/integrityCommand";import { registerRenderCommands } from './command/renderAuditCommand';import { TaskWatcher } from "./watchers/taskWatcher";
import { DebugWatcher } from "./watchers/debugWatcher";

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

  // Register render audit commands
  registerRenderCommands(context);

  // Setup task and debug watchers
  const taskWatcher = new TaskWatcher(sessions);
  const debugWatcher = new DebugWatcher(sessions);
  
  debugWatcher.activate();
  
  // TaskWatcher auto-activates in constructor
  context.subscriptions.push(
    { dispose: () => taskWatcher.dispose() },
    { dispose: () => debugWatcher.dispose() }
  );
  
  context.subscriptions.push(taskWatcher);
  context.subscriptions.push(debugWatcher);

  // Auto-start if configured
  if (enabled) {
    await sessions.start(context);
    statusBarToggle.render();
    vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
  }
}
    