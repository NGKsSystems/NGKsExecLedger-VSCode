import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AuditRenderer, RenderOptions } from '../core/auditRenderer';

export class RenderAuditCommand {
    private renderer: AuditRenderer;
    
    constructor() {
        // Get renderer options from VS Code settings
        const config = vscode.workspace.getConfiguration('ngksAutologger');
        const options: RenderOptions = {
            includeHtml: config.get('renderer.includeHtml', false),
            maxPayloadChars: config.get('renderer.maxPayloadChars', 4000),
            maxDiffLinesInReport: config.get('renderer.maxDiffLinesInReport', 200),
            agentPreviewChars: config.get('renderer.agentPreviewChars', 200)
        };
        
        this.renderer = new AuditRenderer(options);
    }

    /**
     * Render audit for latest session
     */
    async renderLatestSession(): Promise<void> {
        try {
            const latestSessionFile = await this.findLatestSessionFile();
            if (!latestSessionFile) {
                vscode.window.showWarningMessage('No session files found to render');
                return;
            }

            await this.renderSession(latestSessionFile);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to render latest session: ${error}`);
        }
    }

    /**
     * Render audit for user-selected session file
     */
    async renderPickedSession(): Promise<void> {
        try {
            // Open file picker for JSONL files
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: {
                    'JSONL files': ['jsonl'],
                    'All files': ['*']
                },
                title: 'Select Session JSONL File to Render'
            });

            if (!fileUri || fileUri.length === 0) {
                return; // User cancelled
            }

            await this.renderSession(fileUri[0].fsPath);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to render selected session: ${error}`);
        }
    }

    private async renderSession(sessionFilePath: string): Promise<void> {
        const progressOptions = {
            location: vscode.ProgressLocation.Notification,
            title: 'Rendering NGKs Audit Report',
            cancellable: false
        };

        await vscode.window.withProgress(progressOptions, async (progress) => {
            try {
                progress.report({ message: 'Validating session file...' });
                
                // Determine output directory
                const workspaceRoot = this.getWorkspaceRoot();
                const outputDir = path.join(workspaceRoot, '.ngkssys', 'render');

                progress.report({ message: 'Running integrity verification...' });

                // Render the audit
                const result = await this.renderer.renderAudit(sessionFilePath, outputDir);

                if (!result.success) {
                    throw new Error(result.error || 'Unknown rendering error');
                }

                progress.report({ message: 'Audit report generated successfully!' });

                // Show success message with options to open
                const openAction = 'Open Audit Report';
                const openFolderAction = 'Open Containing Folder';
                const response = await vscode.window.showInformationMessage(
                    `Audit report generated successfully!`,
                    openAction,
                    openFolderAction
                );

                if (response === openAction) {
                    const auditMdPath = path.join(result.outputPath!, 'audit.md');
                    const auditDoc = await vscode.workspace.openTextDocument(auditMdPath);
                    await vscode.window.showTextDocument(auditDoc);
                } else if (response === openFolderAction) {
                    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(result.outputPath!), true);
                }

            } catch (error) {
                throw error;
            }
        });
    }

    private async findLatestSessionFile(): Promise<string | null> {
        const workspaceRoot = this.getWorkspaceRoot();
        const logsDir = path.join(workspaceRoot, '.ngkssys', 'logs', 'ngks-vscode-autologger');
        
        if (!fs.existsSync(logsDir)) {
            return null;
        }

        // Find all session directories
        const sessionDirs = fs.readdirSync(logsDir, { withFileTypes: true })
            .filter(entry => entry.isDirectory())
            .map(entry => path.join(logsDir, entry.name))
            .sort((a, b) => {
                // Sort by modification time, newest first
                const statA = fs.statSync(a);
                const statB = fs.statSync(b);
                return statB.mtime.getTime() - statA.mtime.getTime();
            });

        // Find the latest JSONL file in the most recent session
        for (const sessionDir of sessionDirs) {
            const jsonlFiles = fs.readdirSync(sessionDir)
                .filter(file => file.endsWith('.jsonl') && !file.includes('crash'))
                .map(file => ({
                    path: path.join(sessionDir, file),
                    stat: fs.statSync(path.join(sessionDir, file))
                }))
                .sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime());

            if (jsonlFiles.length > 0) {
                return jsonlFiles[0].path;
            }
        }

        return null;
    }

    private getWorkspaceRoot(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }
        return workspaceFolders[0].uri.fsPath;
    }
}

/**
 * Register render audit commands with VS Code
 */
export function registerRenderCommands(context: vscode.ExtensionContext): void {
    const renderCommand = new RenderAuditCommand();

    // Register latest session command
    const renderLatestDisposable = vscode.commands.registerCommand(
        'ngksAutologger.renderAuditLatest',
        () => renderCommand.renderLatestSession()
    );

    // Register pick session command  
    const renderPickDisposable = vscode.commands.registerCommand(
        'ngksAutologger.renderAuditPick',
        () => renderCommand.renderPickedSession()
    );

    context.subscriptions.push(renderLatestDisposable, renderPickDisposable);
}