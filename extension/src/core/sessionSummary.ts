import * as fs from 'fs';
import * as path from 'path';
import { Baseline } from './filesystemBaseline';
import { ChangeEvent } from './filesystemChangeTracker';

export interface SessionSummary {
  filesChanged: boolean;
  filesAdded: number;
  filesModified: number;
  filesDeleted: number;
  changedPaths: string[];
}

export function generateSessionSummary(sessionDir: string): SessionSummary {
  const baselinePath = path.join(sessionDir, 'baseline.json');
  const changesLogPath = path.join(sessionDir, 'changes.log');

  // Read baseline
  const baseline: Baseline = fs.existsSync(baselinePath)
    ? JSON.parse(fs.readFileSync(baselinePath, 'utf-8'))
    : { timestamp: '', files: [] };

  // Read changes log
  const changesLog: ChangeEvent[] = [];
  if (fs.existsSync(changesLogPath)) {
    const lines = fs.readFileSync(changesLogPath, 'utf-8')
      .split('\n')
      .filter(line => line.trim());
    
    for (const line of lines) {
      try {
        changesLog.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
  }

  // Analyze changes
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

  const changedPaths = Array.from(changedPathsSet).sort();
  const filesChanged = changedPaths.length > 0;

  return {
    filesChanged,
    filesAdded,
    filesModified,
    filesDeleted,
    changedPaths
  };
}

export function saveSessionSummary(summary: SessionSummary, filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(summary, null, 2), 'utf-8');
}
