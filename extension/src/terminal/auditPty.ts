// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\terminal\auditPty.ts
import * as vscode from "vscode";
import * as child_process from "child_process";
import { randomUUID } from "crypto";
import { SessionManager } from "../core/sessionManager";
import { nowIso } from "../util/time";
import { redactText } from "../core/redactor";

interface CommandExecution {
  requestId: string;
  command: string;
  cwd: string;
  startTime: number;
  process?: child_process.ChildProcess;
  outputChunks: Array<{ stream: "stdout" | "stderr"; chunk: string; index: number }>;
  totalOutputSize: number;
  terminated: boolean;
}

const MAX_CHUNK_SIZE = 2000;
const MAX_TOTAL_OUTPUT = 200 * 1024; // 200KB

export class AuditPty implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  private closeEmitter = new vscode.EventEmitter<number | void>();
  private currentExecution: CommandExecution | null = null;
  private terminalId: string;

  onDidWrite: vscode.Event<string> = this.writeEmitter.event;
  onDidClose?: vscode.Event<number | void> = this.closeEmitter.event;

  constructor(
    private readonly sessions: SessionManager,
    private readonly workspaceRoot: string = process.cwd()
  ) {
    this.terminalId = randomUUID();

  }

  open(): void {
    this.writeEmitter.fire("NGKs Audit Terminal - Ready for audited command execution\r\n");
    this.writeEmitter.fire("Use 'NGKs: Run with Audit' command to execute audited commands\r\n");
    this.writeEmitter.fire("Press any key to continue...\r\n");
  }

  close(): void {
    if (this.currentExecution?.process && !this.currentExecution.terminated) {
      this.currentExecution.process.kill();
    }
    this.closeEmitter.fire();
  }

  handleInput(data: string): void {
    // This PTY is primarily controlled by the extension, not user input
    // But we can acknowledge user input
    if (data === '\r') {
      this.writeEmitter.fire('\r\n');
    }
  }

  async executeCommand(command: string, cwd?: string): Promise<void> {
    if (this.currentExecution && !this.currentExecution.terminated) {
      this.writeEmitter.fire("Command execution in progress. Please wait...\r\n");
      return;
    }

    const requestId = randomUUID();
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
      ts_start: nowIso()
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
      childProcess.stdout?.on("data", (data: Buffer) => {
        this.handleOutput("stdout", data.toString());
      });

      // Handle stderr  
      childProcess.stderr?.on("data", (data: Buffer) => {
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

    } catch (error) {
      this.handleOutput("stderr", `Failed to start process: ${error}\r\n`);
      this.handleProcessEnd(1, null);
    }
  }

  private handleOutput(stream: "stdout" | "stderr", data: string): void {
    if (!this.currentExecution || this.currentExecution.terminated) return;

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

  private splitIntoChunks(data: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += chunkSize) {
      chunks.push(data.substring(i, i + chunkSize));
    }
    return chunks;
  }

  private logOutputChunk(stream: "stdout" | "stderr", chunk: string): void {
    if (!this.currentExecution) return;

    const chunkIndex = this.currentExecution.outputChunks.length;
    this.currentExecution.outputChunks.push({ stream, chunk, index: chunkIndex });

    // Redact sensitive data before logging
    const redactionResult = redactText(chunk);

    // Log AUDIT_CMD_OUTPUT event with redacted content
    const payload: any = {
      request_id: this.currentExecution.requestId,
      stream,
      chunk: redactionResult.text,
      chunk_index: chunkIndex
    };

    // Add redaction metadata
    if (redactionResult.redacted) {
      payload.redacted = true;
      payload.redaction_hits = redactionResult.hits;
    }

    this.sessions.log("AUDIT_CMD_OUTPUT", payload);
  }

  private handleProcessEnd(exitCode: number | null, signal: string | null): void {
    if (!this.currentExecution || this.currentExecution.terminated) return;

    this.currentExecution.terminated = true;
    const duration = Date.now() - this.currentExecution.startTime;

    // Log AUDIT_CMD_END event
    const endPayload: any = {
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

export class AuditTerminalProvider {
  private static auditPty: AuditPty | null = null;
  private static terminal: vscode.Terminal | null = null;

  static createOrShowAuditTerminal(sessions: SessionManager, workspaceRoot?: string): vscode.Terminal {
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

  static async executeCommand(command: string, cwd?: string): Promise<void> {
    if (this.auditPty) {
      await this.auditPty.executeCommand(command, cwd);
    }
  }

  static dispose(): void {
    if (this.terminal) {
      this.terminal.dispose();
      this.terminal = null;
    }
    this.auditPty = null;
  }
}