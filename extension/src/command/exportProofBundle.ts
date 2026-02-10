// File: extension/src/command/exportProofBundle.ts
import * as vscode from "vscode";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Registers the proof bundle export command
 */
export function registerExportProofBundleCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.exportProofBundle", async () => {
    await executeProofBundleExport();
  });

  context.subscriptions.push(command);
}

/**
 * Executes the proof bundle export workflow
 */
async function executeProofBundleExport(): Promise<void> {
  try {
    // Read ExecLedger configuration
    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("proof.outputRoot", "");
    const revealBundle = config.get<boolean>("proof.revealBundleAfterExport", true);

    // Determine workspace/repo root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("ExecLedger: No workspace folder found. Open a folder or workspace first.");
      return;
    }

    const repoRoot = workspaceFolder.uri.fsPath;
    const exportScript = path.join(repoRoot, "tools", "export_proof_bundle.ps1");

    // Check if export script exists
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(exportScript));
    } catch {
      vscode.window.showErrorMessage("ExecLedger: Export script not found. Ensure tools/export_proof_bundle.ps1 exists in your workspace.");
      return;
    }

    // Show progress while exporting
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "ExecLedger: Creating proof bundle...",
      cancellable: false
    }, async (progress) => {
      try {
        // Prepare command with optional output root parameter
        let command = `powershell -NoProfile -ExecutionPolicy Bypass -File "${exportScript}"`;
        if (outputRoot.trim()) {
          command += ` -OutputRoot "${outputRoot.trim()}"`;
        }
        
        progress.report({ message: "Running export script..." });
        
        const { stdout, stderr } = await execAsync(command, { 
          cwd: repoRoot,
          timeout: 60000 // 60 second timeout
        });

        // Parse output for success indicators
        const output = stdout + stderr;
        const bundleOkMatch = output.match(/BUNDLE_OK=(True|False)/);
        const zipMatch = output.match(/ZIP=(.+\.zip)/);
        const manifestMatch = output.match(/MANIFEST=(.+\.manifest\.json)/);

        if (bundleOkMatch && bundleOkMatch[1] === "True" && zipMatch) {
          const zipPath = zipMatch[1].trim();
          const relativePath = path.relative(repoRoot, zipPath);
          const resolvedPath = outputRoot.trim() ? zipPath : relativePath;
          
          let message = `ExecLedger: Bundle exported successfully! ${resolvedPath}`;
          if (outputRoot.trim()) {
            message += ` (custom location)`;
          }

          if (revealBundle) {
            vscode.window.showInformationMessage(
              message,
              "Open Folder"
            ).then(action => {
              if (action === "Open Folder") {
                const bundleDir = path.dirname(zipPath);
                vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(bundleDir));
              }
            });
          } else {
            vscode.window.showInformationMessage(message);
          }
        } else {
          // Export failed
          vscode.window.showErrorMessage(
            "ExecLedger: Bundle export failed. Check the output for details.",
            "Show Output"
          ).then(action => {
            if (action === "Show Output") {
              const outputChannel = vscode.window.createOutputChannel("ExecLedger Export");
              outputChannel.appendLine("=== EXPORT OUTPUT ===");
              outputChannel.appendLine(output);
              outputChannel.show();
            }
          });
        }

      } catch (error) {
        let errorMessage = "Unknown error occurred";
        if (error instanceof Error) {
          errorMessage = error.message;
          // Remove stack trace from user-facing message
          const cleanMessage = errorMessage.split('\n')[0];
          errorMessage = cleanMessage;
        } else {
          errorMessage = String(error);
        }
        
        vscode.window.showErrorMessage(`ExecLedger: Export failed: ${errorMessage}`);
        
        // Log detailed error to output channel for debugging
        const outputChannel = vscode.window.createOutputChannel("ExecLedger Export");
        outputChannel.appendLine("=== EXPORT ERROR ===");
        if (error instanceof Error) {
          outputChannel.appendLine(`Message: ${error.message}`);
          if (error.stack) {
            outputChannel.appendLine("Stack trace:");
            outputChannel.appendLine(error.stack);
          }
        } else {
          outputChannel.appendLine(String(error));
        }
        outputChannel.show();
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Unexpected error: ${errorMessage}`);
  }
}