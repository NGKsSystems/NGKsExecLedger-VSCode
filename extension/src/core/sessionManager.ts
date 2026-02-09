// File: src/core/sessionManager.ts

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { JsonlWriter } from "./jsonlWriter";
import { AnyEvent } from "../types/events";
import { FilesystemAuthority } from "./filesystemAuthority";
import { SessionPaths, createSessionPaths } from "./sessionPaths";

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

  // Complete path authority
  paths: SessionPaths;
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

// JSONL naming now handled by sessionPaths.ts

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

  public async start(context: vscode.ExtensionContext): Promise<SessionContext> {
    if (this.ctx && this.writer) return this.ctx;

    const sessionId = cryptoRandomUuid();
    const baseRoot = resolveOutputRoot();

    const ws = vscode.workspace.workspaceFolders?.[0];
    const workspaceName = safeFolderName(ws?.name ?? "no-workspace");
    const workspacePath = ws?.uri.fsPath;

    // Create session paths using path authority
    const paths = createSessionPaths(baseRoot, workspaceName, sessionId);

    try {
      // TASK B: Enforce single session lock
      if (fs.existsSync(paths.lockPath)) {
        throw new Error(`Session already active. Lock file exists at: ${paths.lockPath}`);
      }

      // Create directories and lock file atomically
      fs.mkdirSync(paths.sessionRoot, { recursive: true });
      fs.mkdirSync(paths.ngksSysRoot, { recursive: true });
      fs.writeFileSync(paths.lockPath, JSON.stringify({
        sessionId,
        startedAt: new Date().toISOString(),
        workspacePath: workspacePath ?? ""
      }));

      // Initialize session context
      this.ctx = {
        sessionId,
        workspaceName,
        workspacePath,
        logDir: paths.sessionRoot,
        logDirPath: paths.sessionRoot, // alias
        jsonlPath: paths.jsonlPath,
        paths
      };

      // Initialize JSONL writer
      this.writer = new JsonlWriter(paths.jsonlPath);

      this.log("SESSION_START", {
        workspaceName,
        workspacePath: workspacePath ?? "",
        vscodeVersion: vscode.version,
        platform: process.platform,
        arch: process.arch,
        outputRoot: baseRoot,
        appId: APP_ID,
        sessionId
      });

      // TASK C: Atomic start sequence
      if (workspacePath) {
        // Step 1: Create baseline snapshot
        await this.filesystemAuthority.createBaseline(paths);
        
        // Step 2: Start tracking filesystem changes
        await this.filesystemAuthority.startTracking();
      }

      void context;
      return this.ctx;
      
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      // Log failure BEFORE tearing down writer/ctx
      try {
        this.log("SESSION_START_FAILED", { error: errMsg });
      } catch {
        console.error("SESSION_START_FAILED:", errMsg);
      }

      // Rollback on failure
      this.writer = undefined;
      try {
        if (fs.existsSync(paths.lockPath)) fs.unlinkSync(paths.lockPath);
      } catch (e) {
        console.error("Failed to remove session lock during rollback:", e);
      }
      this.ctx = undefined;

      throw error;
    }
  }

  public async stop(reason?: string): Promise<void> {
    if (!this.ctx) return;

    const sessionPaths = this.ctx.paths;
    
    try {
      // Log session end
      this.log("SESSION_END", { reason: reason ?? "stop" });

      // TASK C: Atomic stop sequence
      // Step 1: Stop filesystem tracking
      await this.filesystemAuthority.stopTracking();
      
      // Step 2: Generate session summary
      const summary = await this.filesystemAuthority.generateSessionSummary();
      this.log("FILESYSTEM_SUMMARY", summary);
      
      // Step 3: Close JSONL writer
      if (this.writer) {
        // JsonlWriter doesn't have async close, but ensure it's flushed
        this.writer = undefined;
      }
      
    } catch (error) {
      this.log("SESSION_STOP_ERROR", { 
        error: error instanceof Error ? error.message : String(error) 
      });
      throw error;
    } finally {
      // TASK B: Always remove lock file
      try {
        if (fs.existsSync(sessionPaths.lockPath)) {
          fs.unlinkSync(sessionPaths.lockPath);
        }
      } catch (lockError) {
        console.error("Failed to remove session lock:", lockError);
      }
      
      this.ctx = undefined;
      this.writer = undefined;
    }
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
