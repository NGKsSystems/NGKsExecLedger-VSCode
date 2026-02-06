// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\activate.ts
import * as vscode from "vscode";
import { SessionManager } from "./core/sessionManager";

export async function activateExtension(context: vscode.ExtensionContext, sessions: SessionManager): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("ngksAutologger");
  const enabled = !!cfg.get<boolean>("enabled");

  // Commands (manual control)
  context.subscriptions.push(
    vscode.commands.registerCommand("ngksAutologger.startSession", () => {
      sessions.start(context);
      vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("ngksAutologger.stopSession", () => {
      sessions.stop("manual_stop");
      vscode.window.setStatusBarMessage("NGKs Log: STOPPED", 2500);
    })
  );

  if (enabled) {
    sessions.start(context);
    vscode.window.setStatusBarMessage("NGKs Log: ACTIVE", 2500);
  }
}
