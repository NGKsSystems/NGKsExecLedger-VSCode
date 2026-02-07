import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createHash } from 'crypto';

export interface ChangeEvent {
  timestamp: string;
  eventType: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldHash?: string;
  newHash?: string;
}

export class FilesystemChangeTracker {
  private watcher: vscode.FileSystemWatcher | null = null;
  private changesLogPath: string;
  private workspaceRoot: string;

  constructor(workspaceRoot: string, sessionId: string) {
    this.workspaceRoot = workspaceRoot;
    this.changesLogPath = path.join(
      workspaceRoot,
      '.ngkssys',
      'sessions',
      sessionId,
      'changes.log'
    );
    
    // Ensure directory exists
    const dir = path.dirname(this.changesLogPath);
    fs.mkdirSync(dir, { recursive: true });
    
    // Create empty changes.log if it doesn't exist
    if (!fs.existsSync(this.changesLogPath)) {
      fs.writeFileSync(this.changesLogPath, '', 'utf-8');
    }
  }

  start(): void {
    // Watch all files except ignored patterns
    const pattern = new vscode.RelativePattern(this.workspaceRoot, '**/*');
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidCreate(uri => this.handleCreate(uri));
    this.watcher.onDidChange(uri => this.handleModify(uri));
    this.watcher.onDidDelete(uri => this.handleDelete(uri));
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = null;
    }
  }

  private shouldIgnore(filePath: string): boolean {
    const relativePath = path.relative(this.workspaceRoot, filePath);
    const ignorePatterns = [
      'node_modules',
      '.git',
      '.ngkssys',
      'dist',
      '.vscode',
      '.history'
    ];
    
    return ignorePatterns.some(pattern => {
      const parts = relativePath.split(path.sep);
      return parts.some(part => part === pattern || part.startsWith(pattern));
    });
  }

  private calculateHash(filePath: string): string | undefined {
    try {
      const content = fs.readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return undefined;
    }
  }

  private appendEvent(event: ChangeEvent): void {
    const line = JSON.stringify(event) + '\n';
    fs.appendFileSync(this.changesLogPath, line, 'utf-8');
  }

  private handleCreate(uri: vscode.Uri): void {
    const filePath = uri.fsPath;
    
    if (this.shouldIgnore(filePath)) {
      return;
    }

    const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    const newHash = this.calculateHash(filePath);

    const event: ChangeEvent = {
      timestamp: new Date().toISOString(),
      eventType: 'create',
      path: relativePath,
      newHash
    };

    this.appendEvent(event);
  }

  private handleModify(uri: vscode.Uri): void {
    const filePath = uri.fsPath;
    
    if (this.shouldIgnore(filePath)) {
      return;
    }

    const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    const newHash = this.calculateHash(filePath);

    const event: ChangeEvent = {
      timestamp: new Date().toISOString(),
      eventType: 'modify',
      path: relativePath,
      newHash
    };

    this.appendEvent(event);
  }

  private handleDelete(uri: vscode.Uri): void {
    const filePath = uri.fsPath;
    
    if (this.shouldIgnore(filePath)) {
      return;
    }

    const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');

    const event: ChangeEvent = {
      timestamp: new Date().toISOString(),
      eventType: 'delete',
      path: relativePath
    };

    this.appendEvent(event);
  }
}
