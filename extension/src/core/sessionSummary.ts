import * as fs from 'fs';
import * as path from 'path';
import { Baseline } from './filesystemBaseline';
import { ChangeEvent } from './filesystemChangeTracker';
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
  return require('crypto').createHash('sha256').update(payload).digest('hex');
}

function computeChainFromLines(lines: string[]): { valid: boolean; headHash: string } {
  let prevHash = CHAIN_GENESIS;
  let valid = true;
  let lastHash = CHAIN_GENESIS;

  for (const rawLine of lines) {
    if (!rawLine.trim()) {
      continue;
    }

    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(rawLine) as Record<string, unknown>;
    } catch {
      valid = false;
      continue;
    }

    const eventPrev = typeof parsed.prevHash === 'string' ? parsed.prevHash : undefined;
    const lineHash = typeof parsed.lineHash === 'string' ? parsed.lineHash : undefined;

    if (!eventPrev || !lineHash) {
      valid = false;
      continue;
    }

    const eventWithoutLineHash: Record<string, unknown> = { ...parsed };
    delete (eventWithoutLineHash as { lineHash?: string }).lineHash;

    const expected = computeLineHash(eventPrev, eventWithoutLineHash);
    if (eventPrev !== prevHash || expected !== lineHash) {
      valid = false;
    }

    prevHash = lineHash;
    lastHash = lineHash;
  }

  return { valid, headHash: lastHash };
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

export interface SessionSummary {
  filesChanged: boolean;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesRenamed: number;
  changedPaths: string[];
  renamedPaths: { oldPath: string; newPath: string; newHash?: string; newSize?: number; newMtime?: string }[];
  hotFiles: { path: string; touches: number }[];
  changesLogHeadHash: string;
}

export interface SignalSummary {
  filesChanged: boolean;
  changeSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  primaryChangeTypes: ('added' | 'modified' | 'deleted')[];
  totalEvents: number;
  totalFilesAffected: number;
}

interface CoalescedEntry {
  originalPath: string;
  currentPath: string;
  touches: number;
  added: boolean;
  modified: boolean;
  deleted: boolean;
  renamed: boolean;
  renamedFrom?: string;
  renamedTo?: string;
}

interface CoalescedResult {
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  filesRenamed: number;
  changedPaths: string[];
  renamedPaths: { oldPath: string; newPath: string; newHash?: string; newSize?: number; newMtime?: string }[];
  hotFiles: { path: string; touches: number }[];
}

function calculateHash(filePath: string): string | undefined {
  try {
    const stats = fs.statSync(filePath);
    const maxSize = 5 * 1024 * 1024;
    if (stats.size > maxSize) {
      return 'SKIPPED_LARGE';
    }
    const content = fs.readFileSync(filePath);
    return require('crypto').createHash('sha256').update(content).digest('hex');
  } catch {
    return undefined;
  }
}

function coalesceChanges(changes: ChangeEvent[], workspaceRoot: string): CoalescedResult {
  const entries = new Map<string, CoalescedEntry>();
  const pathToKey = new Map<string, string>();

  const getKey = (filePath: string): string => {
    return pathToKey.get(filePath) ?? filePath;
  };

  const getOrCreate = (key: string, filePath: string): CoalescedEntry => {
    const existing = entries.get(key);
    if (existing) {
      return existing;
    }
    const entry: CoalescedEntry = {
      originalPath: key,
      currentPath: filePath,
      touches: 0,
      added: false,
      modified: false,
      deleted: false,
      renamed: false
    };
    entries.set(key, entry);
    return entry;
  };

  for (const change of changes) {
    if (change.eventType === 'rename' && change.oldPath) {
      const key = getKey(change.oldPath);
      const entry = getOrCreate(key, change.oldPath);
      entry.touches += 1;
      entry.renamed = true;
      entry.renamedFrom = change.oldPath;
      entry.renamedTo = change.path;
      entry.currentPath = change.path;

      pathToKey.delete(change.oldPath);
      pathToKey.set(change.path, key);
      continue;
    }

    const key = getKey(change.path);
    const entry = getOrCreate(key, change.path);
    entry.touches += 1;

    if (change.eventType === 'create') {
      entry.added = true;
    } else if (change.eventType === 'modify') {
      entry.modified = true;
    } else if (change.eventType === 'delete') {
      entry.deleted = true;
    }

    entry.currentPath = change.path;
  }

  const renamedPaths: { oldPath: string; newPath: string; newHash?: string; newSize?: number; newMtime?: string }[] = [];
  const changedPaths: string[] = [];

  for (const entry of entries.values()) {
    changedPaths.push(entry.currentPath);

    if (entry.renamed && entry.renamedFrom && entry.renamedTo) {
      const fullPath = path.join(workspaceRoot, entry.renamedTo);
      let newSize: number | undefined;
      let newMtime: string | undefined;

      if (fs.existsSync(fullPath)) {
        try {
          const stats = fs.statSync(fullPath);
          newSize = stats.size;
          newMtime = stats.mtime.toISOString();
        } catch {
          newSize = undefined;
          newMtime = undefined;
        }
      }

      renamedPaths.push({
        oldPath: entry.renamedFrom,
        newPath: entry.renamedTo,
        newHash: calculateHash(fullPath),
        newSize,
        newMtime
      });
    }
  }

  const uniqueChangedPaths = Array.from(new Set(changedPaths)).sort();

  const hotFiles = Array.from(entries.values())
    .map(entry => ({ path: entry.currentPath, touches: entry.touches }))
    .sort((a, b) => b.touches - a.touches)
    .slice(0, 10);

  return {
    filesAdded: Array.from(entries.values()).filter(entry => entry.added).length,
    filesModified: Array.from(entries.values()).filter(entry => entry.modified).length,
    filesDeleted: Array.from(entries.values()).filter(entry => entry.deleted).length,
    filesRenamed: Array.from(entries.values()).filter(entry => entry.renamed).length,
    changedPaths: uniqueChangedPaths,
    renamedPaths,
    hotFiles
  };
}

export function generateSessionSummary(sessionDir: string): SessionSummary {
  const baselinePath = path.join(sessionDir, 'baseline.json');
  const changesLogPath = path.join(sessionDir, 'changes.log');

  recoverAtomicFile(baselinePath);
  recoverAtomicFile(changesLogPath);

  // Read baseline
  const baseline: Baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf-8'))
    : { timestamp: '', files: [] };

  // Read changes log
  const changesLog: ChangeEvent[] = [];
  const rawLines: string[] = [];
  if (fs.existsSync(changesLogPath)) {
    const lines = fs.readFileSync(changesLogPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());
    rawLines.push(...lines);

    for (const line of lines) {
      try {
        changesLog.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
  }

  const workspaceRoot = path.resolve(sessionDir, '..', '..');
  const coalesced = coalesceChanges(changesLog, workspaceRoot);
  const chainResult = computeChainFromLines(rawLines);
  const changesLogHeadHash = rawLines.length === 0 ? CHAIN_GENESIS : chainResult.headHash;

  return {
    filesChanged: coalesced.changedPaths.length > 0,
    filesAdded: coalesced.filesAdded,
    filesModified: coalesced.filesModified,
    filesDeleted: coalesced.filesDeleted,
    filesRenamed: coalesced.filesRenamed,
    changedPaths: coalesced.changedPaths,
    renamedPaths: coalesced.renamedPaths,
    hotFiles: coalesced.hotFiles,
    changesLogHeadHash
  };
}

export function saveSessionSummary(summary: SessionSummary, filePath: string): void {
  atomicWriteFile(filePath, JSON.stringify(summary, null, 2));
}

export function generateChangedFilesMarkdown(summary: SessionSummary, sessionDir: string): string {
  if (!summary.filesChanged) {
    return `## NO CHANGES

This session tracked no file changes.

**Session Summary:**
- Files added: 0
- Files modified: 0
- Files deleted: 0
`;
  }

  let markdown = `# Changed Files Report

**Session Summary:**
- Files added: ${summary.filesAdded}
- Files modified: ${summary.filesModified}  
- Files deleted: ${summary.filesDeleted}
- Files renamed: ${summary.filesRenamed}
- Total files affected: ${summary.changedPaths.length}

## Changed Files

`;

  for (const filePath of summary.changedPaths) {
    markdown += `- ${filePath}\n`;
  }

  markdown += `\n`;

  if (summary.filesRenamed > 0 && summary.renamedPaths.length > 0) {
    markdown += `## Renamed Files\n\n`;
    for (const rename of summary.renamedPaths) {
      const details = [
        rename.newHash ? `hash=${rename.newHash}` : undefined,
        typeof rename.newSize === 'number' ? `size=${rename.newSize}` : undefined,
        rename.newMtime ? `mtime=${rename.newMtime}` : undefined
      ].filter(Boolean).join(', ');
      markdown += `- ${rename.oldPath} -> ${rename.newPath}${details ? ` (${details})` : ''}\n`;
    }
    markdown += `\n`;
  }

  if (summary.hotFiles && summary.hotFiles.length > 0) {
    markdown += `## Hot Files\n\n`;
    for (const hot of summary.hotFiles) {
      markdown += `- ${hot.path} (${hot.touches} touches)\n`;
    }
    markdown += `\n`;
  }

  return markdown;
}

export function saveChangedFilesMarkdown(summary: SessionSummary, sessionDir: string): string {
  const markdown = generateChangedFilesMarkdown(summary, sessionDir);
  const filePath = path.join(sessionDir, 'changed_files.md');
  atomicWriteFile(filePath, markdown);
  return filePath;
}

export function generateSignalSummary(sessionSummary: SessionSummary, changesLogPath: string): SignalSummary {
  // Count total events from changes log (data only, no inference)
  let totalEvents = 0;
  recoverAtomicFile(changesLogPath);
  if (fs.existsSync(changesLogPath)) {
    const lines = fs.readFileSync(changesLogPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());
    totalEvents = lines.length;
  }

  const totalFilesAffected = sessionSummary.changedPaths.length;
  const filesDeleted = sessionSummary.filesDeleted;

  // Determine primary change types based on actual data (non-zero counts only)
  const primaryChangeTypes: ('added' | 'modified' | 'deleted')[] = [];
  if (sessionSummary.filesAdded > 0) primaryChangeTypes.push('added');
  if (sessionSummary.filesModified > 0) primaryChangeTypes.push('modified');
  if (sessionSummary.filesDeleted > 0) primaryChangeTypes.push('deleted');

  // Deterministic severity rules (exact rules, no guessing)
  let changeSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  
  if (totalEvents === 0 && totalFilesAffected === 0) {
    changeSeverity = 'NONE';
  } else if (totalFilesAffected <= 2 && filesDeleted === 0) {
    changeSeverity = 'LOW';
  } else if (totalFilesAffected <= 10 || filesDeleted <= 2) {
    changeSeverity = 'MEDIUM';
  } else {
    changeSeverity = 'HIGH';
  }

  // filesChanged must exactly match totalFilesAffected > 0
  const filesChanged = totalFilesAffected > 0;

  return {
    filesChanged,
    changeSeverity,
    primaryChangeTypes,
    totalEvents,
    totalFilesAffected
  };
}

export function generateSignalSummaryFromChangesLog(changesLogPath: string): SignalSummary {
  // Single source of truth: generate directly from changes.log if session_summary.json missing
  const changesLog: ChangeEvent[] = [];
  let totalEvents = 0;
  recoverAtomicFile(changesLogPath);
  
  if (fs.existsSync(changesLogPath)) {
    const lines = fs.readFileSync(changesLogPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());
    
    totalEvents = lines.length;
    
    for (const line of lines) {
      try {
        changesLog.push(JSON.parse(line));
      } catch {
        // Skip malformed lines, still count as events
      }
    }
  }

  // Analyze changes directly from log 
  const changedPathsSet = new Set<string>();
  let filesAdded = 0;
  let filesModified = 0;
  let filesDeleted = 0;

  for (const change of changesLog) {
    changedPathsSet.add(change.path);
    
    switch (change.eventType) {
      case 'create':
        filesAdded++;
        break;
      case 'modify':
        filesModified++;
        break;
      case 'delete':
        filesDeleted++;
        break;
    }
  }

  const totalFilesAffected = changedPathsSet.size;

  // Determine primary change types (non-zero counts only)
  const primaryChangeTypes: ('added' | 'modified' | 'deleted')[] = [];
  if (filesAdded > 0) primaryChangeTypes.push('added');
  if (filesModified > 0) primaryChangeTypes.push('modified');
  if (filesDeleted > 0) primaryChangeTypes.push('deleted');

  // Apply exact deterministic severity rules
  let changeSeverity: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  
  if (totalEvents === 0 && totalFilesAffected === 0) {
    changeSeverity = 'NONE';
  } else if (totalFilesAffected <= 2 && filesDeleted === 0) {
    changeSeverity = 'LOW';
  } else if (totalFilesAffected <= 10 || filesDeleted <= 2) {
    changeSeverity = 'MEDIUM';
  } else {
    changeSeverity = 'HIGH';
  }

  // filesChanged must exactly match totalFilesAffected > 0
  const filesChanged = totalFilesAffected > 0;

  return {
    filesChanged,
    changeSeverity,
    primaryChangeTypes,
    totalEvents,
    totalFilesAffected
  };
}

export function saveSignalSummary(signalSummary: SignalSummary, filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(signalSummary, null, 2), 'utf-8');
}
