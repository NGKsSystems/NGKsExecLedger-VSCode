import * as path from 'path';
import * as fs from 'fs';

/**
 * Central Ignore Contract - Single Source of Truth for filesystem traversal rules
 * Phase 3.5: Filesystem Self-Defense Hardening
 */

/** Core ignore patterns - directories that should never be traversed */
export const CORE_IGNORE_PATTERNS = [
  '.git',
  '.history', 
  'node_modules',
  '.venv',
  '__pycache__'
] as const;

/** Sentinel file that blocks traversal when present in a directory */
export const TRAVERSAL_SENTINEL = '.ngksignore';

/**
 * Check if a directory should be ignored based on core patterns
 */
export function shouldIgnoreDirectory(dirName: string): boolean {
  return CORE_IGNORE_PATTERNS.includes(dirName as any);
}

/**
 * Check if a directory contains the traversal sentinel file
 */
export function hasSentinel(dirPath: string): boolean {
  try {
    const sentinelPath = path.join(dirPath, TRAVERSAL_SENTINEL);
    return fs.existsSync(sentinelPath);
  } catch {
    return false;
  }
}

/**
 * Determine if traversal should be blocked for a directory
 * Returns true if directory should be skipped
 */
export function shouldBlockTraversal(dirPath: string): boolean {
  const dirName = path.basename(dirPath);
  
  // Block if matches core ignore pattern
  if (shouldIgnoreDirectory(dirName)) {
    return true;
  }
  
  // Block if contains sentinel file
  if (hasSentinel(dirPath)) {
    return true;
  }
  
  return false;
}