import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { resolveBundlesDir, resolveArtifactRoot } from "../core/artifactPaths";
import { validateLatestJson, validateIntegrityJson, detectDrift, type ValidationResult } from "../util/validation";

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
  integrity_path?: string;
}

interface artifactsSummaryData {
  compile_ok: boolean;
  artifacts_dir: string;
  fail_reasons: string;
  [key: string]: any; // For additional verify results
}

let statusBarItem: vscode.StatusBarItem | null = null;
let refreshTimeout: NodeJS.Timeout | undefined;

/**
 * Initialize the artifacts status bar
 */
export function initartifactsStatusBar(context: vscode.ExtensionContext): void {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBarItem.command = "ngksExecLedger.artifactsStatusBarAction";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  
  // Register click command
  const command = vscode.commands.registerCommand("ngksExecLedger.artifactsStatusBarAction", () => {
    showartifactsQuickPick();
  });
  context.subscriptions.push(command);

  // Initial status refresh
  refreshartifactsStatus();

  // Set up file watcher for latest.json changes
  setupartifactsWatcher(context);
}

/**
 * Set up file watcher for automatic status updates
 */
function setupartifactsWatcher(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  try {
    const bundlesDir = resolveBundlesDir(workspaceFolder.uri.fsPath);
    const latestJsonPath = path.join(bundlesDir, "latest.json");
    const latestJsonPattern = new vscode.RelativePattern(bundlesDir, "latest.json");
    const latestJsonWatcher = vscode.workspace.createFileSystemWatcher(latestJsonPattern);

    // Debounced refresh function
    const debouncedRefresh = () => {
      if (refreshTimeout) {
        clearTimeout(refreshTimeout);
      }
      refreshTimeout = setTimeout(() => {
        refreshartifactsStatus();
      }, 500); // 500ms debounce
    };

    latestJsonWatcher.onDidCreate(debouncedRefresh);
    latestJsonWatcher.onDidChange(debouncedRefresh);
    latestJsonWatcher.onDidDelete(debouncedRefresh);

    context.subscriptions.push(latestJsonWatcher);
  } catch (error) {
    // Silently handle watcher setup failures
  }
}

/**
 * Refresh the artifacts status bar display
 */
export function refreshartifactsStatus(): void {
  if (!statusBarItem) return;

  const latestData = getLatestartifactsData();
  if (!latestData) {
    statusBarItem.text = "$(package) ExecLedger: No artifacts";
    statusBarItem.tooltip = "No artifacts found. Click to generate or open artifacts bundle.";
  } else {
    const summaryData = getartifactsSummaryData(latestData);
    const isPass = summaryData && summaryData.fail_reasons === "None";
    
    // Phase 16: Drift detection for WARN state
    let driftResult: ValidationResult | null = null;
    let isDrifted = false;
    if (isPass && latestData.integrity_path) {
      const filePaths: { summary?: string, report?: string, manifest?: string } = {};
      if (latestData.summary_path) filePaths.summary = latestData.summary_path;
      if (latestData.report_path) filePaths.report = latestData.report_path;
      if (latestData.manifest_path) filePaths.manifest = latestData.manifest_path;
      driftResult = detectDrift(latestData.integrity_path, filePaths);
      isDrifted = !driftResult.valid;
    }
    
    let statusIcon: string;
    let statusText: string;
    if (!isPass) {
      statusIcon = "$(x)";
      statusText = "FAIL";
    } else if (isDrifted) {
      statusIcon = "$(warning)";
      statusText = "WARN";
    } else {
      statusIcon = "$(check)";
      statusText = "PASS";
    }
    
    // Show mode, pass/warn/fail status, and short exec_id (first 8 chars)
    const shortExecId = latestData.exec_id.substring(0, 8);
    statusBarItem.text = `${statusIcon} ExecLedger: ${statusText} ${latestData.mode} ${shortExecId}`;
    
    // Create detailed tooltip
    const createdDate = new Date(latestData.created_at).toLocaleString();
    const tooltipLines = [
      `**ExecLedger artifacts Status**`,
      ``,
      `📋 **Exec ID**: ${latestData.exec_id}`,
      `🆔 **Session ID**: ${latestData.session_id}`,
      `⚙️ **Mode**: ${latestData.mode}`,
      `📅 **Created**: ${createdDate}`,
      ``
    ];

    if (summaryData) {
      tooltipLines.push(
        `📊 **Status**: ${statusText}`,
        `❌ **Fail Reasons**: ${summaryData.fail_reasons}`,
        `📁 **artifacts Dir**: ${summaryData.artifacts_dir}`,
        ``
      );
    }

    tooltipLines.push(
      `📦 **ZIP Path**: ${latestData.zip_path}`,
      `📄 **Manifest Path**: ${latestData.manifest_path}`,
      ``
    );

    if (summaryData && summaryData.artifacts_dir) {
      const summaryPath = path.join(summaryData.artifacts_dir, "summary.txt");
      const reportPath = path.join(summaryData.artifacts_dir, "report.txt");
      tooltipLines.push(
        `📋 **Summary Path**: ${summaryPath}`,
        `📝 **Report Path**: ${reportPath}`,
        ``
      );
    }

    // Phase 16: Show integrity/drift info in tooltip
    if (driftResult && isDrifted) {
      tooltipLines.push(
        `⚠️ **Integrity Drift Detected**:`,
        ...driftResult.errors.map(e => `  - ${e}`),
        ``
      );
    }

    tooltipLines.push(`Click for quick actions menu`);
    statusBarItem.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
  }
}

/**
 * Show artifacts quick pick menu
 */
export async function showartifactsQuickPick(): Promise<void> {
  // Check tier configuration
  const config = vscode.workspace.getConfiguration("execLedger");
  const tier = config.get<string>("tier", "FREE");
  
  if (tier === "FREE") {
    vscode.window.showInformationMessage(
      "ExecLedger FREE tier: Use Command Palette for artifact actions",
      "Upgrade to PRO"
    ).then(action => {
      if (action === "Upgrade to PRO") {
        vscode.commands.executeCommand("workbench.action.openSettings", "execLedger.tier");
      }
    });
    return;
  }

  const items = [
    { label: "$(play) Run Milestone artifacts Gates", description: "Execute verification", command: "ngksExecLedger.runMilestoneGates" },
    { label: "$(export) Export artifacts Bundle", description: "Create ZIP bundle", command: "ngksExecLedger.exportartifactsBundle" },
    { label: "$(list-ordered) Open Latest Summary", description: "View summary.txt", command: "ngksExecLedger.openLatestSummary" },
    { label: "$(file-text) Open Latest artifacts Report", description: "View report.txt", command: "ngksExecLedger.openLatestartifactsReport" },
    { label: "$(copy) Copy Latest Summary", description: "Copy to clipboard", command: "ngksExecLedger.copyLatestSummary" },
    { label: "$(file-directory) Open Latest artifacts Folder", description: "Reveal directory", action: "revealFolder" },
    { label: "$(package) Open Latest artifacts Bundle", description: "Open ZIP bundle", command: "ngksExecLedger.openLatestartifactsBundle" }
  ];
  
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Choose an artifacts action...",
    matchOnDescription: true
  });
  
  if (selected) {
    if (selected.command) {
      await vscode.commands.executeCommand(selected.command);
    } else if (selected.action === "revealFolder") {
      await revealartifactsFolder();
    }
  }
}

/**
 * Reveal latest artifacts folder in file explorer
 */
export async function revealartifactsFolder(): Promise<void> {
  try {
    const latestData = getLatestartifactsData();
    
    if (!latestData) {
      vscode.window.showErrorMessage("ExecLedger: No artifacts found to reveal.");
      return;
    }

    // Priority 1: Use artifacts_dir from latest.json if available
    if (latestData.artifacts_dir && fs.existsSync(latestData.artifacts_dir)) {
      const artifactsUri = vscode.Uri.file(latestData.artifacts_dir);
      await vscode.commands.executeCommand("revealFileInOS", artifactsUri);
      return;
    }

    // Priority 2: Construct path from components
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
        return;
      }
    }

    vscode.window.showErrorMessage("ExecLedger: artifacts folder not found or has been moved.");
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to reveal artifacts folder: ${errorMessage}`);
  }
}

/**
 * Get latest artifacts data from latest.json
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

/**
 * Get artifacts summary data
 */
function getartifactsSummaryData(latestData: LatestartifactsData): artifactsSummaryData | null {
  try {
    // Try to get summary from summary_path first
    if (latestData.summary_path && fs.existsSync(latestData.summary_path)) {
      return parseartifactsSummary(latestData.summary_path);
    }

    // Fallback: construct path from artifactsartifacts_dir
    if (latestData.artifacts_dir) {
      const summaryPath = path.join(latestData.artifacts_dir, "summary.txt");
      if (fs.existsSync(summaryPath)) {
        return parseartifactsSummary(summaryPath);
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse artifacts summary file
 */
function parseartifactsSummary(summaryPath: string): artifactsSummaryData | null {
  try {
    const content = fs.readFileSync(summaryPath, 'utf8');
    const lines = content.split('\n').map(line => line.trim());

    const data: artifactsSummaryData = {
      compile_ok: false,
      artifacts_dir: "",
      fail_reasons: "Unknown"
    };

    for (const line of lines) {
      if (line.startsWith('COMPILE_OK=')) {
        data.compile_ok = line.split('=')[1] === 'True';
      } else if (line.startsWith('artifacts_DIR=')) {
        data.artifacts_dir = line.split('=')[1] || "";
      } else if (line.startsWith('FAIL_REASONS=')) {
        data.fail_reasons = line.split('=')[1] || "Unknown";
      } else if (line.match(/^VERIFY_\d+(_\d+)?_OK=/)) {
        const [key, value] = line.split('=');
        data[key] = value === 'True';
      }
    }

    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Called when export completes to refresh status
 */
export function onExportComplete(): void {
  refreshartifactsStatus();
}