// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\deactivate.ts
// (This file is already included above; keep only one copy. If you see duplicates, delete the extra.)
import { SessionManager } from "./core/sessionManager";

export function deactivateExtension(sessions: SessionManager): void {
  sessions.stop("normal_exit");
  sessions.dispose();
}
