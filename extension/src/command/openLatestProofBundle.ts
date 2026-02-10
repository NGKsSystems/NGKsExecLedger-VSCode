// File: extension/src/command/openLatestProofBundle.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Registers the open latest proof bundle command
 */
export function registerOpenLatestProofBundleCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.openLatestProofBundle", async () => {
    await executeOpenLatestProofBundle();
  });

  context.subscriptions.push(command);
}

/**
 * Opens the latest proof bundle from latest.json
 */
async function executeOpenLatestProofBundle(): Promise<void> {
  try {
    // Read ExecLedger configuration
    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("proof.outputRoot", "");

    // Determine workspace/repo root
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("ExecLedger: No workspace folder found. Open a folder or workspace first.");
      return;
    }

    const repoRoot = workspaceFolder.uri.fsPath;
    
    // Determine bundles directory (respect Phase 7 outputRoot if set)
    let bundlesDir: string;
    if (outputRoot.trim()) {
      bundlesDir = path.join(outputRoot.trim(), "bundles");
    } else {
      bundlesDir = path.join(repoRoot, "_proof", "bundles");
    }

    const latestJsonPath = path.join(bundlesDir, "latest.json");

    // Check if latest.json exists
    if (!fs.existsSync(latestJsonPath)) {
      vscode.window.showErrorMessage(
        "ExecLedger: No latest proof bundle found. Run Milestone with ExportBundle Auto/YES first.",
        "Run Export"
      ).then(action => {
        if (action === "Run Export") {
          vscode.commands.executeCommand("ngksExecLedger.exportProofBundle");
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
          vscode.commands.executeCommand("ngksExecLedger.exportProofBundle");
        }
      });
      return;
    }

    // Show success message with bundle info
    const execId = latestData.exec_id;
    const sessionId = latestData.session_id;
    const mode = latestData.mode;
    const createdAt = new Date(latestData.created_at).toLocaleString();

    const message = `Latest Proof Bundle:\nExec: ${execId}\nSession: ${sessionId}\nMode: ${mode}\nCreated: ${createdAt}`;

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