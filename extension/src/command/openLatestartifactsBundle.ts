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
 * Register the Open Latest artifacts Bundle command
 */
export function registerOpenLatestartifactsBundleCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.openLatestartifactsBundle", async () => {
    await openLatestartifactsBundle();
  });
  
  context.subscriptions.push(command);
}

/**
 * Open the latest artifacts bundle (ZIP file or folder) in explorer
 */
async function openLatestartifactsBundle(): Promise<void> {
  try {
    const latestData = getLatestartifactsData();
    
    if (!latestData) {
      vscode.window.showErrorMessage("ExecLedger: No artifacts bundle found. Generate artifacts first.");
      return;
    }

    // Priority 1: Try to reveal ZIP bundle if it exists
    if (latestData.zip_path && fs.existsSync(latestData.zip_path)) {
      const bundleUri = vscode.Uri.file(latestData.zip_path);
      await vscode.commands.executeCommand("revealFileInOS", bundleUri);
      
      const shortExecId = latestData.exec_id.substring(0, 8);
      vscode.window.showInformationMessage(`ExecLedger: Opened artifacts bundle ${shortExecId} (${latestData.mode})`);
      return;
    }

    // Priority 2: Try to reveal artifacts directory if available
    if (latestData.artifacts_dir && fs.existsSync(latestData.artifacts_dir)) {
      const artifactsUri = vscode.Uri.file(latestData.artifacts_dir);
      await vscode.commands.executeCommand("revealFileInOS", artifactsUri);
      
      const shortExecId = latestData.exec_id.substring(0, 8);
      vscode.window.showInformationMessage(`ExecLedger: Opened artifacts directory ${shortExecId} (${latestData.mode})`);
      return;
    }

    // Priority 3: Fallback to constructing artifacts directory path
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const config = vscode.workspace.getConfiguration("execLedger");
      const outputRoot = config.get<string>("artifacts.outputRoot", "");
      
      let artifactsRootDir: string;
      if (outputRoot.trim()) {
        artifactsRootDir = outputRoot.trim();
      } else {
        artifactsRootDir = resolveArtifactRoot(workspaceFolder.uri.fsPath).root;
      }
      
      const artifactsDir = path.join(artifactsRootDir, `exec_${latestData.exec_id}`, latestData.mode, latestData.session_id);
      
      if (fs.existsSync(artifactsDir)) {
        const artifactsUri = vscode.Uri.file(artifactsDir);
        await vscode.commands.executeCommand("revealFileInOS", artifactsUri);
        
        const shortExecId = latestData.exec_id.substring(0, 8);
        vscode.window.showInformationMessage(`ExecLedger: Opened artifacts directory ${shortExecId} (${latestData.mode})`);
        return;
      }
    }

    // No valid paths found
    vscode.window.showErrorMessage("ExecLedger: artifacts bundle/directory not found. The bundle may have been moved or deleted.");
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to open artifacts bundle: ${errorMessage}`);
  }
}

/**
 * Get the latest artifacts data from latest.json
 */
function getLatestartifactsData(): LatestartifactsData | null {
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
    return JSON.parse(content) as LatestartifactsData;
    
  } catch (error) {
    return null;
  }
}