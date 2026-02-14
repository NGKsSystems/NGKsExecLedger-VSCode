import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { resolveBundlesDir, resolveArtifactRoot } from "../core/artifactPaths";

interface LatestartifactsData {
  exec_id: string;
  session_id: string;
  mode: string;
  zip_path: string;
  manifest_path: string;
  created_at: string;
  // Phase 15: Optional pointer paths
  artifacts_dir?: string;
  summary_path?: string;
  report_path?: string;
}

/**
 * Register the Copy Latest Summary to Clipboard command  
 */
export function registerCopyLatestSummaryCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.copyLatestSummary", async () => {
    await copyLatestSummary();
  });
  
  context.subscriptions.push(command);
}

/**
 * Copy the latest summary.txt file content to clipboard
 */
async function copyLatestSummary(): Promise<void> {
  try {
    // Read ExecLedger configuration
    const config = vscode.workspace.getConfiguration("execLedger");
    const copySummaryToClipboard = config.get<boolean>("artifacts.copySummaryToClipboard", true);
    
    if (!copySummaryToClipboard) {
      vscode.window.showWarningMessage(
        "ExecLedger: Summary clipboard copy is disabled. Enable 'execLedger.artifacts.copySummaryToClipboard' setting to use this command.",
        "Enable Setting"
      ).then(action => {
        if (action === "Enable Setting") {
          vscode.commands.executeCommand("workbench.action.openSettings", "execLedger.artifacts.copySummaryToClipboard");
        }
      });
      return;
    }

    const summaryPath = getLatestSummaryPath();
    
    if (!summaryPath || !fs.existsSync(summaryPath)) {
      vscode.window.showErrorMessage("ExecLedger: Latest summary.txt not found. Generate artifacts first.");
      return;
    }

    // Read summary content
    const summaryContent = fs.readFileSync(summaryPath, "utf8");
    
    // Copy to clipboard with progress
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "ExecLedger: Copying summary to clipboard...",
      cancellable: false
    }, async (progress) => {
      progress.report({ message: "Reading summary file..." });
      
      // Add a small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 300));
      
      progress.report({ message: "Copying to clipboard..." });
      await vscode.env.clipboard.writeText(summaryContent);
      
      // Show success message with option to clear clipboard
      vscode.window.showInformationMessage(
        `ExecLedger: Summary copied to clipboard (${summaryContent.split('\n').length} lines).`,
        "Clear Clipboard"
      ).then(action => {
        if (action === "Clear Clipboard") {
          vscode.env.clipboard.writeText("");
          vscode.window.showInformationMessage("ExecLedger: Clipboard cleared.");
        }
      });
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to copy summary: ${errorMessage}`);
  }
}

/**
 * Get the path to the latest summary.txt file
 */
function getLatestSummaryPath(): string | null {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("artifacts.outputRoot", "");
    
    let bundlesDir: string;
    if (outputRoot.trim()) {
      bundlesDir = path.join(outputRoot.trim(), "bundles");
    } else {
      bundlesDir = resolveBundlesDir(workspaceFolder.uri.fsPath);
    }

    const latestJsonPath = path.join(bundlesDir, "latest.json");
    
    if (!fs.existsSync(latestJsonPath)) {
      return null;
    }

    const content = fs.readFileSync(latestJsonPath, "utf8");
    const latestData = JSON.parse(content) as LatestartifactsData;

    // Phase 15: Prefer summary_path from latest.json when present
    if (latestData.summary_path && fs.existsSync(latestData.summary_path)) {
      return latestData.summary_path;
    }

    // Fallback: Construct the artifacts directory path from components
    let artifactsRootDir: string;
    if (outputRoot.trim()) {
      artifactsRootDir = outputRoot.trim();
    } else {
      artifactsRootDir = resolveArtifactRoot(workspaceFolder.uri.fsPath).root;
    }

    const artifactsDir = path.join(artifactsRootDir, `exec_${latestData.exec_id}`, latestData.mode, latestData.session_id);
    const summaryPath = path.join(artifactsDir, "summary.txt");
    
    return summaryPath;
  } catch (error) {
    return null;
  }
}