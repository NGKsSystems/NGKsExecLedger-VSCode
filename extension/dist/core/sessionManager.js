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
exports.SessionManager = void 0;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\core\sessionManager.ts
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const uuid_1 = require("uuid");
const fs_1 = require("../util/fs");
const time_1 = require("../util/time");
const jsonlWriter_1 = require("./jsonlWriter");
const autosave_1 = require("./autosave");
class SessionManager {
    session = null;
    writer = null;
    isActive() {
        return this.session !== null && this.writer !== null;
    }
    getSession() {
        return this.session;
    }
    start(context) {
        if (this.isActive())
            return this.session;
        const cfg = vscode.workspace.getConfiguration("ngksAutologger");
        const logRootMode = (cfg.get("logRootMode") ?? "workspace");
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const workspacePath = workspaceFolder?.uri.fsPath;
        const workspaceName = workspaceFolder?.name;
        const sessionId = (0, uuid_1.v4)();
        const logDirPath = this.resolveLogDir(context, logRootMode, workspacePath, sessionId);
        (0, fs_1.ensureDirSync)(logDirPath);
        const logFilePath = path.join(logDirPath, `${(0, time_1.safeFileTimestamp)()}_${sessionId}.jsonl`);
        const session = {
            sessionId,
            startedAtIso: (0, time_1.nowIso)(),
            workspaceName,
            workspacePath,
            vscodeVersion: vscode.version,
            platform: process.platform,
            arch: process.arch,
            logFilePath,
            logDirPath
        };
        this.session = session;
        this.writer = new jsonlWriter_1.JsonlWriter(logFilePath);
        const startEvent = {
            ts: (0, time_1.nowIso)(),
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
    stop(reason, err) {
        if (!this.isActive())
            return { ended: false };
        const session = this.session;
        const writer = this.writer;
        const cfg = vscode.workspace.getConfiguration("ngksAutologger");
        const autosaveEnabled = !!cfg.get("autosaveToDownloads");
        const appName = cfg.get("appName") ?? "VSCodeAutoLogger";
        const errorPayload = this.normalizeError(err);
        const autosave = autosaveEnabled
            ? (0, autosave_1.autosaveProofCopy)({ logFilePath: session.logFilePath, appName, sessionId: session.sessionId, reason })
            : { autosaved: false };
        const endEvent = {
            ts: (0, time_1.nowIso)(),
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
    log(type, payload, level = "INFO") {
        if (!this.isActive())
            return;
        this.writer.write({
            ts: (0, time_1.nowIso)(),
            level,
            type,
            session_id: this.session.sessionId,
            payload
        });
    }
    resolveLogDir(context, mode, workspacePath, sessionId) {
        if (mode === "workspace" && workspacePath) {
            // <workspace>/.ngkssys/logs/ngks-vscode-autologger/<sessionId>/
            return path.join(workspacePath, ".ngkssys", "logs", "ngks-vscode-autologger", sessionId);
        }
        // Global: <globalStorage>/logs/<sessionId>/
        return path.join(context.globalStorageUri.fsPath, "logs", sessionId);
    }
    normalizeError(err) {
        if (!err)
            return undefined;
        if (err instanceof Error)
            return { name: err.name, message: err.message, stack: err.stack };
        try {
            return { message: typeof err === "string" ? err : JSON.stringify(err) };
        }
        catch {
            return { message: String(err) };
        }
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=sessionManager.js.map