// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\watchers\fileWatcher.ts
import * as vscode from "vscode";
import * as path from "path";
import { SessionManager } from "../core/sessionManager";
import { nowIso } from "../util/time";
import { redactText } from "../core/redactor";

// Safety limits
const MAX_DIFF_SIZE = 50 * 1024; // 50KB max diff size
const MAX_DIFF_LINES = 800; // Max diff lines
const MAX_FILE_SIZE_FOR_DIFF = 1024 * 1024; // 1MB max file size for diff

// Binary file extensions
const BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  '.mp3', '.mp4', '.avi', '.mov', '.wav'
];

// Ignored path patterns (normalized lowercase)
const IGNORED_PATH_PATTERNS = [
  '\\.ngkssys\\',
  '\\extension\\dist\\',
  '\\node_modules\\',
  '\\.git\\'
];

export class FileWatcher {
  private disposables: vscode.Disposable[] = [];
  private auditEnabled = true; // Default audit on

  constructor(private readonly sessions: SessionManager) {}

  public activate(): void {
    // Hook file save events
    const onSave = vscode.workspace.onDidSaveTextDocument((document) => {
      this.handleFileSave(document);
    });

    this.disposables.push(onSave);
  }

  private async handleFileSave(document: vscode.TextDocument): Promise<void> {
    try {
      // Only log files inside workspace
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      if (!workspaceFolder) {
        return;
      }

      const relativePath = vscode.workspace.asRelativePath(document.uri);
      
      // Skip ignored paths
      if (this.isIgnoredPath(relativePath)) {
        return;
      }

      const sizeBytes = Buffer.byteLength(document.getText(), 'utf8');
      const fileExtension = path.extname(document.uri.fsPath).toLowerCase();

      let diff: string | null = null;
      let diffSkippedReason: string | undefined = undefined;
      let diffTruncated = false;
      let originalDiffBytes: number | undefined = undefined;
      let originalDiffLines: number | undefined = undefined;

      if (this.auditEnabled) {
        // Check if file is too large or binary
        if (sizeBytes > MAX_FILE_SIZE_FOR_DIFF) {
          diffSkippedReason = 'file_too_large';
        } else if (this.isBinaryFile(document, fileExtension)) {
          diffSkippedReason = 'binary';
        } else {
          try {
            const diffResult = await this.generateDiff(document, workspaceFolder);
            diff = diffResult.diff;
            diffTruncated = diffResult.truncated;
            originalDiffBytes = diffResult.originalBytes;
            originalDiffLines = diffResult.originalLines;
          } catch (error) {
            console.warn("Failed to generate diff:", error);
            diff = null;
          }
        }
      }

      // Apply redaction to diff content if present
      let finalDiff = diff;
      let diffRedacted = false;
      let diffRedactionHits = 0;
      
      if (diff) {
        const redactionResult = redactText(diff);
        finalDiff = redactionResult.text;
        diffRedacted = redactionResult.redacted;
        diffRedactionHits = redactionResult.hits;
      }

      const logPayload: any = {
        path: relativePath,
        languageId: document.languageId,
        size_bytes: sizeBytes,
        audit_on: this.auditEnabled,
        diff: finalDiff
      };

      if (diffSkippedReason) {
        logPayload.diff_skipped_reason = diffSkippedReason;
      }
      if (diffTruncated) {
        logPayload.diff_truncated = true;
        logPayload.diff_bytes = originalDiffBytes;
        logPayload.diff_lines = originalDiffLines;
      }
      if (diffRedacted) {
        logPayload.redacted = true;
        logPayload.redaction_hits = diffRedactionHits;
      }

      this.sessions.log("FILE_SAVED", logPayload);

    } catch (error) {
      console.warn("Failed to log file save:", error);
    }
  }

  private isIgnoredPath(relativePath: string): boolean {
    // Normalize path for Windows compatibility
    const normalizedPath = relativePath.toLowerCase().replace(/\//g, '\\');
    
    return IGNORED_PATH_PATTERNS.some(pattern => 
      normalizedPath.includes(pattern)
    );
  }

  private isBinaryFile(document: vscode.TextDocument, fileExtension: string): boolean {
    // Check by file extension first
    if (BINARY_EXTENSIONS.includes(fileExtension)) {
      return true;
    }
    
    // Check by language ID
    const binaryLanguages = [
      'image', 'video', 'audio', 'binary', 'pdf',
      'zip', 'tar', 'gz', 'exe', 'dll', 'so'
    ];
    
    return binaryLanguages.includes(document.languageId) ||
           document.uri.scheme !== 'file';
  }

  private async generateDiff(document: vscode.TextDocument, workspaceFolder: vscode.WorkspaceFolder): Promise<{
    diff: string | null;
    truncated: boolean;
    originalBytes?: number;
    originalLines?: number;
  }> {
    // Use git diff as the primary diff source for accuracy and standardization
    // This provides unified diff format that is widely understood
    try {
      const cwd = workspaceFolder.uri.fsPath;
      const relativePath = vscode.workspace.asRelativePath(document.uri);
      
      // Use git diff to get changes since last commit
      const { spawn } = await import('child_process');
      
      return new Promise<{
        diff: string | null;
        truncated: boolean;
        originalBytes?: number;
        originalLines?: number;
      }>((resolve) => {
        const gitProcess = spawn('git', ['diff', 'HEAD', '--', relativePath], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        let hasData = false;
        let truncated = false;

        gitProcess.stdout?.on('data', (data: Buffer) => {
          hasData = true;
          const chunk = data.toString();
          
          // Check if adding this chunk would exceed limits
          if (output.length + chunk.length > MAX_DIFF_SIZE) {
            const remainingBytes = MAX_DIFF_SIZE - output.length;
            if (remainingBytes > 0) {
              output += chunk.substring(0, remainingBytes);
            }
            truncated = true;
            gitProcess.kill();
            return;
          }
          
          output += chunk;
        });

        gitProcess.stderr?.on('data', () => {
          // Ignore stderr, git may output warnings
        });

        gitProcess.on('close', (code) => {
          if (code === 0 && hasData && output.trim()) {
            const lines = output.split('\n').length;
            const bytes = Buffer.byteLength(output, 'utf8');
            
            // Check if we need to truncate by line count
            if (!truncated && lines > MAX_DIFF_LINES) {
              const truncatedLines = output.split('\n').slice(0, MAX_DIFF_LINES);
              output = truncatedLines.join('\n') + '\n[... truncated by line limit]';
              truncated = true;
            }
            
            resolve({
              diff: output,
              truncated,
              originalBytes: truncated ? bytes : undefined,
              originalLines: truncated ? lines : undefined
            });
          } else {
            // No diff available (file unchanged, new file, or git error)
            resolve({ diff: null, truncated: false });
          }
        });

        gitProcess.on('error', () => {
          resolve({ diff: null, truncated: false });
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          gitProcess.kill();
          resolve({ diff: null, truncated: false });
        }, 5000);
      });
    } catch (error) {
      return { diff: null, truncated: false };
    }
  }

  public setAuditEnabled(enabled: boolean): void {
    this.auditEnabled = enabled;
  }

  public isAuditEnabled(): boolean {
    return this.auditEnabled;
  }

  public dispose(): void {
    this.disposables.forEach(d => d.dispose());
    this.disposables = [];
  }
}