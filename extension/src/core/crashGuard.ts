// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\crashGuard.ts
import * as fs from "fs";
import * as path from "path";

export interface CrashGuardConfig {
  crashLogPath: string;
  getContext?: () => { sessionId?: string; workspacePath?: string };
}

export interface CrashContext {
  sessionId?: string;
  workspacePath?: string;
}

export interface CrashEvent {
  ts: string;
  level: "FATAL";
  type: "UNHANDLED_REJECTION" | "UNCAUGHT_EXCEPTION";
  payload: {
    message: string;
    name?: string;
    stack?: string;
    reason_type?: string;
    reason_keys?: string[];
    process: {
      pid: number;
      node: string;
      platform: string;
      arch: string;
      uptime: number;
      memory: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
      };
    };
  };
  context: CrashContext;
}

export class CrashGuard {
  private readonly config: CrashGuardConfig;
  private uncaughtExceptionHandler?: (err: Error) => void;
  private unhandledRejectionHandler?: (reason: unknown, promise: Promise<unknown>) => void;
  private installed = false;

  constructor(config: CrashGuardConfig) {
    this.config = config;
  }

  public install(): void {
    if (this.installed) return;

    // Ensure crash log directory exists
    try {
      const dir = path.dirname(this.config.crashLogPath);
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Ignore directory creation errors
    }

    this.uncaughtExceptionHandler = (err: Error) => {
      this.writeCrashEvent("UNCAUGHT_EXCEPTION", err);
    };

    this.unhandledRejectionHandler = (reason: unknown) => {
      this.writeCrashEvent("UNHANDLED_REJECTION", reason);
    };

    process.on("uncaughtException", this.uncaughtExceptionHandler);
    process.on("unhandledRejection", this.unhandledRejectionHandler);
    
    this.installed = true;
  }

  public dispose(): void {
    if (!this.installed) return;

    if (this.uncaughtExceptionHandler) {
      process.off("uncaughtException", this.uncaughtExceptionHandler);
      this.uncaughtExceptionHandler = undefined;
    }

    if (this.unhandledRejectionHandler) {
      process.off("unhandledRejection", this.unhandledRejectionHandler);
      this.unhandledRejectionHandler = undefined;
    }

    this.installed = false;
  }

  private writeCrashEvent(type: "UNCAUGHT_EXCEPTION" | "UNHANDLED_REJECTION", errorOrReason: unknown): void {
    try {
      const context = this.config.getContext?.() ?? {};
      const ts = new Date().toISOString();

      const event: CrashEvent = {
        ts,
        level: "FATAL",
        type,
        payload: {
          message: this.extractMessage(errorOrReason),
          ...this.extractErrorDetails(errorOrReason),
          process: {
            pid: process.pid,
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            uptime: Math.floor(process.uptime()),
            memory: process.memoryUsage()
          }
        },
        context
      };

      const line = JSON.stringify(event) + "\n";
      fs.appendFileSync(this.config.crashLogPath, line, "utf8");
    } catch {
      // Never throw from crash handler - silently fail
    }
  }

  private extractMessage(errorOrReason: unknown): string {
    try {
      if (errorOrReason instanceof Error) {
        return errorOrReason.message || String(errorOrReason);
      }
      if (typeof errorOrReason === "string") {
        return errorOrReason;
      }
      if (errorOrReason && typeof errorOrReason === "object") {
        if ("message" in errorOrReason && typeof errorOrReason.message === "string") {
          return errorOrReason.message;
        }
        if ("toString" in errorOrReason && typeof errorOrReason.toString === "function") {
          return String(errorOrReason.toString());
        }
      }
      return String(errorOrReason);
    } catch {
      return "Failed to extract error message";
    }
  }

  private extractErrorDetails(errorOrReason: unknown): {
    name?: string;
    stack?: string;
    reason_type?: string;
    reason_keys?: string[];
  } {
    try {
      if (errorOrReason instanceof Error) {
        return {
          name: errorOrReason.name,
          stack: errorOrReason.stack,
          reason_type: "Error"
        };
      }

      if (errorOrReason && typeof errorOrReason === "object") {
        return {
          reason_type: errorOrReason.constructor?.name ?? typeof errorOrReason,
          reason_keys: Object.keys(errorOrReason).slice(0, 10) // Limit to 10 keys
        };
      }

      return {
        reason_type: typeof errorOrReason
      };
    } catch {
      return {
        reason_type: "unknown"
      };
    }
  }
}