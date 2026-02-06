// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\watchers\debugWatcher.ts
import * as vscode from "vscode";
import { SessionManager } from "../core/sessionManager";

export class DebugWatcher {
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly sessions: SessionManager) {}

  public activate(): void {
    // Hook debug session start events
    const onDebugStart = vscode.debug.onDidStartDebugSession((session) => {
      this.handleDebugStart(session);
    });

    // Hook debug session terminate events
    const onDebugEnd = vscode.debug.onDidTerminateDebugSession((session) => {
      this.handleDebugEnd(session);
    });

    this.disposables.push(onDebugStart, onDebugEnd);
  }

  private handleDebugStart(session: vscode.DebugSession): void {
    try {
      const workspaceFolder = session.workspaceFolder?.name;

      this.sessions.log("DEBUG_START", {
        session_name: session.name,
        type: session.type,
        workspace_folder: workspaceFolder
      });

    } catch (error) {
      // Log errors but don't fail
      console.warn("Failed to log debug start:", error);
    }
  }

  private handleDebugEnd(session: vscode.DebugSession): void {
    try {
      const workspaceFolder = session.workspaceFolder?.name;

      this.sessions.log("DEBUG_END", {
        session_name: session.name,
        type: session.type,
        workspace_folder: workspaceFolder
      });

    } catch (error) {
      // Log errors but don't fail
      console.warn("Failed to log debug end:", error);
    }
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}