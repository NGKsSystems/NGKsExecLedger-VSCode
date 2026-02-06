// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\types\session.ts
export type SessionEndReason = "normal_exit" | "error_exit" | "manual_stop";

export type SessionInfo = {
  sessionId: string;
  startedAtIso: string;
  workspaceName?: string;
  workspacePath?: string;
  vscodeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
  logFilePath: string;
  logDirPath: string;
};
