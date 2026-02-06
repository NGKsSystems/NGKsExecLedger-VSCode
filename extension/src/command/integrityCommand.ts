// File: C:\Users\suppo\Desktop\NGKsSystems\ngks-vscode-autologger\extension\src\command\integrityCommand.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { SessionManager } from "../core/sessionManager";
import { verifyLogIntegrity, IntegrityResult } from "../core/integrityVerifier";

/**
 * Registers the integrity verification command
 */
export function registerIntegrityCommand(context: vscode.ExtensionContext, sessions: SessionManager): void {
  const command = vscode.commands.registerCommand("ngksAutologger.verifyIntegrity", async () => {
    await executeIntegrityVerification(sessions);
  });

  context.subscriptions.push(command);
}

/**
 * Executes the integrity verification workflow
 */
async function executeIntegrityVerification(sessions: SessionManager): Promise<void> {
  try {
    // Find latest session and JSONL file
    const logFile = await findLatestLogFile();
    if (!logFile) {
      vscode.window.showErrorMessage("NGKs: No log files found for integrity verification");
      return;
    }

    // Run integrity verification
    const result: IntegrityResult = verifyLogIntegrity(logFile.fullPath);

    // Log the integrity check as an event
    logIntegrityCheck(sessions, result, logFile.relativePath);

    // Show results to user
    displayResults(result, logFile.relativePath);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`NGKs: Integrity verification failed: ${errorMessage}`);
  }
}

/**
 * Find the latest log file in the most recent session
 */
async function findLatestLogFile(): Promise<{ fullPath: string; relativePath: string } | null> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    return null;
  }

  const logsRoot = path.join(workspaceFolder.uri.fsPath, ".ngkssys", "logs", "ngks-vscode-autologger");
  
  if (!fs.existsSync(logsRoot)) {
    return null;
  }

  // Find latest session directory
  const sessionDirs = fs.readdirSync(logsRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => path.join(logsRoot, dirent.name))
    .map(dirPath => ({
      path: dirPath,
      mtime: fs.statSync(dirPath).mtime
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (sessionDirs.length === 0) {
    return null;
  }

  const latestSessionDir = sessionDirs[0].path;

  // Find latest JSONL file in session
  const jsonlFiles = fs.readdirSync(latestSessionDir)
    .filter(file => file.endsWith('.jsonl'))
    .map(file => path.join(latestSessionDir, file))
    .map(filePath => ({
      path: filePath,
      mtime: fs.statSync(filePath).mtime
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  if (jsonlFiles.length === 0) {
    return null;
  }

  const latestFile = jsonlFiles[0].path;
  const relativePath = path.relative(workspaceFolder.uri.fsPath, latestFile);

  return {
    fullPath: latestFile,
    relativePath: relativePath.replace(/\\/g, '/') // Normalize path separators
  };
}

/**
 * Log the integrity check as an INTEGRITY_CHECK event
 */
function logIntegrityCheck(sessions: SessionManager, result: IntegrityResult, file: string): void {
  const payload: any = {
    ok: result.ok,
    total: result.total,
    file
  };

  if (result.firstError) {
    payload.firstError = result.firstError;
  }

  sessions.log("INTEGRITY_CHECK", payload);
}

/**
 * Display verification results to user
 */
function displayResults(result: IntegrityResult, filePath: string): void {
  if (result.ok) {
    const message = `NGKs Integrity: PASS - Verified ${result.total} events in ${path.basename(filePath)}`;
    vscode.window.showInformationMessage(message);
  } else {
    let errorDetail = "Unknown error";
    if (result.firstError) {
      const { line, reason, seq } = result.firstError;
      errorDetail = `Line ${line}${seq ? ` (seq=${seq})` : ""}: ${reason}`;
    }
    
    const message = `NGKs Integrity: FAIL - ${errorDetail} [${result.total} events checked in ${path.basename(filePath)}]`;
    vscode.window.showErrorMessage(message);
  }
}