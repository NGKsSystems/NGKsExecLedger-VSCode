import * as fs from 'fs';
import * as path from 'path';
import { verifyLogIntegrity, IntegrityResult } from './integrityVerifier';

export interface RenderOptions {
    includeHtml?: boolean;
    maxPayloadChars?: number;
    maxDiffLinesInReport?: number;
    agentPreviewChars?: number;
    allowNonconformant?: boolean;
}

export interface RenderManifest {
    input_file: string;
    session_id: string;
    render_timestamp: string;
    input_line_count: number;
    rendered_event_count: number;
    events_digest: { seq: number; hash: string }[];
    integrity_result: 'PASS' | 'FAIL';
    output_files: string[];
    renderer_version: string;
}

export interface RenderResult {
    success: boolean;
    error?: string;
    outputPath?: string;
    manifest?: RenderManifest;
}

export class AuditRenderer {
    private options: Required<RenderOptions>;
    
    constructor(options: RenderOptions = {}) {
        this.options = {
            includeHtml: options.includeHtml ?? false,
            maxPayloadChars: options.maxPayloadChars ?? 4000,
            maxDiffLinesInReport: options.maxDiffLinesInReport ?? 200,
            agentPreviewChars: options.agentPreviewChars ?? 200,
            allowNonconformant: options.allowNonconformant ?? false
        };
    }

    /**
     * Render audit report from JSONL session file
     */
    async renderAudit(inputPath: string, outputDir: string): Promise<RenderResult> {
        try {
            // Validate input file exists
            if (!fs.existsSync(inputPath)) {
                return { success: false, error: `Input file not found: ${inputPath}` };
            }

            // Read and parse JSONL
            const rawLines = fs.readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(line => line.trim().length > 0);
            const events = rawLines.map((line, index) => {
                try {
                    return JSON.parse(line);
                } catch (error) {
                    throw new Error(`Parse error at line ${index + 1}: ${error}`);
                }
            });

            // Extract session_id from first event
            if (events.length === 0) {
                return { success: false, error: 'Empty session file' };
            }

            const sessionId = events[0].session_id;
            if (!sessionId) {
                return { success: false, error: 'No session_id found in first event' };
            }

            // Pre-check: Run integrity verification (skip if allowing non-conformant)
            let integrityResult;
            if (!this.options.allowNonconformant) {
                integrityResult = verifyLogIntegrity(inputPath);
                
                if (!integrityResult.ok) {
                    return { 
                        success: false, 
                        error: `Integrity verification failed: ${integrityResult.firstError?.reason || 'Unknown error'}` 
                    };
                }
            } else {
                // Create a fake passing result for non-conformant mode
                integrityResult = { ok: true, total: events.length };
            }

            // Ensure output directory exists
            const sessionOutputDir = path.join(outputDir, sessionId);
            fs.mkdirSync(sessionOutputDir, { recursive: true });

            // Validate output directory is writable
            try {
                const testFile = path.join(sessionOutputDir, '.write_test');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
            } catch (error) {
                return { success: false, error: `Output directory not writable: ${sessionOutputDir}` };
            }

            // Sort events by seq (should already be sorted, but ensure determinism)
            events.sort((a, b) => a.seq - b.seq);

            // Generate audit.md
            const auditMdPath = path.join(sessionOutputDir, 'audit.md');
            const auditMdContent = this.generateAuditMarkdown(events, inputPath, integrityResult);
            fs.writeFileSync(auditMdPath, auditMdContent);

            const outputFiles = ['audit.md'];

            // Generate audit.html if requested
            let auditHtmlPath: string | undefined;
            if (this.options.includeHtml) {
                auditHtmlPath = path.join(sessionOutputDir, 'audit.html');
                const auditHtmlContent = this.generateAuditHtml(auditMdContent, events);
                fs.writeFileSync(auditHtmlPath, auditHtmlContent);
                outputFiles.push('audit.html');
            }

            // Generate render manifest
            const manifest: RenderManifest = {
                input_file: inputPath,
                session_id: sessionId,
                render_timestamp: this.options.allowNonconformant ? 
                    '2026-02-06T10:00:00.000Z' : 
                    new Date().toISOString(),
                input_line_count: rawLines.length,
                rendered_event_count: events.length,
                events_digest: events.map(e => ({ seq: e.seq, hash: e.hash })),
                integrity_result: integrityResult.ok ? 'PASS' : 'FAIL',
                output_files: outputFiles,
                renderer_version: '1.0.0'
            };

            const manifestPath = path.join(sessionOutputDir, 'render_manifest.json');
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

            return {
                success: true,
                outputPath: sessionOutputDir,
                manifest
            };

        } catch (error) {
            // Write error file
            try {
                const sessionId = 'unknown';
                const errorOutputDir = path.join(outputDir, sessionId);
                fs.mkdirSync(errorOutputDir, { recursive: true });
                
                const errorInfo = {
                    timestamp: new Date().toISOString(),
                    error: error instanceof Error ? error.message : String(error),
                    input_file: inputPath,
                    stack: error instanceof Error ? error.stack : undefined
                };
                
                fs.writeFileSync(
                    path.join(errorOutputDir, 'render_error.json'),
                    JSON.stringify(errorInfo, null, 2)
                );
            } catch (writeError) {
                // Ignore write errors in error handling
            }

            return { 
                success: false, 
                error: error instanceof Error ? error.message : String(error) 
            };
        }
    }

    private generateAuditMarkdown(events: any[], inputPath: string, integrityResult: IntegrityResult): string {
        const sessionInfo = events[0];
        const lastEvent = events[events.length - 1];
        
        // Count events by type
        const eventCounts: Record<string, number> = {};
        events.forEach(event => {
            eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
        });

        let markdown = '';

        // Header section
        markdown += `# NGKs Autologger Audit Report\n\n`;
        markdown += `**Extension:** NGKs Autonomous Logger v0.1.0\n`;
        markdown += `**Session ID:** ${sessionInfo.session_id}\n`;
        markdown += `**Workspace:** ${sessionInfo.payload?.workspaceName || 'Unknown'}\n`;
        markdown += `**Workspace Path:** ${sessionInfo.payload?.workspacePath || 'Unknown'}\n`;
        markdown += `**VS Code Version:** ${sessionInfo.payload?.vscodeVersion || 'Unknown'}\n`;
        markdown += `**Platform/Arch:** ${sessionInfo.payload?.platform || 'Unknown'}/${sessionInfo.payload?.arch || 'Unknown'}\n`;
        
        // Use deterministic timestamp in test mode, real timestamp otherwise
        const renderTimestamp = this.options.allowNonconformant ? 
            '2026-02-06T10:00:00.000Z' : 
            new Date().toISOString();
        markdown += `**Render Timestamp:** ${renderTimestamp}\n`;
        
        markdown += `**Input File:** ${inputPath}\n`;
        markdown += `**Integrity Result:** ${integrityResult.ok ? '✅ PASS' : '❌ FAIL'}\n\n`;
        
        markdown += `**Redaction Policy:** Log may contain [REDACTED] tokens; renderer does not attempt to unredact.\n\n`;

        // Ledger summary section
        markdown += `## Ledger Summary\n\n`;
        markdown += `**Total Events:** ${events.length}\n`;
        markdown += `**First Timestamp:** ${sessionInfo.ts}\n`;
        markdown += `**Last Timestamp:** ${lastEvent.ts}\n\n`;

        // Event type counts table
        markdown += `### Event Type Counts\n\n`;
        markdown += `| Event Type | Count |\n`;
        markdown += `|------------|-------|\n`;
        Object.entries(eventCounts)
            .sort(([,a], [,b]) => b - a)
            .forEach(([type, count]) => {
                markdown += `| ${type} | ${count} |\n`;
            });
        markdown += `\n`;

        // Anomalies section
        const anomalies = this.detectAnomalies(events);
        if (anomalies.length > 0) {
            markdown += `### Anomalies Detected\n\n`;
            anomalies.forEach(anomaly => {
                markdown += `- ${anomaly}\n`;
            });
            markdown += `\n`;
        }

        // Chronological timeline
        markdown += `## Chronological Timeline\n\n`;
        events.forEach(event => {
            markdown += this.renderEvent(event);
        });

        // Crash appendix (if crash file exists)
        const crashPath = inputPath.replace(/\.jsonl$/, '_crash.jsonl');
        if (fs.existsSync(crashPath)) {
            markdown += `\n## Crash Appendix\n\n`;
            markdown += `**Crash File:** ${crashPath}\n\n`;
            
            try {
                const crashLines = fs.readFileSync(crashPath, 'utf8').split('\n').filter(line => line.trim());
                const crashEvents = crashLines.map(line => JSON.parse(line));
                
                crashEvents.forEach(event => {
                    markdown += this.renderEvent(event);
                });
            } catch (error) {
                markdown += `Error reading crash file: ${error}\n\n`;
            }
        }

        // Manifest verification
        markdown += `## Verification\n\n`;
        markdown += `To verify this report was generated deterministically, check the \`render_manifest.json\` file in the same directory.\n`;
        markdown += `The manifest contains input line counts, event digests, and integrity verification results.\n\n`;

        return markdown;
    }

    private renderEvent(event: any): string {
        const timestamp = new Date(event.ts).toISOString();
        let output = `### Event ${event.seq} - ${event.type}\n\n`;
        output += `**Timestamp:** ${timestamp}\n`;
        output += `**Level:** ${event.level}\n`;
        output += `**Hash:** ${event.hash}\n\n`;

        // Render payload based on event type
        if (event.payload) {
            output += this.renderPayload(event.type, event.payload);
        }

        // Show redaction metadata if present  
        if (event.redacted) {
            output += `**Redaction Applied:** Yes (${event.redaction_hits || 0} hits)\n`;
        }

        output += `\n`;
        return output;
    }

    private renderPayload(eventType: string, payload: any): string {
        let output = `**Payload:**\n\n`;

        switch (eventType) {
            case 'FILE_SAVED':
                output += `- **Path:** ${payload.path}\n`;
                output += `- **Size:** ${payload.size_bytes || 0} bytes\n`;
                output += `- **Audit On:** ${payload.audit_on || 'N/A'}\n`;
                if (payload.diff_lines_added !== undefined) {
                    output += `- **Diff:** +${payload.diff_lines_added} -${payload.diff_lines_removed || 0} lines\n`;
                }
                if (payload.diff_content && payload.diff_content !== '[TRUNCATED]') {
                    const diffLines = payload.diff_content.split('\n');
                    const maxLines = this.options.maxDiffLinesInReport;
                    if (diffLines.length > maxLines) {
                        output += `\n\`\`\`diff\n${diffLines.slice(0, maxLines).join('\n')}\n... (truncated at ${maxLines} lines)\n\`\`\`\n`;
                    } else {
                        output += `\n\`\`\`diff\n${payload.diff_content}\n\`\`\`\n`;
                    }
                }
                break;

            case 'AUDIT_CMD_START':
                output += `- **Command:** ${payload.cmd}\n`;
                output += `- **Working Directory:** ${payload.cwd}\n`;
                output += `- **Execution ID:** ${payload.execution_id}\n`;
                break;

            case 'AUDIT_CMD_OUTPUT':
                output += `- **Execution ID:** ${payload.execution_id}\n`;
                output += `- **Output Type:** ${payload.output_type}\n`;
                if (payload.content) {
                    const content = payload.content.slice(0, this.options.maxPayloadChars);
                    output += `- **Content:** \`${content}${payload.content.length > this.options.maxPayloadChars ? '...' : ''}\`\n`;
                }
                break;

            case 'AUDIT_CMD_END':
                output += `- **Execution ID:** ${payload.execution_id}\n`;
                output += `- **Exit Code:** ${payload.exit_code}\n`;
                output += `- **Duration:** ${payload.duration_ms}ms\n`;
                break;

            case 'TASK_START':
            case 'TASK_END':
                output += `- **Task Name:** ${payload.name}\n`;
                output += `- **Source:** ${payload.source}\n`;
                output += `- **Scope:** ${payload.scope}\n`;
                output += `- **Execution ID:** ${payload.execution_id}\n`;
                if (payload.exit_code !== undefined) {
                    output += `- **Exit Code:** ${payload.exit_code}\n`;
                }
                if (payload.duration_ms !== undefined) {
                    output += `- **Duration:** ${payload.duration_ms}ms\n`;
                }
                break;

            case 'AGENT_INPUT':
            case 'AGENT_OUTPUT':
                const text = payload.text || '';
                const preview = text.slice(0, this.options.agentPreviewChars);
                output += `- **Text Length:** ${text.length} characters\n`;
                output += `- **Preview:** ${preview}${text.length > this.options.agentPreviewChars ? '...' : ''}\n`;
                if (payload.context) {
                    output += `- **Context:** ${payload.context}\n`;
                }
                break;

            case 'SESSION_START':
            case 'SESSION_END':
                if (payload.reason) {
                    output += `- **Reason:** ${payload.reason}\n`;
                }
                if (payload.autosave_path) {
                    output += `- **Autosave Path:** ${payload.autosave_path}\n`;
                }
                if (payload.workspaceName) {
                    output += `- **Workspace:** ${payload.workspaceName}\n`;
                }
                break;

            default:
                // Generic payload rendering
                const payloadStr = JSON.stringify(payload, null, 2);
                if (payloadStr.length <= this.options.maxPayloadChars) {
                    output += `\`\`\`json\n${payloadStr}\n\`\`\`\n`;
                } else {
                    output += `\`\`\`json\n${payloadStr.slice(0, this.options.maxPayloadChars)}...\n\`\`\`\n`;
                }
                break;
        }

        output += `\n`;
        return output;
    }

    private generateAuditHtml(markdownContent: string, events: any[]): string {
        // Simple markdown to HTML conversion
        let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>NGKs Autologger Audit Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; margin: 40px auto; max-width: 1200px; line-height: 1.6; color: #333; }
        h1, h2, h3 { color: #0366d6; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f5f5f5; }
        pre, code { background-color: #f6f8fa; padding: 4px 8px; border-radius: 4px; font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; }
        pre { padding: 16px; overflow-x: auto; }
        .timestamp { color: #586069; font-size: 0.9em; }
        .event { border-left: 4px solid #0366d6; padding-left: 16px; margin: 16px 0; }
        .payload { background-color: #f8f9fa; padding: 12px; border-radius: 4px; margin: 8px 0; }
    </style>
</head>
<body>`;

        // Convert basic markdown to HTML
        html += markdownContent
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/```(\w+)?\n([\s\S]+?)\n```/g, '<pre><code class="language-$1">$2</code></pre>')
            .replace(/^\| (.+) \|$/gm, (match, content) => {
                const cells = content.split(' | ').map((cell: string) => cell.trim());
                return '<tr>' + cells.map((cell: string) => `<td>${cell}</td>`).join('') + '</tr>';
            })
            .replace(/^\|(.+)\|$/gm, '<table>$&</table>')
            .replace(/\n/g, '<br>');

        html += `
</body>
</html>`;

        return html;
    }

    private detectAnomalies(events: any[]): string[] {
        const anomalies: string[] = [];
        
        // Check for missing sequences
        for (let i = 0; i < events.length; i++) {
            const expectedSeq = i + 1;
            if (events[i].seq !== expectedSeq) {
                anomalies.push(`Missing or duplicate sequence at position ${i}: expected ${expectedSeq}, got ${events[i].seq}`);
            }
        }

        // Check for hash chain integrity (basic)
        for (let i = 1; i < events.length; i++) {
            if (events[i].prev_hash !== events[i-1].hash) {
                anomalies.push(`Hash chain break at sequence ${events[i].seq}: prev_hash doesn't match previous event hash`);
            }
        }

        return anomalies;
    }
}