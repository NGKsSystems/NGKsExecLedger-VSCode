// File: src/core/filesystemAuthority.ts

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { shouldBlockTraversal, CORE_IGNORE_PATTERNS } from '../util/fsIgnore';

export interface FileEntry {
  relativePath: string;
  size: number;
  lastModified: string;
  sha256: string;
}

export interface FileChangeEvent {
  timestamp: string;
  eventType: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldHash?: string;
  newHash?: string;
  oldPath?: string; // for rename events
}

export interface SessionSummary {
  filesChanged: boolean;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
}

export class FilesystemAuthority {
  private workspacePath: string | undefined;
  private sessionDir: string | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private changesLogPath: string | undefined;
  private baseline: Map<string, FileEntry> = new Map();
  private isTracking = false;

  constructor() {}

  public async createBaseline(workspacePath: string, sessionDir: string): Promise<void> {
    this.workspacePath = workspacePath;
    this.sessionDir = sessionDir;
    this.changesLogPath = path.join(sessionDir, 'changes.log');

    // Ensure session directory exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Create .ngkssys directory structure
    const ngksSysDir = path.join(workspacePath, '.ngkssys');
    const sessionSubDir = path.join(ngksSysDir, 'sessions', path.basename(sessionDir));
    if (!fs.existsSync(sessionSubDir)) {
      fs.mkdirSync(sessionSubDir, { recursive: true });
    }

    const baselineJsonPath = path.join(sessionSubDir, 'baseline.json');
    
    // Walk workspace and create baseline
    const files = await this.walkWorkspace(workspacePath);
    const baselineData: FileEntry[] = [];

    for (const filePath of files) {
      const entry = await this.createFileEntry(workspacePath, filePath);
      if (entry) {
        baselineData.push(entry);
        this.baseline.set(entry.relativePath, entry);
      }
    }

    // Write baseline.json
    fs.writeFileSync(baselineJsonPath, JSON.stringify(baselineData, null, 2));
  }

  public startTracking(): void {
    if (!this.workspacePath || this.isTracking) {
      return;
    }

    this.isTracking = true;

    // Create filesystem watcher covering the workspace
    const workspaceUri = vscode.Uri.file(this.workspacePath);
    const pattern = new vscode.RelativePattern(workspaceUri, '**/*');
    
    this.watcher = vscode.workspace.createFileSystemWatcher(
      pattern,
      false, // ignoreCreateEvents
      false, // ignoreChangeEvents  
      false  // ignoreDeleteEvents
    );

    // Handle file creation
    this.watcher.onDidCreate((uri) => {
      this.handleFileEvent('create', uri);
    });

    // Handle file changes
    this.watcher.onDidChange((uri) => {
      this.handleFileEvent('modify', uri);
    });

    // Handle file deletion
    this.watcher.onDidDelete((uri) => {
      this.handleFileEvent('delete', uri);
    });
  }

  public stopTracking(): void {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }
    this.isTracking = false;
  }

  public async generateSessionSummary(): Promise<SessionSummary> {
    if (!this.workspacePath || !this.sessionDir) {
      return { filesChanged: false, filesAdded: 0, filesModified: 0, filesDeleted: 0 };
    }

    const ngksSysDir = path.join(this.workspacePath, '.ngkssys');
    const sessionSubDir = path.join(ngksSysDir, 'sessions', path.basename(this.sessionDir));
    const baselineJsonPath = path.join(sessionSubDir, 'baseline.json');
    const changesLogPath = path.join(sessionSubDir, 'changes.log');
    const summaryJsonPath = path.join(sessionSubDir, 'session_summary.json');

    // Read baseline
    let baseline: FileEntry[] = [];
    if (fs.existsSync(baselineJsonPath)) {
      const baselineContent = fs.readFileSync(baselineJsonPath, 'utf8');
      baseline = JSON.parse(baselineContent);
    }

    // Read changes log
    let changes: FileChangeEvent[] = [];
    if (fs.existsSync(changesLogPath)) {
      const changesContent = fs.readFileSync(changesLogPath, 'utf8');
      const lines = changesContent.trim().split('\n').filter(line => line.trim());
      changes = lines.map(line => JSON.parse(line));
    }

    // Calculate summary
    const summary = this.calculateSummary(baseline, changes);

    // Write session summary
    fs.writeFileSync(summaryJsonPath, JSON.stringify(summary, null, 2));

    return summary;
  }

  private async walkWorkspace(workspacePath: string): Promise<string[]> {
    const files: string[] = [];
    const ignorePath = path.join(workspacePath, '.ngkssysignore');
    let ignorePatterns: string[] = [];

    // Read .ngkssysignore if it exists
    if (fs.existsSync(ignorePath)) {
      const ignoreContent = fs.readFileSync(ignorePath, 'utf8');
      ignorePatterns = ignoreContent
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
    }

    // Phase 3.5: Use central ignore contract + additional patterns
    const corePatterns = CORE_IGNORE_PATTERNS.map(pattern => `${pattern}/**`);
    const defaultIgnores = ['.ngkssys/**', ...corePatterns];
    ignorePatterns.push(...defaultIgnores);

    await this.walkDirectory(workspacePath, workspacePath, files, ignorePatterns);
    return files;
  }

  private async walkDirectory(
    basePath: string,
    currentPath: string,
    files: string[],
    ignorePatterns: string[]
  ): Promise<void> {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = path.relative(basePath, fullPath).replace(/\\/g, '/');

      // Check if path should be ignored
      if (this.shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }

      if (entry.isFile()) {
        files.push(fullPath);
      } else if (entry.isDirectory()) {
        // Phase 3.5: Enforce filesystem self-defense
        if (shouldBlockTraversal(fullPath)) {
          continue; // Skip this directory and all subdirectories
        }
        await this.walkDirectory(basePath, fullPath, files, ignorePatterns);
      }
    }
  }

  private shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
    for (const pattern of ignorePatterns) {
      if (this.matchesPattern(relativePath, pattern)) {
        return true;
      }
    }
    return false;
  }

  private matchesPattern(filePath: string, pattern: string): boolean {
    // Simple pattern matching - supports basic wildcards and directory patterns
    const regexPattern = pattern
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath);
  }

  private async createFileEntry(basePath: string, filePath: string): Promise<FileEntry | null> {
    try {
      const stats = fs.statSync(filePath);
      const relativePath = path.relative(basePath, filePath).replace(/\\/g, '/');
      const content = fs.readFileSync(filePath);
      const sha256 = crypto.createHash('sha256').update(content).digest('hex');

      return {
        relativePath,
        size: stats.size,
        lastModified: stats.mtime.toISOString(),
        sha256
      };
    } catch (error) {
      console.error(`Error creating file entry for ${filePath}:`, error);
      return null;
    }
  }

  private async handleFileEvent(eventType: FileChangeEvent['eventType'], uri: vscode.Uri): Promise<void> {
    if (!this.workspacePath || !this.changesLogPath) {
      return;
    }

    const filePath = uri.fsPath;
    const relativePath = path.relative(this.workspacePath, filePath).replace(/\\/g, '/');

    // Skip .ngkssys directory changes
    if (relativePath.startsWith('.ngkssys/')) {
      return;
    }

    let oldHash: string | undefined;
    let newHash: string | undefined;

    // Get old hash from baseline if available
    const baselineEntry = this.baseline.get(relativePath);
    if (baselineEntry) {
      oldHash = baselineEntry.sha256;
    }

    // Get new hash if file exists
    if (fs.existsSync(filePath) && eventType !== 'delete') {
      try {
        const content = fs.readFileSync(filePath);
        newHash = crypto.createHash('sha256').update(content).digest('hex');
      } catch (error) {
        // File might be locked or inaccessible
        console.error(`Error reading file for hash: ${filePath}`, error);
      }
    }

    const changeEvent: FileChangeEvent = {
      timestamp: new Date().toISOString(),
      eventType,
      path: relativePath,
      oldHash,
      newHash
    };

    // Append to changes log
    const ngksSysDir = path.join(this.workspacePath, '.ngkssys');
    const sessionSubDir = path.join(ngksSysDir, 'sessions', path.basename(this.sessionDir!));
    const changesLogPath = path.join(sessionSubDir, 'changes.log');
    
    // Ensure directory exists
    if (!fs.existsSync(sessionSubDir)) {
      fs.mkdirSync(sessionSubDir, { recursive: true });
    }

    fs.appendFileSync(changesLogPath, JSON.stringify(changeEvent) + '\n');
  }

  private calculateSummary(baseline: FileEntry[], changes: FileChangeEvent[]): SessionSummary {
    let filesAdded = 0;
    let filesModified = 0;
    let filesDeleted = 0;

    const baselineMap = new Map<string, FileEntry>();
    baseline.forEach(entry => baselineMap.set(entry.relativePath, entry));

    for (const change of changes) {
      switch (change.eventType) {
        case 'create':
          if (!baselineMap.has(change.path)) {
            filesAdded++;
          }
          break;
        case 'modify':
          if (baselineMap.has(change.path)) {
            filesModified++;
          }
          break;
        case 'delete':
          if (baselineMap.has(change.path)) {
            filesDeleted++;
          }
          break;
      }
    }

    const filesChanged = filesAdded > 0 || filesModified > 0 || filesDeleted > 0;

    return {
      filesChanged,
      filesAdded,
      filesModified,
      filesDeleted
    };
  }

  public dispose(): void {
    this.stopTracking();
  }
}