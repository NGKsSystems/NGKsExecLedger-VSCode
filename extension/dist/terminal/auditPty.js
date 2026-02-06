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
exports.AuditTerminalProvider = exports.AuditPty = void 0;
// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\terminal\auditPty.ts
const vscode = __importStar(require("vscode"));
const child_process = __importStar(require("child_process"));
const uuid_1 = require("uuid");
const time_1 = require("../util/time");
const MAX_CHUNK_SIZE = 2000;
const MAX_TOTAL_OUTPUT = 200 * 1024; // 200KB
class AuditPty {
    sessions;
    workspaceRoot;
    writeEmitter = new vscode.EventEmitter();
    closeEmitter = new vscode.EventEmitter();
    currentExecution = null;
    terminalId;
    onDidWrite = this.writeEmitter.event;
    onDidClose = this.closeEmitter.event;
    constructor(sessions, workspaceRoot = process.cwd()) {
        this.sessions = sessions;
        this.workspaceRoot = workspaceRoot;
        this.terminalId = (0, uuid_1.v4)();
    }
    open() {
        this.writeEmitter.fire("NGKs Audit Terminal - Ready for audited command execution\r\n");
        this.writeEmitter.fire("Use 'NGKs: Run with Audit' command to execute audited commands\r\n");
        this.writeEmitter.fire("Press any key to continue...\r\n");
    }
    close() {
        if (this.currentExecution?.process && !this.currentExecution.terminated) {
            this.currentExecution.process.kill();
        }
        this.closeEmitter.fire();
    }
    handleInput(data) {
        // This PTY is primarily controlled by the extension, not user input
        // But we can acknowledge user input
        if (data === '\r') {
            this.writeEmitter.fire('\r\n');
        }
    }
    async executeCommand(command, cwd) {
        if (this.currentExecution && !this.currentExecution.terminated) {
            this.writeEmitter.fire("Command execution in progress. Please wait...\r\n");
            return;
        }
        const requestId = (0, uuid_1.v4)();
        const effectiveCwd = cwd || this.workspaceRoot;
        const startTime = Date.now();
        this.currentExecution = {
            requestId,
            command,
            cwd: effectiveCwd,
            startTime,
            outputChunks: [],
            totalOutputSize: 0,
            terminated: false
        };
        // Log AUDIT_CMD_START event
        this.sessions.log("AUDIT_CMD_START", {
            cmd: command,
            cwd: effectiveCwd,
            terminal_id: this.terminalId,
            request_id: requestId,
            ts_start: (0, time_1.nowIso)()
        });
        this.writeEmitter.fire(`\r\n> ${command}\r\n`);
        try {
            // Use PowerShell on Windows for deterministic behavior
            const isWindows = process.platform === "win32";
            const shell = isWindows ? "powershell.exe" : "/bin/bash";
            const shellArgs = isWindows ? ["-NoProfile", "-Command", command] : ["-c", command];
            const childProcess = child_process.spawn(shell, shellArgs, {
                cwd: effectiveCwd,
                stdio: ["pipe", "pipe", "pipe"]
            });
            this.currentExecution.process = childProcess;
            // Handle stdout
            childProcess.stdout?.on("data", (data) => {
                this.handleOutput("stdout", data.toString());
            });
            // Handle stderr  
            childProcess.stderr?.on("data", (data) => {
                this.handleOutput("stderr", data.toString());
            });
            // Handle process exit
            childProcess.on("close", (code, signal) => {
                this.handleProcessEnd(code, signal);
            });
            childProcess.on("error", (error) => {
                this.handleOutput("stderr", `Process error: ${error.message}\r\n`);
                this.handleProcessEnd(1, null);
            });
        }
        catch (error) {
            this.handleOutput("stderr", `Failed to start process: ${error}\r\n`);
            this.handleProcessEnd(1, null);
        }
    }
    handleOutput(stream, data) {
        if (!this.currentExecution || this.currentExecution.terminated)
            return;
        // Check total output limit
        if (this.currentExecution.totalOutputSize >= MAX_TOTAL_OUTPUT) {
            if (this.currentExecution.totalOutputSize === MAX_TOTAL_OUTPUT) {
                const truncationMsg = "\r\n[OUTPUT TRUNCATED - LIMIT REACHED]\r\n";
                this.writeEmitter.fire(truncationMsg);
                this.currentExecution.totalOutputSize += truncationMsg.length; // Prevent multiple truncation messages
            }
            return;
        }
        // Split large chunks and bound them
        const chunks = this.splitIntoChunks(data, MAX_CHUNK_SIZE);
        for (const chunk of chunks) {
            if (this.currentExecution.totalOutputSize + chunk.length > MAX_TOTAL_OUTPUT) {
                const remainingSpace = MAX_TOTAL_OUTPUT - this.currentExecution.totalOutputSize;
                if (remainingSpace > 0) {
                    const truncatedChunk = chunk.substring(0, remainingSpace);
                    this.logOutputChunk(stream, truncatedChunk);
                    this.writeEmitter.fire(truncatedChunk);
                    this.currentExecution.totalOutputSize += truncatedChunk.length;
                }
                break;
            }
            this.logOutputChunk(stream, chunk);
            this.writeEmitter.fire(chunk);
            this.currentExecution.totalOutputSize += chunk.length;
        }
    }
    splitIntoChunks(data, chunkSize) {
        const chunks = [];
        for (let i = 0; i < data.length; i += chunkSize) {
            chunks.push(data.substring(i, i + chunkSize));
        }
        return chunks;
    }
    logOutputChunk(stream, chunk) {
        if (!this.currentExecution)
            return;
        const chunkIndex = this.currentExecution.outputChunks.length;
        this.currentExecution.outputChunks.push({ stream, chunk, index: chunkIndex });
        // Log AUDIT_CMD_OUTPUT event
        this.sessions.log("AUDIT_CMD_OUTPUT", {
            request_id: this.currentExecution.requestId,
            stream,
            chunk,
            chunk_index: chunkIndex
        });
    }
    handleProcessEnd(exitCode, signal) {
        if (!this.currentExecution || this.currentExecution.terminated)
            return;
        this.currentExecution.terminated = true;
        const duration = Date.now() - this.currentExecution.startTime;
        // Log AUDIT_CMD_END event
        const endPayload = {
            request_id: this.currentExecution.requestId,
            exit_code: exitCode,
            duration_ms: duration
        };
        if (signal) {
            endPayload.signal = signal;
        }
        if (this.currentExecution.totalOutputSize >= MAX_TOTAL_OUTPUT) {
            endPayload.output_truncated = true;
        }
        this.sessions.log("AUDIT_CMD_END", endPayload);
        this.writeEmitter.fire(`\r\nProcess exited with code: ${exitCode}\r\n`);
        this.writeEmitter.fire("Ready for next command...\r\n");
    }
}
exports.AuditPty = AuditPty;
class AuditTerminalProvider {
    static auditPty = null;
    static terminal = null;
    static createOrShowAuditTerminal(sessions, workspaceRoot) {
        if (!this.terminal || this.terminal.exitStatus !== undefined) {
            // Create new PTY and terminal
            this.auditPty = new AuditPty(sessions, workspaceRoot);
            this.terminal = vscode.window.createTerminal({
                name: "NGKs Audit Terminal",
                pty: this.auditPty
            });
        }
        this.terminal.show();
        return this.terminal;
    }
    static async executeCommand(command, cwd) {
        if (this.auditPty) {
            await this.auditPty.executeCommand(command, cwd);
        }
    }
    static dispose() {
        if (this.terminal) {
            this.terminal.dispose();
            this.terminal = null;
        }
        this.auditPty = null;
    }
}
exports.AuditTerminalProvider = AuditTerminalProvider;
//# sourceMappingURL=auditPty.js.map