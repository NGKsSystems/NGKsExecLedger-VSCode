// File: src/core/sessionManager.ts

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { JsonlWriter } from "./jsonlWriter";
import { AnyEvent } from "../types/events";
import { FilesystemAuthority } from "./filesystemAuthority";

const APP_ID = "ngks-vscode-autologger";

export interface SessionContext {
  sessionId: string;
  workspaceName: string;
  workspacePath?: string;

  // final session directory:
  // <outputRoot>\<APP_ID>\<workspaceName>\<sessionId>\
  logDir: string;

  // BACKCOMPAT: older callers expect logDirPath
  logDirPath: string;

  // full JSONL path within logDir
  jsonlPath: string;
}

function safeFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return cleaned.length ? cleaned : "workspace";
}

function resolveOutputRoot(): string {
  const cfg = vscode.workspace.getConfiguration("ngksAutologger");
  const root = (cfg.get<string>("outputRoot") ?? "").trim();

  if (!root) {
    throw new Error(
      "ngksAutologger.outputRoot is required. Set it to an absolute folder path (e.g. D:\\NGKsLogs)."
    );
  }
  if (!path.isAbsolute(root)) {
    throw new Error(`ngksAutologger.outputRoot must be an absolute path. Got: ${root}`);
  }
  return root;
}

function makeJsonlName(sessionId: string): string {
  const ts = new Date()
    .toISOString()
    .replace(/[:]/g, "")
    .replace(/\./g, "")
    .replace("T", "_")
    .replace("Z", "");
  return `${ts}_${sessionId}.jsonl`;
}

export class SessionManager {
  private ctx: SessionContext | undefined;
  private writer: JsonlWriter | undefined;
  private filesystemAuthority: FilesystemAuthority;

  constructor() {
    this.filesystemAuthority = new FilesystemAuthority();
  }

  public getSession(): SessionContext | undefined {
    return this.ctx;
  }

  public isActive(): boolean {
    return !!this.ctx && !!this.writer;
  }

  public start(context: vscode.ExtensionContext): SessionContext {
    if (this.ctx && this.writer) return this.ctx;

    const sessionId = cryptoRandomUuid();
    const baseRoot = resolveOutputRoot();

    const ws = vscode.workspace.workspaceFolders?.[0];
    const workspaceName = safeFolderName(ws?.name ?? "no-workspace");
    const workspacePath = ws?.uri.fsPath;

    const logDir = path.join(baseRoot, APP_ID, workspaceName, sessionId);
    fs.mkdirSync(logDir, { recursive: true });

    const jsonlPath = path.join(logDir, makeJsonlName(sessionId));

    this.ctx = {
      sessionId,
      workspaceName,
      workspacePath,
      logDir,
      logDirPath: logDir, // alias
      jsonlPath
    };

    this.writer = new JsonlWriter(jsonlPath);

    this.log("SESSION_START", {
      workspaceName,
      workspacePath: workspacePath ?? "",
      vscodeVersion: vscode.version,
      platform: process.platform,
      arch: process.arch,
      outputRoot: baseRoot,
      appId: APP_ID
    });

    // TASK 1: Create baseline snapshot
    if (workspacePath) {
      this.filesystemAuthority.createBaseline(workspacePath, logDir)
        .then(() => {
          // TASK 2: Start tracking filesystem changes
          this.filesystemAuthority.startTracking();
        })
        .catch((error) => {
          console.error("Failed to create baseline snapshot:", error);
        });
    }

    void context;
    return this.ctx;
  }

  public stop(reason?: string): void {
    if (!this.ctx) return;

    this.log("SESSION_END", { reason: reason ?? "stop" });

    // TASK 3: Generate session summary
    this.filesystemAuthority.generateSessionSummary()
      .then((summary) => {
        this.log("FILESYSTEM_SUMMARY", summary);
      })
      .catch((error) => {
        console.error("Failed to generate session summary:", error);
      })
      .finally(() => {
        // Stop tracking after summary is generated
        this.filesystemAuthority.stopTracking();
      });

    this.writer = undefined;
    this.ctx = undefined;
  }

  public log(type: string, payload: any): AnyEvent | undefined {
    if (!this.ctx || !this.writer) return undefined;

    const base = {
      ts: new Date().toISOString(),
      level: "INFO",
      type,
      session_id: this.ctx.sessionId,
      payload
    };

    return this.writer.write(base as any);
  }

  public getWriter(): JsonlWriter {
    if (!this.writer) throw new Error("Session not started");
    return this.writer;
  }

  public dispose(): void {
    this.filesystemAuthority.dispose();
  }
}

function cryptoRandomUuid(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("crypto") as typeof import("crypto");
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const buf = crypto.randomBytes(16);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = buf.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
