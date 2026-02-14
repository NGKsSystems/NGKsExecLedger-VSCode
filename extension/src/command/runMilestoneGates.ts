import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { resolveArtifactRoot } from "../core/artifactPaths";
import { exec } from "child_process";
import { refreshArtifactsStatus } from "../status/statusBarArtifacts";

/**
 * Registers the run milestone gates command
 */
export function registerRunMilestoneGatesCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.runMilestoneGates", async () => {
    await executeRunMilestoneGates();
  });

  context.subscriptions.push(command);
}

/**
 * Executes the milestone artifacts gates workflow
 */
async function executeRunMilestoneGates(): Promise<void> {
  try {
    // Determine workspace/repo root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("ExecLedger: No workspace folder found. Open a folder or workspace first.");
      return;
    }

    const repoRoot = workspaceFolder.uri.fsPath;
    const runnerScript = path.join(repoRoot, "tools", "run_phase_gates.ps1");

    // Check if runner script exists
    if (!fs.existsSync(runnerScript)) {
      vscode.window.showErrorMessage("ExecLedger: Runner script not found. Ensure tools/run_phase_gates.ps1 exists in your workspace.");
      return;
    }

    // Create dedicated output channel
    const outputChannel = vscode.window.createOutputChannel("ExecLedger Artifacts");
    outputChannel.clear();
    outputChannel.show(true);

    // Show progress while running
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "ExecLedger: Running Milestone Gates...",
      cancellable: false
    }, async (progress) => {
      try {
        // Prepare command
        const command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${runnerScript}" -Mode Milestone -ExportBundle Auto`;
        
        progress.report({ message: "Starting milestone gates..." });
        outputChannel.appendLine("=== ExecLedger Milestone Gates ===");
        outputChannel.appendLine(`Command: ${command}`);
        outputChannel.appendLine(`Working directory: ${repoRoot}`);
        outputChannel.appendLine("---");
        
        // Execute runner and stream output
        const childProcess = exec(command, { 
          cwd: repoRoot,
          timeout: 300000 // 5 minute timeout
        });

        // Stream stdout and stderr to output channel
        childProcess.stdout?.on('data', (data: string) => {
          outputChannel.append(data);
        });

        childProcess.stderr?.on('data', (data: string) => {
          outputChannel.append(`[STDERR] ${data}`);
        });

        // Wait for completion
        await new Promise<void>((resolve, reject) => {
          childProcess.on('exit', (code) => {
            outputChannel.appendLine("---");
            outputChannel.appendLine(`Process completed with exit code: ${code}`);
            resolve();
          });

          childProcess.on('error', (error) => {
            outputChannel.appendLine("---");
            outputChannel.appendLine(`Process error: ${error.message}`);
            reject(error);
          });
        });

        progress.report({ message: "Reading results..." });

        // Find newest summary.txt from milestone runs
        const summaryPath = await findNewestMilestoneSummary(repoRoot);
        if (!summaryPath) {
          vscode.window.showErrorMessage("ExecLedger: Could not find milestone summary.txt. Check the output for details.");
          return;
        }

        // Parse summary and provide user feedback
        const results = await parseSummaryResults(summaryPath);
        await handleResults(results, summaryPath, outputChannel);

      } catch (error) {
        let errorMessage = "Unknown error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = String(error);
        }
        
        outputChannel.appendLine("---");
        outputChannel.appendLine(`ERROR: ${errorMessage}`);
        vscode.window.showErrorMessage(`ExecLedger: Milestone run failed: ${errorMessage}`);
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Unexpected error: ${errorMessage}`);
  }
}

/**
 * Find the newest milestone summary.txt file
 */
async function findNewestMilestoneSummary(repoRoot: string): Promise<string | null> {
  try {
    const artifactResolution = resolveArtifactRoot(repoRoot);
    const artifactsDir = artifactResolution.root;
    
    // Log migration if it occurred
    if (artifactResolution.migrated) {
      console.log('[ExecLedger] ARTIFACT_ROOT_MIGRATED:', artifactResolution.notes.join(', '));
    }
    if (!fs.existsSync(artifactsDir)) {
      return null;
    }

    // Look for exec_* directories
    const execDirs = fs.readdirSync(artifactsDir)
      .filter(name => name.startsWith("exec_"))
      .map(name => path.join(artifactsDir, name));

    let newestSummary: { path: string; mtime: Date } | null = null;

    for (const execDir of execDirs) {
      const milestoneDir = path.join(execDir, "milestone");
      if (!fs.existsSync(milestoneDir)) continue;

      // Look for session directories
      const sessionDirs = fs.readdirSync(milestoneDir)
        .map(name => path.join(milestoneDir, name));

      for (const sessionDir of sessionDirs) {
        const summaryFile = path.join(sessionDir, "summary.txt");
        if (!fs.existsSync(summaryFile)) continue;

        const stats = fs.statSync(summaryFile);
        if (!newestSummary || stats.mtime > newestSummary.mtime) {
          newestSummary = { path: summaryFile, mtime: stats.mtime };
        }
      }
    }

    return newestSummary?.path || null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse summary results from summary.txt
 */
async function parseSummaryResults(summaryPath: string): Promise<{
  compileOk: boolean;
  verifyResults: { [key: string]: boolean };
  failReasons: string;
  artifactsDir: string;
  allPassed: boolean;
}> {
  const content = fs.readFileSync(summaryPath, 'utf8');
  const lines = content.split('\n').map(line => line.trim());

  const results = {
    compileOk: false,
    verifyResults: {} as { [key: string]: boolean },
    failReasons: "",
    artifactsDir: "",
    allPassed: false
  };

  for (const line of lines) {
    if (line.startsWith('COMPILE_OK=')) {
      results.compileOk = line.split('=')[1] === 'True';
    } else if (line.match(/^VERIFY_\d+(_\d+)?_OK=/)) {
      const [key, value] = line.split('=');
      results.verifyResults[key] = value === 'True';
    } else if (line.startsWith('FAIL_REASONS=')) {
      results.failReasons = line.split('=')[1] || "";
    } else if (line.startsWith('artifacts_DIR=')) {
      results.artifactsDir = line.split('=')[1] || "";
    }
  }

  // Check if all passed
  const allVerifyPassed = Object.values(results.verifyResults).every(result => result);
  results.allPassed = results.compileOk && allVerifyPassed && (results.failReasons === "None" || results.failReasons === "");

  return results;
}

/**
 * Handle results and provide user feedback
 */
async function handleResults(
  results: any,
  summaryPath: string,
  outputChannel: vscode.OutputChannel
): Promise<void> {
  outputChannel.appendLine("---");
  outputChannel.appendLine("=== RESULTS SUMMARY ===");
  outputChannel.appendLine(`Compile OK: ${results.compileOk}`);
  
  const verifyEntries = Object.entries(results.verifyResults);
  for (const [key, value] of verifyEntries) {
    outputChannel.appendLine(`${key}: ${value}`);
  }
  
  outputChannel.appendLine(`Fail Reasons: ${results.failReasons || 'None'}`);
  outputChannel.appendLine(`All Passed: ${results.allPassed}`);
  outputChannel.appendLine(`Summary Path: ${summaryPath}`);

  if (results.allPassed) {
    // Success - refresh status bar and show success message
    refreshArtifactsStatus();
    
    vscode.window.showInformationMessage(
      `ExecLedger: ✅ Milestone gates passed! All ${verifyEntries.length} verification phases completed successfully.`,
      "View Output",
      "Open Report"
    ).then(action => {
      if (action === "View Output") {
        outputChannel.show();
      } else if (action === "Open Report") {
        // Try to open report.txt from the same directory as summary
        const reportPath = path.join(path.dirname(summaryPath), "report.txt");
        if (fs.existsSync(reportPath)) {
          vscode.workspace.openTextDocument(reportPath).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      }
    });
  } else {
    // Failure - show error with details
    const failedVerifies = verifyEntries
      .filter(([key, value]) => !value)
      .map(([key]) => key);
    
    let message = "ExecLedger: ❌ Milestone gates failed.";
    
    if (!results.compileOk) {
      message += " Compilation failed.";
    }
    
    if (failedVerifies.length > 0) {
      message += ` Failed verifications: ${failedVerifies.join(", ")}.`;
    }
    
    if (results.failReasons && results.failReasons !== "None") {
      message += ` Reasons: ${results.failReasons}`;
    }

    vscode.window.showErrorMessage(
      message,
      "View Output",
      "Open Report"
    ).then(action => {
      if (action === "View Output") {
        outputChannel.show();
      } else if (action === "Open Report") {
        const reportPath = path.join(path.dirname(summaryPath), "report.txt");
        if (fs.existsSync(reportPath)) {
          vscode.workspace.openTextDocument(reportPath).then(doc => {
            vscode.window.showTextDocument(doc);
          });
        }
      }
    });
  }
}