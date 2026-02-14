/**
 * Retrieval Controller - Provides single source of truth for finding latest session artifacts
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveArtifactRoot } from './artifactPaths';

export class RetrievalController {
  private outputRoot: string;

  constructor(outputRoot?: string) {
    if (outputRoot) {
      // Use provided output root explicitly
      this.outputRoot = outputRoot;
    } else {
      // Use new canonical artifact resolution system
      this.outputRoot = this.resolveOutputRoot();
    }

    // Validate that the path exists
    if (!fs.existsSync(this.outputRoot)) {
      throw new Error(`Output root directory does not exist: ${this.outputRoot}`);
    }
  }

  /**
   * Resolve output root using new canonical artifact resolution system
   */
  private resolveOutputRoot(): string {
    try {
      // Try to get VS Code API (may not be available in tests)
      const vscode = require('vscode');
      
      // Check workspace folders
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (workspaceFolders && workspaceFolders.length > 0) {
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        return resolveArtifactRoot(workspaceRoot).root;
      }
    } catch (error) {
      // VS Code API not available (likely in tests), fall through to default
    }
    
    // Fallback to process cwd
    return resolveArtifactRoot(process.cwd()).root;
  }

  /**
   * Get path to latest summary.txt file
   * Rule: Latest is determined by newest exec_ folder (by name), then newest session folder (by name) 
   */
  getLatestSummaryPath(): string {
    const sessionFolder = this.getLatestSessionFolder();
    return path.join(sessionFolder, 'summary.txt');
  }

  /**
   * Get path to latest report.txt file  
   */
  getLatestReportPath(): string {
    const sessionFolder = this.getLatestSessionFolder();
    return path.join(sessionFolder, 'report.txt');
  }

  /**
   * Get path to latest artifacts folder (session directory)
   */
  getLatestartifactsFolderPath(): string {
    return this.getLatestSessionFolder();
  }

  /**
   * Find the latest session folder based on naming convention
   * Rule: exec_<timestamp>/milestone/<sessionId>
   * Latest = newest exec folder, then newest session within that
   */
  private getLatestSessionFolder(): string {
    if (!fs.existsSync(this.outputRoot)) {
      throw new Error(`Artifacts output directory not found: ${this.outputRoot}`);
    }

    // Find all exec_ directories
    const execDirs = fs.readdirSync(this.outputRoot)
      .filter(name => name.startsWith('exec_'))
      .map(name => path.join(this.outputRoot, name))
      .filter(dir => fs.statSync(dir).isDirectory())
      .sort((a, b) => {
        // Sort by exec folder name (which contains timestamp) descending
        const aName = path.basename(a);
        const bName = path.basename(b);
        return bName.localeCompare(aName);
      });

    if (execDirs.length === 0) {
      throw new Error('No exec_ directories found. Run milestone artifacts gates first.');
    }

    // Take the newest exec directory
    const newestExecDir = execDirs[0];
    const milestoneDir = path.join(newestExecDir, 'milestone');

    if (!fs.existsSync(milestoneDir)) {
      throw new Error(`Milestone directory not found in latest exec folder: ${milestoneDir}`);
    }

    // Find all session directories within milestone
    const sessionDirs = fs.readdirSync(milestoneDir)
      .map(name => path.join(milestoneDir, name))
      .filter(dir => fs.statSync(dir).isDirectory())
      .sort((a, b) => {
        // Sort by modification time descending (newest first)
        const aStat = fs.statSync(a);
        const bStat = fs.statSync(b);
        return bStat.mtime.getTime() - aStat.mtime.getTime();
      });

    if (sessionDirs.length === 0) {
      throw new Error(`No session directories found in milestone folder: ${milestoneDir}`);
    }

    return sessionDirs[0];
  }
}