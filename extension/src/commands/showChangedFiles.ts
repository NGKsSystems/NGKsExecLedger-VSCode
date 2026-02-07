import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { findLatestSession } from '../core/latestSession';

export async function showChangedFilesCommand(): Promise<void> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) {
    vscode.window.showErrorMessage('No workspace open');
    return;
  }

  const workspaceRoot = workspace.uri.fsPath;
  const latestSession = findLatestSession(workspaceRoot);

  if (!latestSession.found) {
    vscode.window.showWarningMessage('No sessions found. Start a session first.');
    return;
  }

  const summaryPath = path.join(latestSession.sessionDir, 'session_summary.json');

  if (!fs.existsSync(summaryPath)) {
    vscode.window.showWarningMessage(`Session summary not found for session ${latestSession.sessionId}. Stop the session to generate summary.`);
    return;
  }

  // Read session summary to get changed paths
  let changedPaths: string[] = [];
  let summary: any = null;
  
  try {
    const summaryContent = fs.readFileSync(summaryPath, 'utf-8');
    summary = JSON.parse(summaryContent);
    changedPaths = summary.changedPaths || [];
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to read session summary: ${error}`);
    return;
  }

  // Generate changed_files.md content
  let markdownContent = `# Changed Files Report\n\n`;
  markdownContent += `**Session ID:** ${latestSession.sessionId}\n`;
  markdownContent += `**Files Changed:** ${summary.filesChanged ? 'YES' : 'NO'}\n`;
  markdownContent += `**Files Added:** ${summary.filesAdded || 0}\n`;
  markdownContent += `**Files Modified:** ${summary.filesModified || 0}\n`;
  markdownContent += `**Files Deleted:** ${summary.filesDeleted || 0}\n\n`;

  if (changedPaths.length === 0) {
    markdownContent += `## NO CHANGES\n\n`;
    markdownContent += `No files were modified during this session.\n`;
  } else {
    markdownContent += `## Changed Files\n\n`;
    markdownContent += `The following ${changedPaths.length} file(s) were modified:\n\n`;
    
    for (const filePath of changedPaths) {
      markdownContent += `- \`${filePath}\`\n`;
    }
  }

  markdownContent += `\n---\n`;
  markdownContent += `*Generated on ${new Date().toISOString()}*\n`;

  // Write changed_files.md to session directory
  const changedFilesPath = path.join(latestSession.sessionDir, 'changed_files.md');
  
  try {
    fs.writeFileSync(changedFilesPath, markdownContent, 'utf-8');
    
    // Open the generated markdown file
    const changedFilesUri = vscode.Uri.file(changedFilesPath);
    const document = await vscode.workspace.openTextDocument(changedFilesUri);
    await vscode.window.showTextDocument(document);
    
    const changesText = changedPaths.length === 0 ? 'No changes' : `${changedPaths.length} file(s) changed`;
    vscode.window.showInformationMessage(`Generated changed files report: ${changesText}`);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to generate changed files report: ${error}`);
  }
}