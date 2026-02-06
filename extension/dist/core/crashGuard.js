"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrashGuard = void 0;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\crashGuard.ts
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class CrashGuard {
    config;
    uncaughtExceptionHandler;
    unhandledRejectionHandler;
    installed = false;
    constructor(config) {
        this.config = config;
    }
    install() {
        if (this.installed)
            return;
        // Ensure crash log directory exists
        try {
            const dir = path.dirname(this.config.crashLogPath);
            fs.mkdirSync(dir, { recursive: true });
        }
        catch {
            // Ignore directory creation errors
        }
        this.uncaughtExceptionHandler = (err) => {
            this.writeCrashEvent("UNCAUGHT_EXCEPTION", err);
        };
        this.unhandledRejectionHandler = (reason) => {
            this.writeCrashEvent("UNHANDLED_REJECTION", reason);
        };
        process.on("uncaughtException", this.uncaughtExceptionHandler);
        process.on("unhandledRejection", this.unhandledRejectionHandler);
        this.installed = true;
    }
    dispose() {
        if (!this.installed)
            return;
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
    writeCrashEvent(type, errorOrReason) {
        try {
            const context = this.config.getContext?.() ?? {};
            const ts = new Date().toISOString();
            const event = {
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
        }
        catch {
            // Never throw from crash handler - silently fail
        }
    }
    extractMessage(errorOrReason) {
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
        }
        catch {
            return "Failed to extract error message";
        }
    }
    extractErrorDetails(errorOrReason) {
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
        }
        catch {
            return {
                reason_type: "unknown"
            };
        }
    }
}
exports.CrashGuard = CrashGuard;
//# sourceMappingURL=crashGuard.js.map