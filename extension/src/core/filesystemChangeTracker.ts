import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createHash } from 'crypto';
const CHAIN_GENESIS = 'GENESIS';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const items = keys.map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${items.join(',')}}`;
  }
  return JSON.stringify(value);
}

function computeLineHash(prevHash: string, eventWithoutLineHash: Record<string, unknown>): string {
  const canonical = stableStringify(eventWithoutLineHash);
  const payload = `${prevHash}\n${canonical}`;
  return createHash('sha256').update(payload).digest('hex');
}

function appendHashChain(event: Record<string, unknown>, prevHash: string): Record<string, unknown> {
  const eventWithoutLineHash: Record<string, unknown> = { ...event, prevHash };
  delete (eventWithoutLineHash as { lineHash?: string }).lineHash;

  const lineHash = computeLineHash(prevHash, eventWithoutLineHash);
  return { ...eventWithoutLineHash, lineHash };
}

function readLastLineHash(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return CHAIN_GENESIS;
  }

  const content = fs.readFileSync(filePath, 'utf-8').trim();
  if (!content) {
    return CHAIN_GENESIS;
  }

  const lines = content.split('\n');
  const last = lines[lines.length - 1];

  try {
    const parsed = JSON.parse(last) as { lineHash?: string };
    return parsed.lineHash ?? CHAIN_GENESIS;
  } catch {
    return CHAIN_GENESIS;
  }
}

function getTempPath(filePath: string): string {
  return `${filePath}.tmp`;
}

function atomicWriteFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const tempPath = getTempPath(filePath);
  fs.writeFileSync(tempPath, content, 'utf-8');

  try {
    fs.renameSync(tempPath, filePath);
  } catch {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempPath, filePath);
  }
}

function atomicAppendFile(filePath: string, content: string): void {
  const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  atomicWriteFile(filePath, existing + content);
}

function recoverAtomicFile(filePath: string): void {
  const tempPath = getTempPath(filePath);
  if (!fs.existsSync(tempPath)) {
    return;
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    fs.renameSync(tempPath, filePath);
  } catch {
    // Leave temp file if recovery fails.
  }
}

export interface ChangeEvent {
  timestamp: string;
  eventType: 'create' | 'modify' | 'delete' | 'rename';
  path: string;
  oldPath?: string;
  oldHash?: string;
  newHash?: string;
  prevHash?: string;
  lineHash?: string;
}

interface EventDedup {
  path: string;
  eventType: string;
  timestamp: number;
}

interface PendingDelete {
  path: string;
  oldHash?: string;
  timestamp: number;
}

export class FilesystemChangeTracker {
  private watcher: vscode.FileSystemWatcher | null = null;
  private changesLogPath: string;
  private workspaceRoot: string;
  private sessionId: string;
  private dedupWindow: Map<string, EventDedup> = new Map();
  private ignorePatterns: string[] = [];
  private pendingDeletes: Map<string, PendingDelete[]> = new Map();
  private baselineHash: Map<string, string> = new Map();
  private lastHash: string = CHAIN_GENESIS;
  private static readonly DEDUP_WINDOW_MS = 250;
  private static readonly RENAME_WINDOW_MS = 1000;
  private static readonly LARGE_FILE_THRESHOLD = 5 * 1024 * 1024; // 5MB

  constructor(workspaceRoot: string, sessionId: string) {
    this.workspaceRoot = workspaceRoot;
    this.sessionId = sessionId;
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
      atomicAppendFile(this.changesLogPath, '');
    }
    
    this.loadIgnorePatterns();
    this.loadBaselineHash();
    this.lastHash = readLastLineHash(this.changesLogPath);
  }

  private loadIgnorePatterns(): void {
    // Hard enforced ignore patterns (Phase 2.3)
    this.ignorePatterns = [
      '.ngkssys/**',
      '.execledger/**', 
      'node_modules/**',
      '.git/**',
      '.vscode/**',
      'dist/**'
    ];
    
    // Load custom ignore patterns from .ngkssysignore
    const ignoreFile = path.join(this.workspaceRoot, '.ngkssysignore');
    if (fs.existsSync(ignoreFile)) {
      try {
        const content = fs.readFileSync(ignoreFile, 'utf-8');
        const customPatterns = content.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        this.ignorePatterns.push(...customPatterns);
      } catch {
        // Ignore file read errors
      }
    }
  }

  private loadBaselineHash(): void {
    const baselinePath = path.join(this.workspaceRoot, '.ngkssys', 'sessions', this.sessionId, 'baseline.json');
    if (!fs.existsSync(baselinePath)) {
      return;
    }

    try {
      const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf-8')) as { files?: { relativePath: string; sha256: string }[] };
      if (baseline.files) {
        for (const entry of baseline.files) {
          if (entry.relativePath && entry.sha256) {
            this.baselineHash.set(entry.relativePath, entry.sha256);
          }
        }
      }
    } catch {
      // Ignore baseline parse errors
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
    const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    
    return this.ignorePatterns.some(pattern => {
      // Convert glob pattern to regex (escape regex metacharacters first)
      const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
      const regexPattern = escaped
        .replace(/\*\*/g, '.*')      // ** -> .*
        .replace(/\*/g, '[^/]*')     // * -> [^/]*
        .replace(/\?/g, '[^/]');     // ? -> [^/]

      return new RegExp(`^${regexPattern}$`).test(relativePath);
    });
  }

  private isDuplicate(path: string, eventType: string): boolean {
    const key = `${path}:${eventType}`;
    const now = Date.now();
    const existing = this.dedupWindow.get(key);
    
    if (existing && (now - existing.timestamp) < FilesystemChangeTracker.DEDUP_WINDOW_MS) {
      return true;
    }
    
    this.dedupWindow.set(key, { path, eventType, timestamp: now });
    
    // Clean old entries (prevent memory leak)
    for (const [k, v] of this.dedupWindow.entries()) {
      if ((now - v.timestamp) > FilesystemChangeTracker.DEDUP_WINDOW_MS * 2) {
        this.dedupWindow.delete(k);
      }
    }
    
    return false;
  }

  private calculateHash(filePath: string): string | undefined {
    try {
      // Check file size before hashing (Phase 2.3)
      const stats = fs.statSync(filePath);
      if (stats.size > FilesystemChangeTracker.LARGE_FILE_THRESHOLD) {
        return 'SKIPPED_LARGE';
      }
      
      const content = fs.readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return undefined;
    }
  }

  private appendEvent(event: ChangeEvent): void {
    const chainedEvent = appendHashChain(event as unknown as Record<string, unknown>, this.lastHash);
    const line = JSON.stringify(chainedEvent) + '\n';
    recoverAtomicFile(this.changesLogPath);
    atomicAppendFile(this.changesLogPath, line);
    const lineHash = (chainedEvent as { lineHash?: string }).lineHash;
    if (typeof lineHash === 'string') {
      this.lastHash = lineHash;
    }
  }

  private handleCreate(uri: vscode.Uri): void {
    const filePath = uri.fsPath;
    
    if (this.shouldIgnore(filePath)) {
      return;
    }

    const relativePath = path.relative(this.workspaceRoot, filePath).replace(/\\/g, '/');
    
    if (this.isDuplicate(relativePath, 'create')) {
      return;
    }
    
    const newHash = this.calculateHash(filePath);

    const renameMatch = this.tryConsumeRename(relativePath, newHash);
    if (renameMatch) {
      const event: ChangeEvent = {
        timestamp: new Date().toISOString(),
        eventType: 'rename',
        path: relativePath,
        oldPath: renameMatch.path,
        oldHash: renameMatch.oldHash,
        newHash
      };

      this.appendEvent(event);
      return;
    }

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
    
    if (this.isDuplicate(relativePath, 'modify')) {
      return;
    }
    
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
    
    if (this.isDuplicate(relativePath, 'delete')) {
      return;
    }

    this.queueDelete(relativePath);
  }

  private queueDelete(relativePath: string): void {
    const oldHash = this.baselineHash.get(relativePath);
    const key = oldHash ?? '__NOHASH__';
    const list = this.pendingDeletes.get(key) ?? [];

    list.push({
      path: relativePath,
      oldHash,
      timestamp: Date.now()
    });

    this.pendingDeletes.set(key, list);

    setTimeout(() => {
      this.flushStaleDeletes();
    }, FilesystemChangeTracker.RENAME_WINDOW_MS + 50);
  }

  private tryConsumeRename(newPath: string, newHash: string | undefined): PendingDelete | null {
    if (!newHash) {
      return null;
    }

    const list = this.pendingDeletes.get(newHash);
    if (!list || list.length === 0) {
      return null;
    }

    const now = Date.now();
    const index = list.findIndex(item => (now - item.timestamp) <= FilesystemChangeTracker.RENAME_WINDOW_MS);
    if (index === -1) {
      return null;
    }

    const [match] = list.splice(index, 1);
    if (list.length === 0) {
      this.pendingDeletes.delete(newHash);
    } else {
      this.pendingDeletes.set(newHash, list);
    }

    return match;
  }

  private flushStaleDeletes(): void {
    const now = Date.now();

    for (const [key, list] of this.pendingDeletes.entries()) {
      const remaining: PendingDelete[] = [];

      for (const entry of list) {
        if ((now - entry.timestamp) > FilesystemChangeTracker.RENAME_WINDOW_MS) {
          const event: ChangeEvent = {
            timestamp: new Date().toISOString(),
            eventType: 'delete',
            path: entry.path,
            oldHash: entry.oldHash
          };
          this.appendEvent(event);
        } else {
          remaining.push(entry);
        }
      }

      if (remaining.length > 0) {
        this.pendingDeletes.set(key, remaining);
      } else {
        this.pendingDeletes.delete(key);
      }
    }
  }
}
