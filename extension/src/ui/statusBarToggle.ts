import * as vscode from "vscode";
import { SessionManager } from "../core/sessionManager";

export class StatusBarToggle {
  private item: vscode.StatusBarItem;

  constructor(private sessions: SessionManager) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      1000
    );
    this.item.command = "ngksAutologger.toggle";
    this.item.tooltip = "Toggle NGKs Autonomous Logger";
    this.render();
    this.item.show();
  }

  public dispose(): void {
    this.item.dispose();
  }

  public render(): void {
    if (this.sessions.isActive()) {
      this.item.text = "$(record) NGKs Log: ON";
    } else {
      this.item.text = "$(circle-slash) NGKs Log: OFF";
    }
  }
}
