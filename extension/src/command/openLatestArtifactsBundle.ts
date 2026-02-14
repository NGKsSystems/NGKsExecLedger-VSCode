// File: extension/src/command/openLatestartifactsBundle.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { resolveBundlesDir } from "../core/artifactPaths";

/**
 * Registers the open latest artifacts bundle command
 */
export function registerOpenLatestArtifactsBundleCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.openLatestArtifactsBundle", async () => {
    await executeOpenLatestArtifactsBundle();
  });

  context.subscriptions.push(command);
}

/**
 * Opens the latest artifacts bundle from latest.json
 */
async function executeOpenLatestArtifactsBundle(): Promise<void> {
  try {
    // Get workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage("ExecLedger: No workspace folder is open.");
      return;
    }
    
    // Determine bundles directory with artifacts root migration
    const bundlesDir = resolveBundlesDir(workspaceFolders[0].uri.fsPath);

    const latestJsonPath = path.join(bundlesDir, "latest.json");

    // Check if latest.json exists
    if (!fs.existsSync(latestJsonPath)) {
      vscode.window.showErrorMessage(
        "ExecLedger: No latest artifact bundle found. Run Milestone with ExportBundle Auto/YES first.",
        "Run Export"
      ).then(action => {
        if (action === "Run Export") {
          vscode.commands.executeCommand("ngksExecLedger.exportartifactsBundle");
        }
      });
      return;
    }

    // Read and parse latest.json
    let latestData: any;
    try {
      const latestContent = fs.readFileSync(latestJsonPath, "utf8");
      latestData = JSON.parse(latestContent);
    } catch (error) {
      vscode.window.showErrorMessage(`ExecLedger: Failed to read latest.json: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    // Validate required fields
    const requiredFields = ["zip_path", "manifest_path", "created_at", "exec_id", "session_id", "mode"];
    const missingFields = requiredFields.filter(field => !latestData[field]);
    if (missingFields.length > 0) {
      vscode.window.showErrorMessage(`ExecLedger: Invalid latest.json, missing fields: ${missingFields.join(", ")}`);
      return;
    }

    const zipPath = latestData.zip_path;
    const manifestPath = latestData.manifest_path;

    // Check if zip exists
    if (!fs.existsSync(zipPath)) {
      vscode.window.showErrorMessage(
        `ExecLedger: Latest bundle file not found: ${path.basename(zipPath)}. Run Milestone with ExportBundle Auto/YES first.`,
        "Run Export"
      ).then(action => {
        if (action === "Run Export") {
          vscode.commands.executeCommand("ngksExecLedger.exportartifactsBundle");
        }
      });
      return;
    }

    // Show success message with bundle info
    const execId = latestData.exec_id;
    const sessionId = latestData.session_id;
    const mode = latestData.mode;
    const createdAt = new Date(latestData.created_at).toLocaleString();

    const message = `Latest artifacts Bundle:\nExec: ${execId}\nSession: ${sessionId}\nMode: ${mode}\nCreated: ${createdAt}`;

    // Reveal zip in Explorer
    vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(zipPath));
    
    vscode.window.showInformationMessage(
      message,
      "Open Manifest"
    ).then(action => {
      if (action === "Open Manifest" && fs.existsSync(manifestPath)) {
        vscode.commands.executeCommand("vscode.open", vscode.Uri.file(manifestPath));
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to open latest bundle: ${errorMessage}`);
  }
}