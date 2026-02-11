import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { validateLatestJson, validateIntegrityJson, detectDrift, type ValidationResult } from "../util/validation";

interface LatestProofData {
  exec_id: string;
  session_id: string;
  mode: string;
  zip_path: string;
  manifest_path: string;
  created_at: string;
  // Phase 15: Optional pointer paths
  proof_dir?: string;
  summary_path?: string;
  report_path?: string;
  diff_name_only_path?: string;
  status_path?: string;
  compile_log_path?: string;
  // Phase 16: Optional integrity path
  integrity_path?: string;
}

interface ProofSummaryData {
  exec_id: string;
  session_id: string;
  mode: string;
  compile_ok: boolean;
  fail_reasons: string;
  proof_dir: string;
  [key: string]: any; // For other VERIFY_* fields
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
    const summaryData = getProofSummaryData(latestData);
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
      `**ExecLedger Proof Status**`,
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
        `📁 **Proof Dir**: ${summaryData.proof_dir}`,
        ``
      );
    }

    tooltipLines.push(
      `📦 **ZIP Path**: ${latestData.zip_path}`,
      `📄 **Manifest Path**: ${latestData.manifest_path}`,
      ``
    );

    if (summaryData && summaryData.proof_dir) {
      const summaryPath = path.join(summaryData.proof_dir, "summary.txt");
      const reportPath = path.join(summaryData.proof_dir, "report.txt");
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
 * Get proof summary data from summary.txt in the latest proof directory
 */
function getProofSummaryData(latestData: LatestProofData): ProofSummaryData | null {
  try {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;

    const config = vscode.workspace.getConfiguration("execLedger");
    const outputRoot = config.get<string>("proof.outputRoot", "");
    
    // Phase 15: Prefer summary_path from latest.json when present
    let summaryPath: string;
    let proofDir: string;
    
    if (latestData.summary_path && fs.existsSync(latestData.summary_path)) {
      summaryPath = latestData.summary_path;
      proofDir = latestData.proof_dir || path.dirname(summaryPath);
    } else {
      // Fallback: Compute path from exec_id/mode/session_id
      let proofRootDir: string;
      if (outputRoot.trim()) {
        proofRootDir = outputRoot.trim();
      } else {
        proofRootDir = path.join(workspaceFolder.uri.fsPath, "_proof");
      }
      proofDir = path.join(proofRootDir, `exec_${latestData.exec_id}`, latestData.mode, latestData.session_id);
      summaryPath = path.join(proofDir, "summary.txt");
    }
    
    if (!fs.existsSync(summaryPath)) {
      return null;
    }

    const content = fs.readFileSync(summaryPath, "utf8");
    const lines = content.split('\n').filter(line => line.trim().length > 0);
    
    const summaryData: ProofSummaryData = {
      exec_id: latestData.exec_id,
      session_id: latestData.session_id,
      mode: latestData.mode,
      compile_ok: false,
      fail_reasons: "Unknown",
      proof_dir: proofDir
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
      } else if (cleanKey === 'proof_dir') {
        summaryData.proof_dir = cleanValue;
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
        label: "$(list-ordered) Open Latest Summary",
        description: "View proof summary in VS Code editor",
        detail: "Opens summary.txt from latest proof bundle"
      },
      {
        label: "$(copy) Copy Latest Summary",
        description: "Copy proof summary to clipboard",
        detail: "Copies summary.txt content to clipboard"
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
  } else if (selected.label.includes("Open Latest Summary")) {
    await vscode.commands.executeCommand("ngksExecLedger.openLatestSummary");
  } else if (selected.label.includes("Copy Latest Summary")) {
    await vscode.commands.executeCommand("ngksExecLedger.copyLatestSummary");
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