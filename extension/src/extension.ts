import * as vscode from "vscode";
import { SessionManager } from "./core/sessionManager";
import { activateExtension } from "./activate";
import { deactivateExtension } from "./deactivate";

const sessions = new SessionManager();

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Hard proof in the UI that activation ran
  vscode.window.showInformationMessage("NGKs AutoLogger activated");

  // Extension-host exception hooks (Phase 1 proof)
  process.on("uncaughtException", (err: Error) => {
    try {
      sessions.log("UNCAUGHT_EXCEPTION", { name: err.name, message: err.message, stack: err.stack }, "ERROR");
    } finally {
      sessions.stop("error_exit", err);
    }
  });

  process.on("unhandledRejection", (reason: unknown) => {
    try {
      sessions.log("UNHANDLED_REJECTION", { reason }, "ERROR");
    } finally {
      sessions.stop("error_exit", reason);
    }
  });

  // IMPORTANT: this is what was missing
  await activateExtension(context, sessions);

  // Optional marker
  sessions.log("EXTENSION_READY", { vscodeVersion: vscode.version });
}

export function deactivate(): void {
  deactivateExtension(sessions);
}
