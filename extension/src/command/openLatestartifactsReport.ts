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
 * Register the Open Latest artifacts Report command
 */
export function registerOpenLatestartifactsReportCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.openLatestartifactsReport", async () => {
    await openLatestartifactsReport();
  });
  
  context.subscriptions.push(command);
}

/**
 * Open the latest report.txt file in VS Code editor
 */
async function openLatestartifactsReport(): Promise<void> {
  try {
    const reportPath = getLatestReportPath();
    
    if (!reportPath || !fs.existsSync(reportPath)) {
      vscode.window.showErrorMessage("ExecLedger: Latest report.txt not found. Generate artifacts first.");
      return;
    }

    // Open the report file in VS Code
    const uri = vscode.Uri.file(reportPath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });

    // Check configuration for auto-copy to clipboard
    const config = vscode.workspace.getConfiguration("execLedger");
    const copyToClipboard = config.get<boolean>("artifacts.copyReportToClipboard", false);
    
    if (copyToClipboard) {
      try {
        const content = fs.readFileSync(reportPath, "utf8");
        await vscode.env.clipboard.writeText(content);
        vscode.window.showInformationMessage("ExecLedger: Opened report.txt and copied to clipboard");
      } catch (clipboardError) {
        vscode.window.showInformationMessage("ExecLedger: Opened report.txt (clipboard copy failed)");
      }
    } else {
      vscode.window.showInformationMessage("ExecLedger: Opened latest report.txt");
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to open latest report: ${errorMessage}`);
  }
}

/**
 * Get the path to the latest report.txt file
 */
function getLatestReportPath(): string | null {
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

    // Phase 15: Prefer report_path from latest.json when present
    if (latestData.report_path && fs.existsSync(latestData.report_path)) {
      return latestData.report_path;
    }

    // Fallback: Construct the artifacts directory path from components
    let artifactsRootDir: string;
    if (outputRoot.trim()) {
      artifactsRootDir = outputRoot.trim();
    } else {
      artifactsRootDir = resolveArtifactRoot(workspaceFolder.uri.fsPath).root;
    }

    const artifactsDir = path.join(artifactsRootDir, `exec_${latestData.exec_id}`, latestData.mode, latestData.session_id);
    const reportPath = path.join(artifactsDir, "report.txt");
    
    return reportPath;
  } catch (error) {
    return null;
  }
}