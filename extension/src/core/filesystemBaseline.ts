import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export interface FileEntry {
  relativePath: string;
  size: number;
  lastModified: string;
  sha256: string;
}

export interface Baseline {
  timestamp: string;
  files: FileEntry[];
}

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  '.ngkssys',
  'dist',
  '.vscode',
  '.history'
];

function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  return ignorePatterns.some(pattern => {
    const parts = relativePath.split(path.sep);
    return parts.some(part => part === pattern || part.startsWith(pattern));
  });
}

function calculateSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function walkDirectory(dir: string, baseDir: string, ignorePatterns: string[]): FileEntry[] {
  const entries: FileEntry[] = [];
  
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relativePath = path.relative(baseDir, fullPath);
      
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }
      
      if (item.isDirectory()) {
        entries.push(...walkDirectory(fullPath, baseDir, ignorePatterns));
      } else if (item.isFile()) {
        try {
          const stats = fs.statSync(fullPath);
          const sha256 = calculateSha256(fullPath);
          
          entries.push({
            relativePath: relativePath.replace(/\\/g, '/'),
            size: stats.size,
            lastModified: stats.mtime.toISOString(),
            sha256
          });
        } catch (err) {
          // Skip files that can't be read
        }
      }
    }
  } catch (err) {
    // Skip directories that can't be read
  }
  
  return entries;
}

export function createBaseline(workspaceRoot: string): Baseline {
  const ignorePatterns = [...DEFAULT_IGNORE];
  
  // Check for .ngkssysignore
  const ignorePath = path.join(workspaceRoot, '.ngkssysignore');
  if (fs.existsSync(ignorePath)) {
    const customIgnore = fs.readFileSync(ignorePath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    ignorePatterns.push(...customIgnore);
  }
  
  const files = walkDirectory(workspaceRoot, workspaceRoot, ignorePatterns);
  
  return {
    timestamp: new Date().toISOString(),
    files
  };
}

export function saveBaseline(baseline: Baseline, filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(baseline, null, 2), 'utf-8');
}
