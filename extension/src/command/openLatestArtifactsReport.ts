// File: extension/src/command/openLatestartifactsReport.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { resolveBundlesDir, resolveArtifactRoot } from "../core/artifactPaths";

/**
 * Registers the open latest artifacts report command
 */
export function registerOpenLatestArtifactsReportCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.openLatestArtifactsReport", async () => {
    await executeOpenLatestArtifactsReport();
  });

  context.subscriptions.push(command);
}

/**
 * Opens the latest artifacts report from latest.json
 */
async function executeOpenLatestArtifactsReport(): Promise<void> {
  try {
    // Read ExecLedger configuration
    const config = vscode.workspace.getConfiguration("execLedger");
    const copyToClipboard = config.get<boolean>("artifacts.copyReportToClipboard", false);
    
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
        "ExecLedger: No latest artifact report found. Run Milestone with ExportBundle Auto/YES first.",
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
    const requiredFields = ["manifest_path", "created_at", "exec_id", "session_id", "mode"];
    const missingFields = requiredFields.filter(field => !latestData[field]);
    if (missingFields.length > 0) {
      vscode.window.showErrorMessage(`ExecLedger: Invalid latest.json, missing fields: ${missingFields.join(", ")}`);
      return;
    }

    // Try to find report.txt path from multiple sources
    let reportPath = "";
    const manifestPath = latestData.manifest_path;
    
    // Method 0 (Phase 15): Prefer report_path from latest.json when present
    if (latestData.report_path && fs.existsSync(latestData.report_path)) {
      reportPath = latestData.report_path;
    }
    
    // Method 1: Check manifest for report.txt entry
    if (!reportPath && fs.existsSync(manifestPath)) {
      try {
        const manifestContent = fs.readFileSync(manifestPath, "utf8");
        const manifest = JSON.parse(manifestContent);
        
        if (manifest.files && Array.isArray(manifest.files)) {
          const reportEntry = manifest.files.find((file: any) => file.path === "report.txt");
          if (reportEntry && manifest.artifacts_dir) {
            reportPath = path.join(manifest.artifacts_dir, "report.txt");
          }
        }
      } catch (error) {
        // Manifest parsing failed, fall back to computed path
      }
    }
    
    // Method 2: Compute path from latest.json fields  
    if (!reportPath) {
      const execId = latestData.exec_id;
      const sessionId = latestData.session_id;
      const mode = latestData.mode;
      
      let artifactsRoot: string;
      if (false) { // outputRoot no longer used - always use artifacts root
        artifactsRoot = resolveArtifactRoot(process.cwd()).root; // Use new artifacts root
      } else {
        artifactsRoot = resolveArtifactRoot(process.cwd()).root;
      }
      
      const artifactsDir = path.join(artifactsRoot, `exec_${execId}`, mode, sessionId);
      reportPath = path.join(artifactsDir, "report.txt");
    }

    // Check if report.txt exists
    if (!fs.existsSync(reportPath)) {
      vscode.window.showErrorMessage(
        `ExecLedger: Artifacts report not found: ${path.basename(reportPath)}. Run Milestone with ExportBundle Auto/YES first.`,
        "Run Export"
      ).then(action => {
        if (action === "Run Export") {
          vscode.commands.executeCommand("ngksExecLedger.exportartifactsBundle");
        }
      });
      return;
    }

    // Show progress while opening
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "ExecLedger: Opening artifacts report...",
      cancellable: false
    }, async (progress) => {
      try {
        progress.report({ message: "Loading report..." });
        
        // Open the report file in VS Code editor
        const document = await vscode.workspace.openTextDocument(reportPath);
        await vscode.window.showTextDocument(document);

        // Optionally copy to clipboard
        if (copyToClipboard) {
          progress.report({ message: "Copying to clipboard..." });
          const reportContent = fs.readFileSync(reportPath, "utf8");
          await vscode.env.clipboard.writeText(reportContent);
          
          vscode.window.showInformationMessage(
            `ExecLedger: Artifacts report opened and copied to clipboard.`,
            "Clear Clipboard"
          ).then(action => {
            if (action === "Clear Clipboard") {
              vscode.env.clipboard.writeText("");
            }
          });
        } else {
          const execId = latestData.exec_id;
          const sessionId = latestData.session_id; 
          const mode = latestData.mode;
          const createdAt = new Date(latestData.created_at).toLocaleString();
          
          vscode.window.showInformationMessage(
            `ExecLedger: Artifacts report opened.\nExec: ${execId}\nSession: ${sessionId}\nMode: ${mode}\nCreated: ${createdAt}`
          );
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`ExecLedger: Failed to open report: ${errorMessage}`);
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to open latest report: ${errorMessage}`);
  }
}