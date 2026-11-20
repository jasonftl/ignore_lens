// Date: 08/01/2026
// Scans workspace files for pattern matching

import * as vscode from 'vscode';
import { opendir, realpath, stat } from 'fs/promises';
import * as path from 'path';
import { log, logTiming } from './logger';

const MINIMUM_CHECK_DEPTH = 16;
const LINK_CHECK_BUDGET_MS = 250;
const LINKED_ENTRY_BUDGET = 8192;

interface FileChange {
    path: string;
    exists: boolean;
}

interface WorkspaceScan {
    result: Promise<WorkspaceFiles>;
    cancellation: vscode.CancellationTokenSource;
    changes: FileChange[];
    progress: { report?: (message: string) => void };
}

interface Directory {
    absolutePath: string;
    prefix: string;
    parent?: Directory;
    viaLink?: string;
}

export interface ScanWarning {
    path: string;
    message: string;
}

interface WorkspaceFiles {
    files: Set<string>;
    warnings: ScanWarning[];
    fallback?: string;
}

function checkCancellation(token: vscode.CancellationToken): void {
    if (token.isCancellationRequested) {
        throw new vscode.CancellationError();
    }
}

function unavailableMessage(error: unknown): string | undefined {
    switch ((error as NodeJS.ErrnoException).code) {
        case 'ENOENT':
        case 'ENOTDIR': return 'Target unavailable';
        case 'ELOOP': return 'Symlink loop';
        case 'EACCES':
        case 'EPERM': return 'Permission denied';
        case 'UNKNOWN': return process.platform === 'win32' ? 'Target unavailable' : undefined;
        default: return undefined;
    }
}

function hasAncestor(directory: Directory | undefined, target: string): boolean {
    for (let ancestor = directory; ancestor; ancestor = ancestor.parent) {
        if (path.relative(ancestor.absolutePath, target) === '') {
            return true;
        }
    }
    return false;
}

/** Checks the tree before giving the full search to VS Code. */
async function checkSymlinks(root: string, token: vscode.CancellationToken, warnings: ScanWarning[]): Promise<string | undefined> {
    const started = performance.now();
    let level: Directory[] = [{ absolutePath: root, prefix: '' }];
    let linkedEntries = 0;
    for (let depth = 1; level.length; depth++) {
        const next: Directory[] = [];
        const pastBudget = () => depth > MINIMUM_CHECK_DEPTH && performance.now() - started >= LINK_CHECK_BUDGET_MS;
        for (const directory of level) {
            checkCancellation(token);
            if (pastBudget()) {
                return 'Symlink check did not finish';
            }
            try {
                const entries = await opendir(directory.absolutePath, { bufferSize: 256 });
                for await (const entry of entries) {
                    checkCancellation(token);
                    if (pastBudget()) {
                        return 'Symlink check did not finish';
                    }
                    if (directory.viaLink && ++linkedEntries >= LINKED_ENTRY_BUDGET) {
                        warnings.push({ path: directory.viaLink, message: 'Linked directory exceeded the pre-scan size budget' });
                        return 'Linked directory exceeded the pre-scan size budget';
                    }
                    const relative = directory.prefix + entry.name;
                    let actual = path.join(directory.absolutePath, entry.name);
                    let viaLink = directory.viaLink;
                    if (entry.isSymbolicLink()) {
                        try {
                            actual = await realpath(actual);
                            if (!(await stat(actual)).isDirectory()) {
                                continue;
                            }
                        } catch (error) {
                            const message = unavailableMessage(error);
                            if (!message) throw error;
                            warnings.push({ path: relative, message });
                            if (message === 'Symlink loop' || message === 'Permission denied') return message;
                            continue;
                        }
                        viaLink ??= relative;
                    } else if (!entry.isDirectory()) {
                        continue;
                    }
                    if (viaLink && hasAncestor(directory, actual)) {
                        warnings.push({ path: entry.isSymbolicLink() ? relative : viaLink, message: 'Symlink loop' });
                        return 'Symlink loop';
                    }
                    next.push({ absolutePath: actual, prefix: relative + '/', parent: directory, viaLink });
                }
            } catch (error) {
                const message = unavailableMessage(error);
                if (!directory.parent || !message) throw error;
                warnings.push({ path: directory.prefix.slice(0, -1), message });
                return message;
            }
        }
        level = next;
    }
    return undefined;
}

async function scanWithoutLinks(
    root: string, token: vscode.CancellationToken, result: WorkspaceFiles, report: (message: string) => void
): Promise<void> {
    const directories = [{ absolutePath: root, prefix: '' }];
    const warned = new Set(result.warnings.map(warning => warning.path));
    let nextUpdate = performance.now() + 1000 / 3;
    while (directories.length) {
        checkCancellation(token);
        const directory = directories.pop()!;
        try {
            const entries = await opendir(directory.absolutePath, { bufferSize: 256 });
            for await (const entry of entries) {
                checkCancellation(token);
                const relative = directory.prefix + entry.name;
                if (entry.isSymbolicLink()) {
                    if (!warned.has(relative)) result.warnings.push({ path: relative, message: 'Symlink target skipped' });
                } else if (entry.isDirectory()) {
                    directories.push({ absolutePath: path.join(directory.absolutePath, entry.name), prefix: relative + '/' });
                } else if (entry.isFile()) {
                    result.files.add(relative);
                }
                if (performance.now() >= nextUpdate) {
                    report('Scanning... ' + result.files.size.toLocaleString() + ' files');
                    nextUpdate = performance.now() + 1000 / 3;
                }
            }
        } catch (error) {
            const message = unavailableMessage(error);
            if (!directory.prefix || !message) throw error;
            const relative = directory.prefix.slice(0, -1);
            if (!warned.has(relative)) result.warnings.push({ path: relative, message });
        }
    }
}

/**
 * Scanner for workspace files.
 * Retrieves file lists from workspace folders for pattern matching.
 */
export class WorkspaceScanner implements vscode.Disposable {
    private readonly fileCache = new Map<string, WorkspaceFiles>();
    private readonly scans = new Map<string, WorkspaceScan>();
    private readonly workspaceFolderDisposable: vscode.Disposable;

    constructor(private readonly findFiles = vscode.workspace.findFiles) {
        this.workspaceFolderDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => this.clear());
    }

    public async getFilesInFolder(
        folder: vscode.WorkspaceFolder, fresh = false, report?: (message: string) => void
    ): Promise<WorkspaceFiles> {
        const folderKey = folder.uri.toString();
        if (fresh) this.invalidateFolder(folderKey);
        const cachedFiles = this.fileCache.get(folderKey);
        if (cachedFiles) {
            return cachedFiles;
        }

        let scan = this.scans.get(folderKey);
        if (!scan) {
            const cancellation = new vscode.CancellationTokenSource();
            const changes: FileChange[] = [];
            const progress = { report };
            const result = this.scanFolder(folder, folderKey, cancellation.token, changes, message => progress.report?.(message)).finally(() => {
                if (this.scans.get(folderKey)?.cancellation === cancellation) {
                    this.scans.delete(folderKey);
                }
                cancellation.dispose();
            });
            scan = { result, cancellation, changes, progress };
            this.scans.set(folderKey, scan);
        } else if (report) {
            scan.progress.report = report;
        }

        return scan.result;
    }

    private invalidateFolder(folderKey: string): void {
        const scan = this.scans.get(folderKey);
        this.scans.delete(folderKey);
        this.fileCache.delete(folderKey);
        scan?.cancellation.cancel();
    }

    public cancelScans(keepFolder?: vscode.WorkspaceFolder): void {
        const keepKey = keepFolder?.uri.toString();
        for (const [folderKey, scan] of this.scans) {
            if (folderKey !== keepKey) {
                this.scans.delete(folderKey);
                scan.cancellation.cancel();
            }
        }
    }

    /** Adds a newly created path to its workspace cache. */
    public async addPath(uri: vscode.Uri): Promise<boolean> {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) {
            return false;
        }

        if (!this.isTracking(folder)) {
            return false;
        }

        // Record the event before the asynchronous stat so a later delete stays authoritative.
        this.recordChange(folder, uri, true);
        let stat: vscode.FileStat;
        try {
            stat = await vscode.workspace.fs.stat(uri);
        } catch (error) {
            this.removePath(uri);
            throw error;
        }

        if ((stat.type & (vscode.FileType.Directory | vscode.FileType.SymbolicLink)) !== 0) {
            // A directory or link can introduce paths that were not in the previous scan.
            this.invalidateFolder(folder.uri.toString());
            return true;
        }

        return true;
    }

    /** Removes a deleted file or directory from its workspace cache. */
    public removePath(uri: vscode.Uri): boolean {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) {
            return false;
        }

        if (!this.isTracking(folder)) {
            return false;
        }

        this.recordChange(folder, uri, false);
        return true;
    }

    private async scanFolder(
        folder: vscode.WorkspaceFolder,
        folderKey: string,
        token: vscode.CancellationToken,
        changes: FileChange[],
        report: (message: string) => void
    ): Promise<WorkspaceFiles> {
        const startTime = Date.now();

        const result = await this.readFiles(folder, token, report);
        checkCancellation(token);

        for (const change of changes) {
            if (change.exists) {
                if (result.fallback && result.warnings.some(warning =>
                    change.path === warning.path || change.path.startsWith(warning.path + '/'))) continue;
                result.files.add(change.path);
            } else {
                this.removeFromSet(result.files, change.path);
            }
        }
        this.fileCache.set(folderKey, result);

        const duration = Date.now() - startTime;
        logTiming('Workspace scan: ' + result.files.size + ' files', duration);
        return result;
    }

    private async readFiles(
        folder: vscode.WorkspaceFolder, token: vscode.CancellationToken, report: (message: string) => void
    ): Promise<WorkspaceFiles> {
        const result: WorkspaceFiles = { files: new Set(), warnings: [] };
        const search = vscode.workspace.getConfiguration('search', folder.uri);
        // Remote SSH exposes native paths as file URIs in its workspace extension host.
        if (folder.uri.scheme === 'file' && search.get('followSymlinks', true)) {
            const root = await realpath(folder.uri.fsPath);
            result.fallback = await checkSymlinks(root, token, result.warnings);
            if (result.fallback) {
                log(result.fallback + '. Scanning without following symlinks.');
                report('Scanning without symlinks...');
                await scanWithoutLinks(root, token, result, report);
                return result;
            }
        }

        checkCancellation(token);
        report('Scanning files...');
        const pattern = new vscode.RelativePattern(folder, '**/*');
        const files = await this.findFiles(pattern, null, undefined, token);
        checkCancellation(token);
        for (const file of files) {
            result.files.add(this.relativePath(folder, file));
        }
        return result;
    }

    private recordChange(folder: vscode.WorkspaceFolder, uri: vscode.Uri, exists: boolean): void {
        const folderKey = folder.uri.toString();
        const relativePath = this.relativePath(folder, uri);
        const cachedFiles = this.fileCache.get(folderKey);

        if (cachedFiles) {
            if (cachedFiles.fallback) {
                // A rescan keeps skipped paths and warnings in sync with filesystem changes.
                this.fileCache.delete(folderKey);
            } else if (exists) {
                cachedFiles.files.add(relativePath);
            } else {
                this.removeFromSet(cachedFiles.files, relativePath);
            }
            return;
        }

        this.scans.get(folderKey)?.changes.push({ path: relativePath, exists });
    }

    private relativePath(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
        return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    }

    private isTracking(folder: vscode.WorkspaceFolder): boolean {
        const folderKey = folder.uri.toString();
        return this.fileCache.has(folderKey) || this.scans.has(folderKey);
    }

    private removeFromSet(files: Set<string>, removedPath: string): void {
        const prefix = removedPath + '/';
        for (const file of files) {
            if (file === removedPath || file.startsWith(prefix)) {
                files.delete(file);
            }
        }
    }

    private clear(): void {
        this.cancelScans();
        this.fileCache.clear();
    }

    /**
     * Disposes of the scanner.
     */
    public dispose(): void {
        this.workspaceFolderDisposable.dispose();
        this.clear();
    }
}
