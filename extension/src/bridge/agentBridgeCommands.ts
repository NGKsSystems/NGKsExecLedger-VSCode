// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\bridge\agentBridgeCommands.ts
import * as vscode from "vscode";

export function registerAgentBridgeCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("ngksAutologger.openAgentBridge", async () => {
      // Focus the Explorer so the view is visible, then reveal the view.
      await vscode.commands.executeCommand("workbench.view.explorer");
      await vscode.commands.executeCommand("ngksAutologger.agentBridge.focus");
    })
  );
}
