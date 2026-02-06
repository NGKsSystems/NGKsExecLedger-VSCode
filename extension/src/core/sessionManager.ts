// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\sessionManager.ts
import * as path from "path";
import * as vscode from "vscode";
import { v4 as uuidv4 } from "uuid";

import { ensureDirSync } from "../util/fs";
import { nowIso, safeFileTimestamp } from "../util/time";
import { JsonlWriter } from "./jsonlWriter";
import { autosaveProofCopy } from "./autosave";
import { SessionInfo, SessionEndReason } from "../types/session";
import { SessionStartEvent, SessionEndEvent } from "../types/events";

type LogRootMode = "workspace" | "global";

export class SessionManager {
  private session: SessionInfo | null = null;
  private writer: JsonlWriter | null = null;

  public isActive(): boolean {
    return this.session !== null && this.writer !== null;
  }

  public getSession(): SessionInfo | null {
    return this.session;
  }

  public start(context: vscode.ExtensionContext): SessionInfo {
    if (this.isActive()) return this.session!;

    const cfg = vscode.workspace.getConfiguration("ngksAutologger");
    const logRootMode = (cfg.get<string>("logRootMode") ?? "workspace") as LogRootMode;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const workspacePath = workspaceFolder?.uri.fsPath;
    const workspaceName = workspaceFolder?.name;

    const sessionId = uuidv4();
    const logDirPath = this.resolveLogDir(context, logRootMode, workspacePath, sessionId);
    ensureDirSync(logDirPath);

    const logFilePath = path.join(logDirPath, `${safeFileTimestamp()}_${sessionId}.jsonl`);

    const session: SessionInfo = {
      sessionId,
      startedAtIso: nowIso(),
      workspaceName,
      workspacePath,
      vscodeVersion: vscode.version,
      platform: process.platform,
      arch: process.arch,
      logFilePath,
      logDirPath
    };

    this.session = session;
    this.writer = new JsonlWriter(logFilePath);

    const startEvent: Omit<SessionStartEvent, "seq" | "prev_hash" | "hash"> = {
      ts: nowIso(),
      level: "INFO",
      type: "SESSION_START",
      session_id: sessionId,
      payload: {
        workspaceName,
        workspacePath,
        vscodeVersion: vscode.version,
        platform: process.platform,
        arch: process.arch,
        logDirMode: logRootMode
      }
    };
    this.writer.write(startEvent);

    return session;
  }

  public stop(reason: SessionEndReason, err?: unknown): { ended: boolean; autosavePath?: string } {
    if (!this.isActive()) return { ended: false };

    const session = this.session!;
    const writer = this.writer!;

    const cfg = vscode.workspace.getConfiguration("ngksAutologger");
    const autosaveEnabled = !!cfg.get<boolean>("autosaveToDownloads");
    const appName = cfg.get<string>("appName") ?? "VSCodeAutoLogger";

    const errorPayload = this.normalizeError(err);

    const autosave = autosaveEnabled
      ? autosaveProofCopy({ logFilePath: session.logFilePath, appName, sessionId: session.sessionId, reason })
      : { autosaved: false as const };

    const endEvent: Omit<SessionEndEvent, "seq" | "prev_hash" | "hash"> = {
      ts: nowIso(),
      level: reason === "error_exit" ? "ERROR" : "INFO",
      type: "SESSION_END",
      session_id: session.sessionId,
      payload: {
        reason,
        error: errorPayload,
        autosaved: autosave.autosaved,
        autosavePath: autosave.autosavePath
      }
    };

    writer.write(endEvent);

    // teardown
    this.session = null;
    this.writer = null;

    return { ended: true, autosavePath: autosave.autosavePath };
  }

  public log(type: string, payload?: unknown, level: "INFO" | "WARN" | "ERROR" = "INFO"): void {
    if (!this.isActive()) return;
    this.writer!.write({
      ts: nowIso(),
      level,
      type,
      session_id: this.session!.sessionId,
      payload
    });
  }

  private resolveLogDir(
    context: vscode.ExtensionContext,
    mode: LogRootMode,
    workspacePath: string | undefined,
    sessionId: string
  ): string {
    if (mode === "workspace" && workspacePath) {
      // <workspace>/.ngkssys/logs/ngks-vscode-autologger/<sessionId>/
      return path.join(workspacePath, ".ngkssys", "logs", "ngks-vscode-autologger", sessionId);
    }
    // Global: <globalStorage>/logs/<sessionId>/
    return path.join(context.globalStorageUri.fsPath, "logs", sessionId);
  }

  private normalizeError(err: unknown): { name?: string; message?: string; stack?: string } | undefined {
    if (!err) return undefined;
    if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack };
    try {
      return { message: typeof err === "string" ? err : JSON.stringify(err) };
    } catch {
      return { message: String(err) };
    }
  }
}
