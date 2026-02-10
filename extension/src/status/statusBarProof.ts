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

let statusBarItem: vscode.StatusBarItem | null = null;
let latestJsonWatcher: vscode.FileSystemWatcher | null = null;
let refreshTimeout: NodeJS.Timeout | null = null;

/**
 * Initialize the proof status bar item
 */
export function initProofStatusBar(context: vscode.ExtensionContext): void {
  // Create status bar item on the right side
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBarItem.command = "ngksExecLedger.proofStatusBarAction";
  
  context.subscriptions.push(statusBarItem);
  
  // Register the command for status bar clicks
  const command = vscode.commands.registerCommand("ngksExecLedger.proofStatusBarAction", () => {
    showProofQuickPick();
  });
  context.subscriptions.push(command);

  // Set up file watcher for latest.json
  setupLatestJsonWatcher(context);
  
  // Initial refresh
  refreshProofStatus();
}

/**
 * Setup file watcher for latest.json with debouncing
 */
function setupLatestJsonWatcher(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const config = vscode.workspace.getConfiguration("execLedger");
  const outputRoot = config.get<string>("proof.outputRoot", "");
  
  let bundlesDir: string;
  if (outputRoot.trim()) {
    bundlesDir = path.join(outputRoot.trim(), "bundles");
  } else {
    bundlesDir = path.join(workspaceFolder.uri.fsPath, "_proof", "bundles");
  }

  const latestJsonPath = path.join(bundlesDir, "latest.json");
  const latestJsonPattern = new vscode.RelativePattern(bundlesDir, "latest.json");
  
  latestJsonWatcher = vscode.workspace.createFileSystemWatcher(latestJsonPattern);
  
  // Debounced refresh function
  const debouncedRefresh = () => {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
    }
    refreshTimeout = setTimeout(() => {
      refreshProofStatus();
    }, 500); // 500ms debounce
  };

  latestJsonWatcher.onDidCreate(debouncedRefresh);
  latestJsonWatcher.onDidChange(debouncedRefresh);
  latestJsonWatcher.onDidDelete(debouncedRefresh);

  context.subscriptions.push(latestJsonWatcher);
}

/**
 * Refresh the proof status bar display
 */
export function refreshProofStatus(): void {
  if (!statusBarItem) return;

  const latestData = getLatestProofData();
  if (!latestData) {
    statusBarItem.text = "$(package) ExecLedger: No proof";
    statusBarItem.tooltip = "No proof artifacts found. Click to generate or open proof bundle.";
  } else {
    // Show mode and short exec_id (first 8 chars)
    const shortExecId = latestData.exec_id.substring(0, 8);
    statusBarItem.text = `$(package) ExecLedger: ${latestData.mode} ${shortExecId}`;
    
    // Create detailed tooltip
    const createdDate = new Date(latestData.created_at).toLocaleString();
    statusBarItem.tooltip = new vscode.MarkdownString([
      `**ExecLedger Proof Status**`,
      ``,
      `📋 **Exec ID**: ${latestData.exec_id}`,
      `🆔 **Session ID**: ${latestData.session_id}`,
      `⚙️ **Mode**: ${latestData.mode}`,
      `📦 **ZIP Path**: ${latestData.zip_path}`,
      `📄 **Manifest Path**: ${latestData.manifest_path}`,
      `📅 **Created**: ${createdDate}`,
      ``,
      `_Click for quick actions_`
    ].join('\n'));
  }

  statusBarItem.show();
}

/**
 * Get latest proof data from latest.json
 */
function getLatestProofData(): LatestProofData | null {
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
    const data = JSON.parse(content) as LatestProofData;
    
    // Validate required fields
    const requiredFields = ["exec_id", "session_id", "mode", "zip_path", "manifest_path", "created_at"];
    const missingFields = requiredFields.filter(field => !data[field as keyof LatestProofData]);
    if (missingFields.length > 0) {
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Show QuickPick with proof actions
 */
async function showProofQuickPick(): Promise<void> {
  const latestData = getLatestProofData();
  const hasProof = !!latestData;

  const items: vscode.QuickPickItem[] = [
    {
      label: "$(export) Export Proof Bundle",
      description: "Generate new proof bundle",
      detail: "Creates a new proof bundle with current state"
    }
  ];

  if (hasProof) {
    items.push(
      {
        label: "$(package) Open Latest Proof Bundle",
        description: "Open bundled proof artifacts in file explorer",
        detail: `Opens: ${latestData.zip_path}`
      },
      {
        label: "$(file-text) Open Latest Proof Report", 
        description: "View proof report in VS Code editor",
        detail: "Opens report.txt from latest proof bundle"
      },
      {
        label: "$(file-directory) Reveal latest.json",
        description: "Show latest.json in file explorer",
        detail: "Reveals the latest proof pointer file"
      }
    );
  } else {
    items.push({
      label: "$(info) Generate first proof bundle",
      description: "No proof artifacts found",
      detail: "Run Export Proof Bundle to create your first proof"
    });
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: hasProof 
      ? `ExecLedger proof actions - ${latestData.mode} ${latestData.exec_id.substring(0, 8)}`
      : "ExecLedger proof actions - No proof found"
  });

  if (!selected) return;

  // Execute the selected action
  if (selected.label.includes("Export Proof Bundle") || selected.label.includes("Generate first")) {
    await vscode.commands.executeCommand("ngksExecLedger.exportProofBundle");
  } else if (selected.label.includes("Open Latest Proof Bundle")) {
    await vscode.commands.executeCommand("ngksExecLedger.openLatestProofBundle");
  } else if (selected.label.includes("Open Latest Proof Report")) {
    await vscode.commands.executeCommand("ngksExecLedger.openLatestProofReport");
  } else if (selected.label.includes("Reveal latest.json")) {
    await revealLatestJson();
  }
}

/**
 * Reveal latest.json in file explorer
 */
async function revealLatestJson(): Promise<void> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      vscode.window.showErrorMessage("ExecLedger: No workspace folder found.");
      return;
    }

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
      vscode.window.showErrorMessage("ExecLedger: latest.json not found. Generate a proof bundle first.");
      return;
    }

    const uri = vscode.Uri.file(latestJsonPath);
    await vscode.commands.executeCommand("revealFileInOS", uri);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to reveal latest.json: ${errorMessage}`);
  }
}

/**
 * Hook to refresh after export command completes
 */
export function onExportComplete(): void {
  // Small delay to ensure file system has updated
  setTimeout(() => {
    refreshProofStatus();
  }, 1000);
}

/**
 * Dispose resources
 */
export function disposeProofStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = null;
  }
  
  if (latestJsonWatcher) {
    latestJsonWatcher.dispose();
    latestJsonWatcher = null;
  }

  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
    refreshTimeout = null;
  }
}