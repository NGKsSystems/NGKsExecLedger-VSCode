import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

interface LatestProofData {
  exec_id: string;
  session_id: string;
  mode: string;
  zip_path: string;
  manifest_path: string;
  created_at: string;
}

/**
 * Register the Open Latest Summary command
 */
export function registerOpenLatestSummaryCommand(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand("ngksExecLedger.openLatestSummary", async () => {
    await openLatestSummary();
  });
  
  context.subscriptions.push(command);
}

/**
 * Open the latest summary.txt file in VS Code editor
 */
async function openLatestSummary(): Promise<void> {
  try {
    const summaryPath = getLatestSummaryPath();
    
    if (!summaryPath || !fs.existsSync(summaryPath)) {
      vscode.window.showErrorMessage("ExecLedger: Latest summary.txt not found. Generate a proof bundle first.");
      return;
    }

    // Open the summary file in VS Code
    const uri = vscode.Uri.file(summaryPath);
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.One
    });

    vscode.window.showInformationMessage(`ExecLedger: Opened latest summary.txt`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to open latest summary: ${errorMessage}`);
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
    const outputRoot = config.get<string>("proof.outputRoot", "");
    
    let bundlesDir: string;
    if (outputRoot.trim()) {
      bundlesDir = path.join(outputRoot.trim(), "bundles");
    } else {
      bundlesDir = path.join(workspaceFolder.uri.fsPath, "_proof", "bundles");
    }

    const latestJsonPath = path.join(bundlesDir, "latest.json");
    
    if (!fs.existsSync(latestJsonPath)) {
      return null;
    }

    const content = fs.readFileSync(latestJsonPath, "utf8");
    const latestData = JSON.parse(content) as LatestProofData;

    // Construct the proof directory path
    let proofRootDir: string;
    if (outputRoot.trim()) {
      proofRootDir = outputRoot.trim();
    } else {
      proofRootDir = path.join(workspaceFolder.uri.fsPath, "_proof");
    }

    const proofDir = path.join(proofRootDir, `exec_${latestData.exec_id}`, latestData.mode, latestData.session_id);
    const summaryPath = path.join(proofDir, "summary.txt");
    
    return summaryPath;
  } catch (error) {
    return null;
  }
}