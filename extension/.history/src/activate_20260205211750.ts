// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\activate.ts
import * as vscode from "vscode";
import { SessionManager } from "./core/sessionManager";
import { StatusBarToggle } from "./ui/statusBarToggle";
import { AgentBridgePanel } from "./bridge/agentBridgePanel";

export async function activateExtension(context: vscode.ExtensionContext, sessions: SessionManager): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("ngksAutologger");
  const enabled = !!cfg.get<boolean>("enabled");

  // Create status bar toggle
  const statusBarToggle = new StatusBarToggle(sessions);
  context.subscriptions.push(statusBarToggle);

  // Register agent bridge panel
  const agentBridgeProvider = new AgentBridgePanel(context.extensionUri, sessions);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AgentBridgePanel.viewType, agentBridgeProvider)
  );

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
