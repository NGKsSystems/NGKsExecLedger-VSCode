// File: src/core/filesystemAuthority.ts

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { shouldBlockTraversal, CORE_IGNORE_PATTERNS } from '../util/fsIgnore';
import { SessionPaths } from './sessionPaths';

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
  changedPaths: string[];
}

export class FilesystemAuthority {
  private sessionPaths: SessionPaths | undefined;
  private watcher: vscode.FileSystemWatcher | undefined;
  private baseline: Map<string, FileEntry> = new Map();
  private isTracking = false;

  constructor() {}

  public async createBaseline(paths: SessionPaths): Promise<void> {
    this.sessionPaths = paths;

    // Ensure directories exist
    if (!fs.existsSync(path.dirname(paths.baselinePath))) {
      fs.mkdirSync(path.dirname(paths.baselinePath), { recursive: true });
    }
    
    // Walk workspace and create baseline
    const files = await this.walkWorkspace(paths.workspaceRoot);
    const baselineData: FileEntry[] = [];

    for (const filePath of files) {
      const entry = await this.createFileEntry(paths.workspaceRoot, filePath);
      if (entry) {
        baselineData.push(entry);
        this.baseline.set(entry.relativePath, entry);
      }
    }

    // Write baseline.json
    fs.writeFileSync(paths.baselinePath, JSON.stringify(baselineData, null, 2));
  }

  public async startTracking(): Promise<void> {
    if (!this.sessionPaths || this.isTracking) {
      return;
    }

    this.isTracking = true;

    // Create filesystem watcher covering the workspace
    const workspaceUri = vscode.Uri.file(this.sessionPaths.workspaceRoot);
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

  public async stopTracking(): Promise<void> {
    if (this.watcher) {
      this.watcher.dispose();
      this.watcher = undefined;
    }
    this.isTracking = false;
  }

  public async generateSessionSummary(): Promise<SessionSummary> {
    if (!this.sessionPaths) {
      return { filesChanged: false, filesAdded: 0, filesModified: 0, filesDeleted: 0, changedPaths: [] };
    }

    // Read baseline
    let baseline: FileEntry[] = [];
    if (fs.existsSync(this.sessionPaths.baselinePath)) {
      const baselineContent = fs.readFileSync(this.sessionPaths.baselinePath, 'utf8');
      baseline = JSON.parse(baselineContent);
    }

    // Read changes log
    let changes: FileChangeEvent[] = [];
    if (fs.existsSync(this.sessionPaths.changesLogPath)) {
      const changesContent = fs.readFileSync(this.sessionPaths.changesLogPath, 'utf8');
      const lines = changesContent.trim().split('\n').filter(line => line.trim());
      changes = lines.map(line => JSON.parse(line));
    }

    // Calculate summary
    const summary = this.calculateSummary(baseline, changes);

    // Write session summary
    fs.writeFileSync(this.sessionPaths.summaryPath, JSON.stringify(summary, null, 2));

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
    if (!this.sessionPaths) {
      return;
    }

    const filePath = uri.fsPath;
    const relativePath = path.relative(this.sessionPaths.workspaceRoot, filePath).replace(/\\/g, '/');

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

    // Ensure directory exists
    const changesDir = path.dirname(this.sessionPaths.changesLogPath);
    if (!fs.existsSync(changesDir)) {
      fs.mkdirSync(changesDir, { recursive: true });
    }

    // Append to changes log
    fs.appendFileSync(this.sessionPaths.changesLogPath, JSON.stringify(changeEvent) + '\n');
  }

  private calculateSummary(baseline: FileEntry[], changes: FileChangeEvent[]): SessionSummary {
    let filesAdded = 0;
    let filesModified = 0;
    let filesDeleted = 0;
    const changedPathsSet = new Set<string>();

    const baselineMap = new Map<string, FileEntry>();
    baseline.forEach(entry => baselineMap.set(entry.relativePath, entry));

    for (const change of changes) {
      changedPathsSet.add(change.path);
      
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
    const changedPaths = Array.from(changedPathsSet).sort();

    return {
      filesChanged,
      filesAdded,
      filesModified,
      filesDeleted,
      changedPaths
    };
  }

  public dispose(): void {
    this.stopTracking();
  }
}