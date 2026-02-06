import * as vscode from "vscode";
import * as path from "path";
import { SessionManager } from "./core/sessionManager";
import { activateExtension } from "./activate";
import { deactivateExtension } from "./deactivate";
import { CrashGuard } from "./core/crashGuard";

const sessions = new SessionManager();
let crashGuard: CrashGuard | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Hard proof in the UI that activation ran
  vscode.window.showInformationMessage("NGKs AutoLogger activated");

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

export function deactivate(): void {
  if (crashGuard) {
    crashGuard.dispose();
    crashGuard = null;
  }
  deactivateExtension(sessions);
}
