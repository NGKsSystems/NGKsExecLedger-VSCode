// File: extension/src/command/exportartifactsBundle.ts
import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { onExportComplete } from "../status/statusBarartifacts";

const execAsync = promisify(exec);

/**
 * Registers the artifacts bundle export command
 */
export function registerExportartifactsBundleCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.exportartifactsBundle", async () => {
    await executeartifactsBundleExport();
  });

  context.subscriptions.push(command);
}

/**
 * Executes the artifacts bundle export workflow
 */
async function executeartifactsBundleExport(): Promise<void> {
  try {
    // Read ExecLedger configuration
    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("artifacts.outputRoot", "");
    const revealBundle = config.get<boolean>("artifacts.revealBundleAfterExport", true);

    // Determine workspace/repo root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("ExecLedger: No workspace folder found. Open a folder or workspace first.");
      return;
    }

    const repoRoot = workspaceFolder.uri.fsPath;
    const exporterScript = path.join(repoRoot, "tools", "export_artifacts_bundle.ps1");

    // Check if exporter script exists
    if (!require("fs").existsSync(exporterScript)) {
      vscode.window.showErrorMessage("ExecLedger: Export script not found. Ensure tools/export_artifacts_bundle.ps1 exists in your workspace.");
      return;
    }

    // Create dedicated output channel
    const outputChannel = vscode.window.createOutputChannel("ExecLedger Export");
    outputChannel.clear();
    outputChannel.show(true);

    // Show progress while exporting
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "ExecLedger: Exporting artifacts Bundle...",
      cancellable: false
    }, async (progress) => {
      try {
        let command: string;
        if (outputRoot.trim()) {
          // Use custom output root
          command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${exporterScript}" -OutputRoot "${outputRoot.trim()}"`;
        } else {
          // Use default behavior
          command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${exporterScript}"`;
        }
        
        progress.report({ message: "Starting export..." });
        outputChannel.appendLine("=== ExecLedger artifacts Export ===");
        outputChannel.appendLine(`Command: ${command}`);
        outputChannel.appendLine(`Working directory: ${repoRoot}`);
        outputChannel.appendLine("---");
        
        // Execute exporter and capture output
        const { stdout, stderr } = await execAsync(command, {
          cwd: repoRoot,
          timeout: 300000, // 5 minute timeout
          maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        });

        // Output to channel
        if (stdout) {
          outputChannel.append(stdout);
        }
        if (stderr) {
          outputChannel.append(`[STDERR] ${stderr}`);
        }

        outputChannel.appendLine("---");
        outputChannel.appendLine("Export completed successfully");

        progress.report({ message: "Export completed" });

        // Show success notification
        const message = "ExecLedger: artifacts bundle exported successfully";
        const actions = revealBundle ? ["Reveal Bundle"] : [];
        
        const action = await vscode.window.showInformationMessage(message, ...actions);
        
        if (action === "Reveal Bundle" && revealBundle) {
          await revealLatestBundle(outputRoot, repoRoot);
        }

        // Refresh status bar
        onExportComplete();

      } catch (error) {
        let errorMessage = "Unknown error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;
        } else {
          errorMessage = String(error);
        }
        
        outputChannel.appendLine("---");
        outputChannel.appendLine(`ERROR: ${errorMessage}`);
        vscode.window.showErrorMessage(`ExecLedger: Export failed: ${errorMessage}`);
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Unexpected error: ${errorMessage}`);
  }
}

/**
 * Reveal the latest bundle location in explorer
 */
async function revealLatestBundle(outputRoot: string, repoRoot: string): Promise<void> {
  try {
    const fs = require("fs");
    const { resolveBundlesDir } = require("../core/artifactPaths");
    
    let bundlesDir: string;
    if (outputRoot.trim()) {
      bundlesDir = path.join(outputRoot.trim(), "bundles");
    } else {
      bundlesDir = resolveBundlesDir(repoRoot);
    }

    const latestJsonPath = path.join(bundlesDir, "latest.json");
    
    if (!fs.existsSync(latestJsonPath)) {
      vscode.window.showWarningMessage("ExecLedger: Cannot reveal bundle - latest.json not found");
      return;
    }

    const content = fs.readFileSync(latestJsonPath, "utf8");
    const latestData = JSON.parse(content);
    
    if (latestData.zip_path && fs.existsSync(latestData.zip_path)) {
      // Reveal bundle ZIP file
      const bundleUri = vscode.Uri.file(latestData.zip_path);
      await vscode.commands.executeCommand("revealFileInOS", bundleUri);
    } else {
      // Fallback: reveal bundles directory
      const bundlesUri = vscode.Uri.file(bundlesDir);
      await vscode.commands.executeCommand("revealFileInOS", bundlesUri);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showWarningMessage(`ExecLedger: Could not reveal bundle: ${errorMessage}`);
  }
}