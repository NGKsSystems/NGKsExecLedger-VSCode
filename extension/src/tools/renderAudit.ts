#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { AuditRenderer, RenderOptions } from '../core/auditRenderer';

interface CliArgs {
    input: string;
    output: string;
    format: string[];
    help?: boolean;
    allowNonconformant?: boolean;
}

/**
 * Parse command line arguments
 */
function parseArgs(): CliArgs {
    const args = process.argv.slice(2);
    const parsed: Partial<CliArgs> = {
        format: ['md'] // default format
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        switch (arg) {
            case '--in':
            case '-i':
                parsed.input = args[++i];
                break;
            case '--out':
            case '-o':
                parsed.output = args[++i];
                break;
            case '--format':
            case '-f':
                parsed.format = args[++i].split(',').map(f => f.trim());
                break;
            case '--help':
            case '-h':
                parsed.help = true;
                break;
            case '--allow-nonconformant':
                parsed.allowNonconformant = true;
                break;
            default:
                if (arg.startsWith('--')) {
                    console.error(`Unknown option: ${arg}`);
                    process.exit(1);
                }
                break;
        }
    }

    if (parsed.help) {
        return parsed as CliArgs;
    }

    if (!parsed.input || !parsed.output) {
        console.error('Error: --in and --out parameters are required');
        process.exit(1);
    }

    return parsed as CliArgs;
}

/**
 * Show help message
 */
function showHelp(): void {
    console.log(`
NGKs Autologger - Audit Renderer CLI

Usage: node renderAudit.js [options]

Options:
  --in, -i <path>              Input JSONL session file (required)
  --out, -o <folder>           Output directory (required)
  --format, -f <formats>       Output formats: md,html (default: md)
  --allow-nonconformant        Allow processing of non-conformant logs
  --help, -h                   Show this help message

Example:
  node renderAudit.js --in session.jsonl --out ./reports --format md,html

Output Structure:
  <output>/<session_id>/audit.md
  <output>/<session_id>/audit.html (if requested)
  <output>/<session_id>/render_manifest.json
  <output>/<session_id>/render_error.json (on failure)

The renderer performs integrity verification before rendering and will
fail if the input JSONL file does not pass verification checks.
`);
}

/**
 * Validate input file
 */
function validateInput(inputPath: string): void {
    if (!fs.existsSync(inputPath)) {
        console.error(`Error: Input file not found: ${inputPath}`);
        process.exit(1);
    }

    if (!inputPath.endsWith('.jsonl')) {
        console.error(`Warning: Input file does not have .jsonl extension: ${inputPath}`);
    }

    const stats = fs.statSync(inputPath);
    if (stats.size === 0) {
        console.error(`Error: Input file is empty: ${inputPath}`);
        process.exit(1);
    }
}

/**
 * Validate output directory
 */
function validateOutput(outputPath: string): void {
    try {
        // Ensure output directory exists
        fs.mkdirSync(outputPath, { recursive: true });
        
        // Test write permissions
        const testFile = path.join(outputPath, '.write_test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
    } catch (error) {
        console.error(`Error: Cannot write to output directory: ${outputPath}`);
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

/**
 * Validate format options
 */
function validateFormat(formats: string[]): void {
    const validFormats = ['md', 'html'];
    const invalidFormats = formats.filter(f => !validFormats.includes(f));
    
    if (invalidFormats.length > 0) {
        console.error(`Error: Invalid format(s): ${invalidFormats.join(', ')}`);
        console.error(`Valid formats: ${validFormats.join(', ')}`);
        process.exit(1);
    }
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
    const args = parseArgs();

    if (args.help) {
        showHelp();
        return;
    }

    console.log('NGKs Autologger - Audit Renderer CLI');
    console.log('===================================');

    // Validation
    console.log(`Input file: ${args.input}`);
    validateInput(args.input);

    console.log(`Output directory: ${args.output}`);
    validateOutput(args.output);

    console.log(`Formats: ${args.format.join(', ')}`);
    validateFormat(args.format);

    // Configure renderer options
    const options: RenderOptions = {
        includeHtml: args.format.includes('html'),
        maxPayloadChars: 4000,
        maxDiffLinesInReport: 200,
        agentPreviewChars: 200,
        allowNonconformant: args.allowNonconformant || false
    };

    const renderer = new AuditRenderer(options);

    console.log('\nStarting audit rendering...');
    
    try {
        const startTime = Date.now();
        const result = await renderer.renderAudit(args.input, args.output);
        const duration = Date.now() - startTime;

        if (!result.success) {
            console.error(`\n❌ Rendering failed: ${result.error}`);
            process.exit(1);
        }

        console.log(`\n✅ Rendering completed successfully in ${duration}ms`);
        console.log(`Output directory: ${result.outputPath}`);
        
        if (result.manifest) {
            console.log(`\nRender Summary:`);
            console.log(`  Session ID: ${result.manifest.session_id}`);
            console.log(`  Input lines: ${result.manifest.input_line_count}`);
            console.log(`  Rendered events: ${result.manifest.rendered_event_count}`);
            console.log(`  Integrity: ${result.manifest.integrity_result}`);
            console.log(`  Output files: ${result.manifest.output_files.join(', ')}`);
        }

        process.exit(0);

    } catch (error) {
        console.error(`\n💥 Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
        if (error instanceof Error && error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Execute main function
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});