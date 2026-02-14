// File: src/utils/artifactsRoot.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Resolve artifacts root directory with auto-migration from _artifacts to _artifacts
 */
export function resolveArtifactsRoot(): string {
  // Get workspace folder
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder found. Open a folder or workspace first.");
  }

  const workspaceRoot = workspaceFolder.uri.fsPath;
  
  // Check execLedger.artifactsRoot setting first
  const config = vscode.workspace.getConfiguration("execLedger");
  const configuredPath = config.get<string>("artifactsRoot", "");
  
  if (configuredPath && configuredPath.trim()) {
    const resolvedPath = path.resolve(configuredPath.trim());
    if (fs.existsSync(resolvedPath)) {
      return resolvedPath;
    }
  }

  // Use workspace-based resolution with migration
  return resolveWorkspaceArtifactsRoot(workspaceRoot);
}

/**
 * Resolve artifacts root for a workspace with auto-migration from _artifacts
 */
function resolveWorkspaceArtifactsRoot(workspaceRoot: string): string {
  const desiredRoot = path.join(workspaceRoot, "_artifacts");
  const oldRoot = path.join(workspaceRoot, "_artifacts");

  // Auto-migrate from _artifacts to _artifacts if needed
  if (fs.existsSync(oldRoot) && !fs.existsSync(desiredRoot)) {
    try {
      // Attempt to rename (move) the directory
      fs.renameSync(oldRoot, desiredRoot);
      console.log(`[ExecLedger] Migrated artifacts from ${oldRoot} to ${desiredRoot}`);
    } catch (error) {
      // If rename fails, try copying recursively
      console.warn(`[ExecLedger] Could not move ${oldRoot} to ${desiredRoot}, attempting copy...`);
      try {
        copyDirectoryRecursive(oldRoot, desiredRoot);
        console.log(`[ExecLedger] Copied artifacts from ${oldRoot} to ${desiredRoot}`);
        // Do NOT delete oldRoot for safety - leave it for manual cleanup
      } catch (copyError) {
        console.error(`[ExecLedger] Migration failed:`, copyError);
        // If migration fails completely, continue using old directory
        return oldRoot;
      }
    }
  }

  // Return _artifacts if it exists, otherwise fallback to _artifacts if it exists
  if (fs.existsSync(desiredRoot)) {
    return desiredRoot;
  } else if (fs.existsSync(oldRoot)) {
    return oldRoot;
  } else {
    return desiredRoot; // Return desired even if it doesn't exist - will be created later
  }
}

/**
 * Get bundles directory path based on artifacts root
 */
export function resolveBundlesDir(): string {
  const artifactsRoot = resolveArtifactsRoot();
  return path.join(artifactsRoot, "bundles");
}

/**
 * Recursively copy directory contents
 */
function copyDirectoryRecursive(source: string, destination: string): void {
  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const items = fs.readdirSync(source);
  for (const item of items) {
    const sourcePath = path.join(source, item);
    const destPath = path.join(destination, item);
    
    if (fs.statSync(sourcePath).isDirectory()) {
      copyDirectoryRecursive(sourcePath, destPath);
    } else {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}