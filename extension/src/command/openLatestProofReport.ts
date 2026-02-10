// File: extension/src/command/openLatestProofReport.ts
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

/**
 * Registers the open latest proof report command
 */
export function registerOpenLatestProofReportCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.openLatestProofReport", async () => {
    await executeOpenLatestProofReport();
  });

  context.subscriptions.push(command);
}

/**
 * Opens the latest proof report from latest.json
 */
async function executeOpenLatestProofReport(): Promise<void> {
  try {
    // Read ExecLedger configuration
    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("proof.outputRoot", "");
    const copyToClipboard = config.get<boolean>("proof.copyReportToClipboard", false);

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
        "ExecLedger: No latest proof report found. Run Milestone with ExportBundle Auto/YES first.",
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
          if (reportEntry && manifest.proof_dir) {
            reportPath = path.join(manifest.proof_dir, "report.txt");
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
      
      let proofRoot: string;
      if (outputRoot.trim()) {
        proofRoot = outputRoot.trim();
      } else {
        proofRoot = path.join(repoRoot, "_proof");
      }
      
      const proofDir = path.join(proofRoot, `exec_${execId}`, mode, sessionId);
      reportPath = path.join(proofDir, "report.txt");
    }

    // Check if report.txt exists
    if (!fs.existsSync(reportPath)) {
      vscode.window.showErrorMessage(
        `ExecLedger: Proof report not found: ${path.basename(reportPath)}. Run Milestone with ExportBundle Auto/YES first.`,
        "Run Export"
      ).then(action => {
        if (action === "Run Export") {
          vscode.commands.executeCommand("ngksExecLedger.exportProofBundle");
        }
      });
      return;
    }

    // Show progress while opening
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "ExecLedger: Opening proof report...",
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
            `ExecLedger: Proof report opened and copied to clipboard.`,
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
            `ExecLedger: Proof report opened.\nExec: ${execId}\nSession: ${sessionId}\nMode: ${mode}\nCreated: ${createdAt}`
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