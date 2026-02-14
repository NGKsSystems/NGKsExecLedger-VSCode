import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { resolveBundlesDir, resolveArtifactRoot } from "../core/artifactPaths";
import { validateLatestJson, validateIntegrityJson, detectDrift, type ValidationResult } from "../util/validation";

interface LatestArtifactsData {
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
  diff_name_only_path?: string;
  status_path?: string;
  compile_log_path?: string;
  // Phase 16: Optional integrity path
  integrity_path?: string;
}

interface ArtifactsSummaryData {
  exec_id: string;
  session_id: string;
  mode: string;
  compile_ok: boolean;
  fail_reasons: string;
  artifacts_dir: string;
  [key: string]: any; // For other VERIFY_* fields
}

let statusBarItem: vscode.StatusBarItem | null = null;
let latestJsonWatcher: vscode.FileSystemWatcher | null = null;
let refreshTimeout: NodeJS.Timeout | null = null;

/**
 * Initialize the artifacts status bar item
 */
export function initArtifactsStatusBar(context: vscode.ExtensionContext): void {
  // Create status bar item on the right side
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBarItem.command = "ngksExecLedger.artifactsStatusBarAction";
  
  context.subscriptions.push(statusBarItem);
  
  // Register the command for status bar clicks
  const command = vscode.commands.registerCommand("ngksExecLedger.artifactsStatusBarAction", () => {
    showArtifactsQuickPick();
  });
  context.subscriptions.push(command);

  // Set up file watcher for latest.json
  setupLatestJsonWatcher(context);
  
  // Initial refresh
  refreshArtifactsStatus();
}

/**
 * Setup file watcher for latest.json with debouncing
 */
function setupLatestJsonWatcher(context: vscode.ExtensionContext): void {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) return;

  const config = vscode.workspace.getConfiguration("execLedger");
  const outputRoot = config.get<string>("artifacts.outputRoot", "");
  
  let bundlesDir: string;
  if (outputRoot.trim()) {
    bundlesDir = path.join(outputRoot.trim(), "bundles");
  } else {
    bundlesDir = resolveBundlesDir(workspaceFolder.uri.fsPath);
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
      refreshArtifactsStatus();
    }, 500); // 500ms debounce
  };

  latestJsonWatcher.onDidCreate(debouncedRefresh);
  latestJsonWatcher.onDidChange(debouncedRefresh);
  latestJsonWatcher.onDidDelete(debouncedRefresh);

  context.subscriptions.push(latestJsonWatcher);
}

/**
 * Refresh the artifacts status bar display
 */
export function refreshArtifactsStatus(): void {
  if (!statusBarItem) return;

  // Get workspace root
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    statusBarItem.text = "$(package) ExecLedger: No workspace";
    statusBarItem.tooltip = "No workspace folder is open. Open a project to use ExecLedger.";
    statusBarItem.show();
    return;
  }

  // Resolve artifact root using single source of truth
  const artifactResolution = resolveArtifactRoot(workspaceFolder.uri.fsPath);
  
  // Check if artifact root directory exists
  if (!fs.existsSync(artifactResolution.root)) {
    statusBarItem.text = "$(package) ExecLedger: No artifacts (root missing)";
    statusBarItem.tooltip = `Artifact root directory does not exist: ${artifactResolution.root}. Click to generate artifacts.`;
    statusBarItem.show();
    return;
  }

  // Check for exec_* folders
  const execFolders = fs.readdirSync(artifactResolution.root)
    .filter(name => name.startsWith('exec_'))
    .filter(name => fs.statSync(path.join(artifactResolution.root, name)).isDirectory());
    
  if (execFolders.length === 0) {
    statusBarItem.text = "$(package) ExecLedger: No artifacts (no runs yet)";
    statusBarItem.tooltip = `Artifact root exists but no execution runs found in: ${artifactResolution.root}. Click to run milestone gates.`;
    statusBarItem.show();
    return;
  }

  // We have artifacts, proceed with normal status logic
  const latestData = getLatestArtifactsData();
  if (!latestData) {
    statusBarItem.text = "$(package) ExecLedger: Ready";
    statusBarItem.tooltip = `Found ${execFolders.length} execution run(s) in: ${artifactResolution.root}. Click to access artifacts.`;
  } else {
    const summaryData = getArtifactsSummaryData(latestData);
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
      `**ExecLedger Artifacts Status**`,
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
        `📁 **Artifacts Dir**: ${summaryData.artifacts_dir}`,
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
    } else if (latestData.integrity_path) {
      tooltipLines.push(
        `🔒 **Integrity**: Verified (no drift)`,
        ``
      );
    }

    tooltipLines.push(`_Click for quick actions_`);
    
    statusBarItem.tooltip = new vscode.MarkdownString(tooltipLines.join('\n'));
  }

  statusBarItem.show();
}

/**
 * Get latest artifacts data from latest.json
 */
function getLatestArtifactsData(): LatestArtifactsData | null {
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
    const data = JSON.parse(content) as LatestArtifactsData;
    
    // Validate required fields
    const requiredFields = ["exec_id", "session_id", "mode", "zip_path", "manifest_path", "created_at"];
    const missingFields = requiredFields.filter(field => !data[field as keyof LatestArtifactsData]);
    if (missingFields.length > 0) {
      return null;
    }

    return data;
  } catch (error) {
    return null;
  }
}

/**
 * Get artifacts summary data from summary.txt in the latest artifacts directory
 */
function getArtifactsSummaryData(latestData: LatestArtifactsData): ArtifactsSummaryData | null {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("artifacts.outputRoot", "");
    
    // Phase 15: Prefer summary_path from latest.json when present
    let summaryPath: string;
    let artifactsDir: string;
    
    if (latestData.summary_path && fs.existsSync(latestData.summary_path)) {
      summaryPath = latestData.summary_path;
      artifactsDir = latestData.artifacts_dir || path.dirname(summaryPath);
    } else {
      // Fallback: Compute path from exec_id/mode/session_id
      let artifactsRootDir: string;
      if (outputRoot.trim()) {
        artifactsRootDir = outputRoot.trim();
      } else {
        artifactsRootDir = resolveArtifactRoot(workspaceFolder.uri.fsPath).root;
      }
      artifactsDir = path.join(artifactsRootDir, `exec_${latestData.exec_id}`, latestData.mode, latestData.session_id);
      summaryPath = path.join(artifactsDir, "summary.txt");
    }
    
    if (!fs.existsSync(summaryPath)) {
      return null;
    }

    const content = fs.readFileSync(summaryPath, "utf8");
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    const summaryData: ArtifactsSummaryData = {
      exec_id: latestData.exec_id,
      session_id: latestData.session_id,
      mode: latestData.mode,
      compile_ok: false,
      fail_reasons: "Unknown",
      artifacts_dir: artifactsDir
    };

    // Parse key=value pairs from summary.txt
    for (const line of lines) {
      const [key, value] = line.split('=', 2);
      if (!key || !value) continue;

      const cleanKey = key.trim().toLowerCase();
      const cleanValue = value.trim();
      
      if (cleanKey === 'compile_ok') {
        summaryData.compile_ok = cleanValue === 'True';
      } else if (cleanKey === 'fail_reasons') {
        summaryData.fail_reasons = cleanValue;
      } else if (cleanKey === 'artifacts_dir') {
        summaryData.artifacts_dir = cleanValue;
      } else {
        // Store other fields dynamically (VERIFY_* fields, etc.)
        summaryData[cleanKey] = cleanValue;
      }
    }
    
    return summaryData;
  } catch (error) {
    return null;
  }
}

/**
 * Show QuickPick with artifacts actions
 */
async function showArtifactsQuickPick(): Promise<void> {
  const latestData = getLatestArtifactsData();
  const hasArtifacts = !!latestData;

  const items: vscode.QuickPickItem[] = [
    {
      label: "$(play) Run Milestone Gates",
      description: "Execute full milestone verification",
      detail: "Runs all phase gates and generates artifacts bundle"
    }
  ];

  if (hasArtifacts) {
    items.push(
      {
        label: "$(list-ordered) Open Latest Summary",
        description: "View artifacts summary in VS Code editor",
        detail: "Opens summary.txt from latest artifacts bundle"
      },
      {
        label: "$(clippy) Copy Latest Summary",
        description: "Copy summary content to clipboard", 
        detail: "Copies summary.txt content to system clipboard"
      },
      {
        label: "$(file-text) Open Latest Report", 
        description: "View artifacts report in VS Code editor",
        detail: "Opens report.txt from latest artifacts bundle"
      },
      {
        label: "$(json) Reveal latest.json",
        description: "Open latest.json configuration",
        detail: "Opens the latest.json tracking file"
      },
      {
        label: "$(file-directory) Open Latest Artifacts Folder",
        description: "Reveal artifacts directory in file explorer",
        detail: `Opens: ${latestData.artifacts_dir || 'artifacts directory'} (artifacts)`
      },
      {
        label: "$(package) Open Latest Artifacts Bundle (zip)",
        description: "Reveal artifacts bundle zip in file explorer",
        detail: `Opens: ${latestData.zip_path}`
      }
    );
  } else {
    items.push({
      label: "$(info) No artifacts found",
      description: "Run milestone gates to generate artifacts",
      detail: "Click 'Run Milestone Gates' above to create your first artifacts"
    });
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: hasArtifacts 
      ? `ExecLedger artifacts actions - ${latestData.mode} ${latestData.exec_id.substring(0, 8)}`
      : "ExecLedger artifacts actions - No artifacts found"
  });

  if (!selected) return;

  // Execute the selected action
  if (selected.label.includes("Run Milestone Gates")) {
    await vscode.commands.executeCommand("ngksExecLedger.runMilestoneGates");
  } else if (selected.label.includes("Open Latest Summary")) {
    await vscode.commands.executeCommand("ngksExecLedger.openLatestSummary");
  } else if (selected.label.includes("Copy Latest Summary")) {
    await vscode.commands.executeCommand("ngksExecLedger.copyLatestSummary");
  } else if (selected.label.includes("Open Latest Report")) {
    await vscode.commands.executeCommand("ngksExecLedger.openLatestArtifactsReport");
  } else if (selected.label.includes("Reveal latest.json")) {
    await revealLatestJson();
  } else if (selected.label.includes("Open Latest Artifacts Folder")) {
    await revealArtifactsFolder();
  } else if (selected.label.includes("Open Latest Artifacts Bundle")) {
    await vscode.commands.executeCommand("ngksExecLedger.openLatestartifactsBundle");
  }
}

/**
 * Reveal latest.json file in editor
 */
async function revealLatestJson(): Promise<void> {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("artifacts.outputRoot", "");
    
    let bundlesDir: string;
    if (outputRoot.trim()) {
      bundlesDir = path.join(outputRoot.trim(), "bundles");
    } else {
      bundlesDir = resolveBundlesDir(workspaceFolder.uri.fsPath);
    }

    const latestJsonPath = path.join(bundlesDir, "latest.json");
    if (fs.existsSync(latestJsonPath)) {
      const document = await vscode.workspace.openTextDocument(latestJsonPath);
      await vscode.window.showTextDocument(document);
    } else {
      vscode.window.showErrorMessage("ExecLedger: latest.json not found.");
    }
  } catch (error) {
    vscode.window.showErrorMessage(`ExecLedger: Failed to open latest.json: ${error}`);
  }
}

/**
 * Reveal artifacts folder in file explorer
 */
async function revealArtifactsFolder(): Promise<void> {
  try {
    const latestData = getLatestArtifactsData();
    if (!latestData) {
      vscode.window.showErrorMessage("ExecLedger: No artifact data found. Generate artifacts first.");
      return;
    }

    let artifactsDir: string;
    
    // Prefer artifacts_dir from latest.json when present
    if (latestData.artifacts_dir && fs.existsSync(latestData.artifacts_dir)) {
      artifactsDir = latestData.artifacts_dir;
    } else {
      // Fallback: construct artifacts directory path
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("ExecLedger: No workspace folder found.");
        return;
      }

      const config = vscode.workspace.getConfiguration("execLedger");
      const outputRoot = config.get<string>("artifacts.outputRoot", "");
      
      let artifactsRootDir: string;
      if (outputRoot.trim()) {
        artifactsRootDir = outputRoot.trim();
      } else {
        artifactsRootDir = resolveArtifactRoot(workspaceFolder.uri.fsPath).root;
      }

      artifactsDir = path.join(artifactsRootDir, `exec_${latestData.exec_id}`, latestData.mode, latestData.session_id);
    }
    
    if (!fs.existsSync(artifactsDir)) {
      vscode.window.showErrorMessage(`ExecLedger: Artifacts directory not found: ${artifactsDir}`);
      return;
    }

    const uri = vscode.Uri.file(artifactsDir);
    await vscode.commands.executeCommand("revealFileInOS", uri);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`ExecLedger: Failed to reveal artifacts folder: ${errorMessage}`);
  }
}

/**
 * Hook to refresh after export command completes
 */
export function onExportComplete(): void {
  // Small delay to ensure file system has updated
  setTimeout(() => {
    refreshArtifactsStatus();
  }, 1000);
}

/**
 * Dispose resources
 */
export function disposeartifactsStatusBar(): void {
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