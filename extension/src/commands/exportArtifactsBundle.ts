import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { createHash } from 'crypto';
const archiver = require('archiver');
import { SessionManager } from '../core/sessionManager';
import { findLatestSession } from '../core/latestSession';

type artifactsSourceType = 'active' | 'latest' | 'picked';

interface artifactsSource {
    type: artifactsSourceType | 'pick';
    sessionId?: string;
    sessionPath?: string;
}

interface ActiveSessionPointer {
    sessionId: string;
    sessionPath: string;
    status: 'active' | 'stopped';
}

const ORDERED_FILES = [
    'baseline.json',
    'changes.log',
    'session_summary.json',
    'changed_files.md'
];

const CHAIN_GENESIS = 'GENESIS';

const FORBIDDEN_MARKERS = [
    `${path.sep}.ngkssys${path.sep}watch${path.sep}`,
    `${path.sep}.ngkssys${path.sep}watcher_health.json`,
    `${path.sep}.ngkssys${path.sep}watch${path.sep}events.log`,
    `${path.sep}.tmp_`
];

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
        const keys = Object.keys(value as Record<string, unknown>).sort();
        const items = keys.map(key => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
        return `{${items.join(',')}}`;
    }
    return JSON.stringify(value);
}

function computeLineHash(prevHash: string, eventWithoutLineHash: Record<string, unknown>): string {
    const canonical = stableStringify(eventWithoutLineHash);
    const payload = `${prevHash}\n${canonical}`;
    return createHash('sha256').update(payload).digest('hex');
}

function computeChainFromFile(filePath: string): { valid: boolean; headHash: string } {
    if (!fs.existsSync(filePath)) {
        return { valid: true, headHash: CHAIN_GENESIS };
    }

    const lines = fs.readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter(line => line.trim());

    let prevHash = CHAIN_GENESIS;
    let valid = true;
    let lastHash = CHAIN_GENESIS;

    for (const rawLine of lines) {
        let parsed: Record<string, unknown> | null = null;
        try {
            parsed = JSON.parse(rawLine) as Record<string, unknown>;
        } catch {
            valid = false;
            continue;
        }

        const eventPrev = typeof parsed.prevHash === 'string' ? parsed.prevHash : undefined;
        const lineHash = typeof parsed.lineHash === 'string' ? parsed.lineHash : undefined;

        if (!eventPrev || !lineHash) {
            valid = false;
            continue;
        }

        const eventWithoutLineHash: Record<string, unknown> = { ...parsed };
        delete (eventWithoutLineHash as { lineHash?: string }).lineHash;

        const expected = computeLineHash(eventPrev, eventWithoutLineHash);
        if (eventPrev !== prevHash || expected !== lineHash) {
            valid = false;
        }

        prevHash = lineHash;
        lastHash = lineHash;
    }

    return { valid, headHash: lastHash };
}

function getTempPath(filePath: string): string {
    return `${filePath}.tmp`;
}

function atomicWriteFile(filePath: string, content: string): void {
    const dir = path.dirname(filePath);
    fs.mkdirSync(dir, { recursive: true });

    const tempPath = getTempPath(filePath);
    fs.writeFileSync(tempPath, content, 'utf-8');

    try {
        fs.renameSync(tempPath, filePath);
    } catch {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        fs.renameSync(tempPath, filePath);
    }
}

function readActiveSessionPointer(workspaceRoot: string): ActiveSessionPointer | null {
    const pointerPath = path.join(workspaceRoot, '.ngkssys', 'active_session.json');
    if (!fs.existsSync(pointerPath)) {
        return null;
    }

    try {
        const data = JSON.parse(fs.readFileSync(pointerPath, 'utf-8')) as ActiveSessionPointer;
        if (!data.sessionId || !data.sessionPath || !data.status) {
            return null;
        }
        if (data.status !== 'active' && data.status !== 'stopped') {
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

function getOrderedSessionFiles(sessionPath: string): string[] {
    return ORDERED_FILES.filter(fileName => fs.existsSync(path.join(sessionPath, fileName)));
}

function sha256File(filePath: string): string {
    const content = fs.readFileSync(filePath);
    return createHash('sha256').update(content).digest('hex');
}

function readSessionTimes(sessionPath: string): { startedAt: string; stoppedAt: string } {
    const sessionJsonPath = path.join(sessionPath, 'session.json');
    if (!fs.existsSync(sessionJsonPath)) {
        return { startedAt: '', stoppedAt: '' };
    }

    try {
        const sessionData = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf-8')) as {
            startedAt?: string;
            stoppedAt?: string;
        };
        return {
            startedAt: sessionData.startedAt ?? '',
            stoppedAt: sessionData.stoppedAt ?? ''
        };
    } catch {
        return { startedAt: '', stoppedAt: '' };
    }
}

function ensureNoForbiddenArtifacts(sessionPath: string): void {
    if (sessionPath.includes('.tmp_')) {
        throw new Error('NGKs ExecLedger: Export blocked (forbidden temp workspace)');
    }

    const queue: string[] = [sessionPath];

    while (queue.length > 0) {
        const current = queue.pop() as string;
        const stat = fs.statSync(current);

        if (stat.isDirectory()) {
            const entries = fs.readdirSync(current);
            for (const entry of entries) {
                queue.push(path.join(current, entry));
            }
            continue;
        }

        const fullPath = current;
        if (FORBIDDEN_MARKERS.some(marker => fullPath.includes(marker))) {
            throw new Error('NGKs ExecLedger: Export blocked (forbidden artifact detected)');
        }

        const baseName = path.basename(fullPath);
        if (baseName === 'watcher_health.json' || baseName === 'events.log') {
            throw new Error('NGKs ExecLedger: Export blocked (forbidden artifact detected)');
        }
    }
}

async function createDeterministicartifactsZip(options: {
    workspaceRoot: string;
    sessionPath: string;
    sessionId: string;
    source: artifactsSourceType;
    outputPath: string;
}): Promise<void> {
    ensureNoForbiddenArtifacts(options.sessionPath);

    const fileList = getOrderedSessionFiles(options.sessionPath);
    if (fileList.length === 0) {
        throw new Error('NGKs ExecLedger: No artifact files found in session');
    }

    const { startedAt, stoppedAt } = readSessionTimes(options.sessionPath);
    const sha256ByFile: Record<string, string> = {};

    for (const fileName of fileList) {
        const fullPath = path.join(options.sessionPath, fileName);
        sha256ByFile[fileName] = sha256File(fullPath);
    }

    const summaryPath = path.join(options.sessionPath, 'session_summary.json');
    let expectedHeadHash = CHAIN_GENESIS;
    let filesChanged = false;

    if (fs.existsSync(summaryPath)) {
        try {
            const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as { changesLogHeadHash?: string; filesChanged?: boolean };
            if (summaryData.changesLogHeadHash) {
                expectedHeadHash = summaryData.changesLogHeadHash;
            }
            filesChanged = summaryData.filesChanged === true;
        } catch {
            expectedHeadHash = CHAIN_GENESIS;
        }
    }

    const changesLogPath = path.join(options.sessionPath, 'changes.log');
    const chainResult = computeChainFromFile(changesLogPath);
    const computedHeadHash = chainResult.headHash;
    const changesLogVerified = chainResult.valid && computedHeadHash === expectedHeadHash;

    const manifest = {
        sessionId: options.sessionId,
        source: options.source,
        startedAt,
        stoppedAt,
        fileList,
        sha256ByFile,
        changesLogChained: true,
        changesLogExpectedHeadHash: expectedHeadHash,
        changesLogComputedHeadHash: computedHeadHash,
        changesLogVerified
    };

    const sessionPathRelative = path.relative(options.workspaceRoot, options.sessionPath).replace(/\\/g, '/');
    const exportedAt = stoppedAt || startedAt || '';

    const legacyManifest = {
        exportedAt,
        sourceSelected: options.source,
        sessionId: options.sessionId,
        sessionPathRelative,
        filesIncluded: [...fileList, 'artifacts_MANIFEST.json'],
        filesChanged
    };

    const exportDir = path.dirname(options.outputPath);
    const canonicalPath = path.join(exportDir, `manifest_${options.sessionId}.json`);
    const legacyPath = path.join(exportDir, `artifacts_MANIFEST_${options.sessionId}.json`);

    atomicWriteFile(canonicalPath, stableStringify(manifest));
    atomicWriteFile(legacyPath, JSON.stringify(legacyManifest, null, 2));

    const fixedDate = new Date(0);
    const fixedMode = 0o100644;

    await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(options.outputPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err: Error) => reject(err));

        archive.pipe(output);

        const manifestBuffer = fs.readFileSync(canonicalPath);
        archive.append(manifestBuffer, { name: 'manifest.json', date: fixedDate, mode: fixedMode });

        for (const fileName of fileList) {
            const fullPath = path.join(options.sessionPath, fileName);
            const content = fs.readFileSync(fullPath);
            archive.append(content, { name: fileName, date: fixedDate, mode: fixedMode });
        }

        const legacyBuffer = fs.readFileSync(legacyPath);
        archive.append(legacyBuffer, { name: 'artifacts_MANIFEST.json', date: fixedDate, mode: fixedMode });

        archive.finalize();
    });

    if (fs.existsSync(canonicalPath)) {
        fs.unlinkSync(canonicalPath);
    }
    if (fs.existsSync(legacyPath)) {
        fs.unlinkSync(legacyPath);
    }
}

export async function exportartifactsBundleCommand(sessionManager: SessionManager): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('NGKs ExecLedger: No workspace folder found');
        return;
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;
    
    // Get default source from config
    const config = vscode.workspace.getConfiguration('ngksExecLedger');
    const defaultSource = config.get<'active' | 'latest'>('defaultartifactsSource', 'active');
    
    // Check what's available
    const activePointer = readActiveSessionPointer(workspaceRoot);
    const activeSession = activePointer && activePointer.status === 'active' ? activePointer : null;
    const latestSessionResult = findLatestSession(workspaceRoot);
    const latestSession = latestSessionResult.found ? latestSessionResult : null;
    
    // Build options
    const options: vscode.QuickPickItem[] = [];
    
    options.push({
        label: '$(play) Active session (currently running)',
        description: activeSession ? activeSession.sessionId : 'none',
        detail: 'Export the currently running session',
        picked: defaultSource === 'active'
    });
    
    if (latestSession) {
        options.push({
            label: '$(history) Latest completed session on disk',
            description: latestSession.sessionId,
            detail: 'Export the most recent completed session',
            picked: defaultSource === 'latest' && !activeSession
        });
    }
    
    options.push({
        label: '$(folder-opened) Pick a session folder…',
        description: 'Browse sessions directory',
        detail: 'Select a specific session folder to export'
    });
    
    const selection = await vscode.window.showQuickPick(options, {
        title: 'Select artifacts source',
        placeHolder: 'Select artifacts source:'
    });
    
    if (!selection) {
        return; // User cancelled
    }
    
    let artifactsSource: artifactsSource;
    
    if (selection.label.includes('Active session')) {
        if (!activeSession) {
            vscode.window.showErrorMessage('No active session.');
            return;
        }
        artifactsSource = {
            type: 'active',
            sessionId: activeSession.sessionId,
            sessionPath: activeSession.sessionPath
        };
    } else if (selection.label.includes('Latest completed session')) {
        if (!latestSession) {
            vscode.window.showErrorMessage('NGKs ExecLedger: No completed sessions found');
            return;
        }
        artifactsSource = {
            type: 'latest',
            sessionId: latestSession.sessionId,
            sessionPath: latestSession.sessionDir
        };
    } else {
        // Pick session folder
        const sessionsDir = path.join(workspaceRoot, '.ngkssys', 'sessions');
        if (!fs.existsSync(sessionsDir)) {
            vscode.window.showErrorMessage('NGKs ExecLedger: No sessions directory found');
            return;
        }
        
        const pickedFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            defaultUri: vscode.Uri.file(sessionsDir),
            title: 'Select session folder'
        });
        
        if (!pickedFolder || pickedFolder.length === 0) {
            return; // User cancelled
        }
        
        const selectedPath = pickedFolder[0].fsPath;
        const requiredFiles = [
            'baseline.json',
            'changes.log',
            'session_summary.json',
            'changed_files.md'
        ];
        const missingRequired = requiredFiles.some(fileName => !fs.existsSync(path.join(selectedPath, fileName)));
        if (missingRequired) {
            vscode.window.showErrorMessage('NGKs ExecLedger: Invalid session folder');
            return;
        }

        const sessionId = path.basename(selectedPath);
        
        artifactsSource = {
            type: 'pick',
            sessionId: sessionId,
            sessionPath: selectedPath
        };
    }
    
    await createartifactsBundle(workspaceRoot, artifactsSource);
}

async function createartifactsBundle(workspaceRoot: string, artifactsSource: artifactsSource): Promise<void> {
    if (!artifactsSource.sessionPath || !artifactsSource.sessionId) {
        vscode.window.showErrorMessage('NGKs ExecLedger: Invalid session source');
        return;
    }
    
    try {
        // Create exports directory
        const exportsDir = path.join(workspaceRoot, '.ngkssys', 'exports');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }
        
        // Generate ZIP filename
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[:-]/g, '')
            .replace(/\..+/, '')
            .replace('T', '-');
        const zipFileName = `ExecLedger_${artifactsSource.sessionId}_${timestamp}.zip`;
        const zipPath = path.join(exportsDir, zipFileName);
        
        const sourceType: artifactsSourceType = artifactsSource.type === 'pick' ? 'picked' : artifactsSource.type;

        // Create ZIP archive
        await createDeterministicartifactsZip({
            workspaceRoot,
            sessionPath: artifactsSource.sessionPath,
            sessionId: artifactsSource.sessionId,
            source: sourceType,
            outputPath: zipPath
        });
        
        // Copy to Downloads if possible
        const downloadsCopyPath = await copyToDownloads(zipPath, zipFileName);
        
        // Open folder containing ZIP
        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(zipPath));
        
        const downloadsMsg = downloadsCopyPath ? ` and copied to Downloads` : '';
        vscode.window.showInformationMessage(
            `NGKs ExecLedger: artifacts bundle exported to ${zipFileName}${downloadsMsg}`
        );
        
    } catch (error) {
        vscode.window.showErrorMessage(`NGKs ExecLedger: Export failed - ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function copyToDownloads(zipPath: string, zipFileName: string): Promise<string | null> {
    try {
        const downloadsDir = path.join(os.homedir(), 'Downloads', 'NGKsLogs', 'ExecLedger');
        
        if (!fs.existsSync(downloadsDir)) {
            fs.mkdirSync(downloadsDir, { recursive: true });
        }
        
        const downloadsCopyPath = path.join(downloadsDir, zipFileName);
        fs.copyFileSync(zipPath, downloadsCopyPath);
        
        return downloadsCopyPath;
    } catch (error) {
        // Fail silently - Downloads copy is optional
        console.warn('Could not copy to Downloads:', error);
        return null;
    }
}