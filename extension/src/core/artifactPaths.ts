// File: extension/src/core/artifactPaths.ts
/**
 * Single Source of Truth for NGKs ExecLedger Artifact Paths
 * 
 * This module provides centralized path resolution with automatic migration
 * from legacy "_proof" to canonical "execledger" artifact root.
 */
import * as fs from 'fs';
import * as path from 'path';

export const CANON_ROOT_NAME = "execledger";
export const LEGACY_ROOT_NAME = "_proof";

export interface ArtifactRootResolution {
  root: string;
  usedLegacy: boolean;
  migrated: boolean;
  notes: string[];
}

/**
 * Resolve the artifact root for a workspace with automatic migration
 * 
 * Rules:
 * 1) If <workspace>/execledger exists -> use it (usedLegacy=false)
 * 2) Else if <workspace>/_proof exists:
 *    2a) Create <workspace>/execledger
 *    2b) Move all contents from _proof into execledger (best-effort)
 *    2c) If _proof empty after move, delete _proof
 *    2d) Return execledger (usedLegacy=false, migrated=true)
 * 3) Else create <workspace>/execledger and use it.
 */
export function resolveArtifactRoot(workspaceRoot: string): ArtifactRootResolution {
  const canonicalRoot = path.join(workspaceRoot, CANON_ROOT_NAME);
  const legacyRoot = path.join(workspaceRoot, LEGACY_ROOT_NAME);
  const notes: string[] = [];

  // Rule 1: If execledger exists, use it
  if (fs.existsSync(canonicalRoot)) {
    return {
      root: canonicalRoot,
      usedLegacy: false,
      migrated: false,
      notes: []
    };
  }

  // Rule 2: If _artifacts exists, migrate it
  if (fs.existsSync(legacyRoot)) {
    notes.push(`Found legacy artifact root: ${legacyRoot}`);
    
    try {
      // 2a: Create execledger directory
      fs.mkdirSync(canonicalRoot, { recursive: true });
      notes.push(`Created canonical artifact root: ${canonicalRoot}`);

      // 2b: Move all contents from _artifacts to execledger (best effort)
      const migrationResult = migrateDirectoryContents(legacyRoot, canonicalRoot);
      notes.push(...migrationResult.notes);

      // 2c: If _artifacts is empty after migration, remove it
      if (migrationResult.sourceEmpty) {
        try {
          fs.rmdirSync(legacyRoot);
          notes.push(`Removed empty legacy root: ${legacyRoot}`);
        } catch (error) {
          notes.push(`Could not remove legacy root (may have hidden files): ${legacyRoot}`);
        }
      }

      return {
        root: canonicalRoot,
        usedLegacy: false,
        migrated: true,
        notes
      };
    } catch (error) {
      notes.push(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
      notes.push(`Falling back to legacy root`);
      
      return {
        root: legacyRoot,
        usedLegacy: true,
        migrated: false,
        notes
      };
    }
  }

  // Rule 3: Neither exists, create canonical and use it
  try {
    fs.mkdirSync(canonicalRoot, { recursive: true });
    notes.push(`Created new canonical artifact root: ${canonicalRoot}`);
  } catch (error) {
    notes.push(`Could not create canonical root: ${error instanceof Error ? error.message : String(error)}`);
  }

  return {
    root: canonicalRoot,
    usedLegacy: false,
    migrated: false,
    notes
  };
}

/**
 * Migrate directory contents with best-effort approach
 */
function migrateDirectoryContents(sourceDir: string, targetDir: string): { sourceEmpty: boolean, notes: string[] } {
  const notes: string[] = [];
  let sourceEmpty = true;
  
  try {
    const items = fs.readdirSync(sourceDir);
    
    for (const item of items) {
      const sourcePath = path.join(sourceDir, item);
      const targetPath = path.join(targetDir, item);
      
      try {
        const stats = fs.statSync(sourcePath);
        
        if (stats.isDirectory()) {
          // Recursively move directory
          moveDirectoryRecursive(sourcePath, targetPath);
          notes.push(`Moved directory: ${item}`);
        } else {
          // Move file
          fs.renameSync(sourcePath, targetPath);
          notes.push(`Moved file: ${item}`);
        }
      } catch (error) {
        sourceEmpty = false;
        notes.push(`Could not move ${item}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Check if source is actually empty now
    const remainingItems = fs.readdirSync(sourceDir);
    sourceEmpty = remainingItems.length === 0;
    
    if (!sourceEmpty) {
      notes.push(`Legacy root not empty, ${remainingItems.length} items remain`);
    }
    
  } catch (error) {
    sourceEmpty = false;
    notes.push(`Could not read source directory: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return { sourceEmpty, notes };
}

/**
 * Move directory recursively
 */
function moveDirectoryRecursive(sourceDir: string, targetDir: string): void {
  // Create target directory
  fs.mkdirSync(targetDir, { recursive: true });
  
  // Move all contents
  const items = fs.readdirSync(sourceDir);
  for (const item of items) {
    const sourcePath = path.join(sourceDir, item);
    const targetPath = path.join(targetDir, item);
    
    const stats = fs.statSync(sourcePath);
    if (stats.isDirectory()) {
      moveDirectoryRecursive(sourcePath, targetPath);
    } else {
      fs.renameSync(sourcePath, targetPath);
    }
  }
  
  // Remove source directory (should be empty now)
  fs.rmdirSync(sourceDir);
}

/**
 * Get bundles directory path within artifact root
 */
export function resolveBundlesDir(workspaceRoot: string): string {
  const resolution = resolveArtifactRoot(workspaceRoot);
  return path.join(resolution.root, 'bundles');
}

/**
 * Get exec directory path within artifact root  
 */
export function resolveExecDir(workspaceRoot: string, execId: string): string {
  const resolution = resolveArtifactRoot(workspaceRoot);
  return path.join(resolution.root, `exec_${execId}`);
}