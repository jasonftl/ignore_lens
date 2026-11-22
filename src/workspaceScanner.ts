// Date: 08/01/2026
// Scans workspace files for pattern matching

import * as vscode from 'vscode';
import { lstat } from 'fs/promises';
import * as path from 'path';
import { log, logTiming } from './logger';
import { checkCancellation, WorkspaceFiles, WorkspaceTree } from './workspaceTree';

interface FileChange {
    path: string;
    exists: boolean;
    subtree: boolean;
}

interface WorkspaceScan {
    result: Promise<WorkspaceFiles>;
    cancellation: vscode.CancellationTokenSource;
    changes: FileChange[];
    progress: { report?: (message: string) => void };
}

async function pathType(uri: vscode.Uri): Promise<{ type: vscode.FileType }> {
    if (uri.scheme !== 'file') return vscode.workspace.fs.stat(uri);
    const info = await lstat(uri.fsPath);
    if (info.isSymbolicLink()) return { type: vscode.FileType.SymbolicLink };
    if (info.isDirectory()) return { type: vscode.FileType.Directory };
    return { type: info.isFile() ? vscode.FileType.File : vscode.FileType.Unknown };
}

/**
 * Scanner for workspace files.
 * Retrieves file lists from workspace folders for pattern matching.
 */
export class WorkspaceScanner implements vscode.Disposable {
    private readonly fileCache = new Map<string, WorkspaceFiles>();
    private readonly trees = new Map<string, WorkspaceTree>();
    private readonly pendingCreates = new Map<string, symbol>();
    private readonly scans = new Map<string, WorkspaceScan>();
    private readonly workspaceFolderDisposable: vscode.Disposable;

    constructor(
        private readonly findFiles = vscode.workspace.findFiles,
        private readonly statPath = pathType
    ) {
        this.workspaceFolderDisposable = vscode.workspace.onDidChangeWorkspaceFolders(({ removed }) => {
            for (const folder of removed) {
                const key = folder.uri.toString();
                this.invalidateFolder(key);
                this.trees.delete(key);
                for (const uri of this.pendingCreates.keys()) {
                    if (uri.startsWith(key + '/')) this.pendingCreates.delete(uri);
                }
            }
        });
    }

    public async getFilesInFolder(
        folder: vscode.WorkspaceFolder, report?: (message: string) => void
    ): Promise<WorkspaceFiles> {
        const folderKey = folder.uri.toString();
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

    public cancelScans(): void {
        for (const scan of this.scans.values()) scan.cancellation.cancel();
        this.scans.clear();
    }

    /** Inspect new paths and detect links replaced in place. */
    public async addPath(uri: vscode.Uri, contentChange = false): Promise<'file' | 'rescan' | undefined> {
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder || !this.isTracking(folder)) return;

        const tree = this.trees.get(folder.uri.toString());
        if (contentChange && !tree) return;
        const relative = this.relativePath(folder, uri);
        const key = uri.toString();
        if (this.pendingCreates.has(key)) contentChange = false;
        const event = Symbol();
        this.pendingCreates.set(key, event);
        try {
            const stat = await this.statPath(uri);
            if (this.pendingCreates.get(key) !== event) return;

            const structural = (stat.type & (vscode.FileType.Directory | vscode.FileType.SymbolicLink)) !== 0
                || tree?.isDirectoryOrLink(relative);
            if (structural) {
                this.recordChange(folder, uri, true, true);
                return 'rescan';
            }
            if (contentChange || stat.type !== vscode.FileType.File) return;

            this.recordChange(folder, uri, true);
            return tree?.links.size ? 'rescan' : 'file';
        } catch (error) {
            if (this.pendingCreates.get(key) !== event) return;
            this.recordChange(folder, uri, false, tree?.isDirectoryOrLink(relative));
            throw error;
        } finally {
            if (this.pendingCreates.get(key) === event) this.pendingCreates.delete(key);
        }
    }

    /** Removes a deleted file or directory from its workspace cache. */
    public removePath(uri: vscode.Uri): boolean {
        const key = uri.toString();
        this.pendingCreates.delete(key);
        const folder = vscode.workspace.getWorkspaceFolder(uri);
        if (!folder) {
            return false;
        }

        if (!this.isTracking(folder)) {
            return false;
        }

        const cached = this.fileCache.get(folder.uri.toString());
        const subtree = !cached?.files.has(this.relativePath(folder, uri));
        if (subtree) {
            const prefix = key + '/';
            for (const pending of this.pendingCreates.keys()) {
                if (pending.startsWith(prefix)) this.pendingCreates.delete(pending);
            }
        }
        this.recordChange(folder, uri, false, subtree);
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

        const search = vscode.workspace.getConfiguration('search', folder.uri);
        let result: WorkspaceFiles;
        // Remote SSH also exposes native paths as file URIs in its workspace extension host.
        if (folder.uri.scheme === 'file' && search.get('followSymlinks', true)) {
            const tree = this.trees.get(folderKey) ?? new WorkspaceTree(folder.uri.fsPath);
            this.trees.set(folderKey, tree);
            // Directory reads can overlap watcher events. Replay with the changed listings.
            do {
                changes.length = 0;
                result = await tree.scan(token, report);
                for (const change of changes) tree.changed(change.path, change.subtree);
            } while (!changes.every(change => this.updateFiles(tree, result, change)));
        } else {
            report('Scanning files...');
            const pattern = new vscode.RelativePattern(folder, '**/*');
            const files = await this.findFiles(pattern, null, undefined, token);
            result = { files: new Set(files.map(file => this.relativePath(folder, file))), warnings: [] };
            for (const change of changes) {
                if (change.exists) result.files.add(change.path);
                else this.removeFromResult(result, change.path);
            }
        }
        checkCancellation(token);
        this.fileCache.set(folderKey, result);
        for (const warning of result.warnings) {
            if (warning.message !== 'Symlink loop') log(warning.message + ': ' + warning.path);
        }

        const duration = Date.now() - startTime;
        logTiming('Workspace scan: ' + result.files.size + ' files', duration);
        return result;
    }

    private recordChange(folder: vscode.WorkspaceFolder, uri: vscode.Uri, exists: boolean, subtree = false): void {
        const key = folder.uri.toString();
        const relative = this.relativePath(folder, uri);
        const tree = this.trees.get(key);
        tree?.changed(relative, subtree);
        if (subtree && !tree && exists) {
            this.invalidateFolder(key);
            return;
        }
        const cached = this.fileCache.get(key);
        if (cached) {
            if (tree) {
                if (!this.updateFiles(tree, cached, { path: relative, exists, subtree })) this.fileCache.delete(key);
            } else if (exists) {
                cached.files.add(relative);
            } else {
                this.removeFromResult(cached, relative);
            }
        } else {
            this.scans.get(key)?.changes.push({ path: relative, exists, subtree });
        }
    }

    private updateFiles(tree: WorkspaceTree, cached: WorkspaceFiles, change: FileChange): boolean {
        if (change.subtree && !change.exists && !tree.links.size && !cached.warnings.length) {
            this.removeFromResult(cached, change.path);
            return true;
        }
        if (change.subtree || tree.links.has(change.path)) return false;
        const paths = tree.filePaths(change.path);
        if (!paths) return false;
        for (const file of paths) {
            if (change.exists) cached.files.add(file);
            else cached.files.delete(file);
        }
        return true;
    }

    private relativePath(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
        return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    }

    private isTracking(folder: vscode.WorkspaceFolder): boolean {
        const folderKey = folder.uri.toString();
        return this.fileCache.has(folderKey) || this.scans.has(folderKey) || this.trees.has(folderKey);
    }

    private removeFromResult(result: WorkspaceFiles, removedPath: string): void {
        const prefix = removedPath + '/';
        if (!result.files.delete(removedPath)) {
            for (const file of result.files) {
                if (file.startsWith(prefix)) result.files.delete(file);
            }
        }
        result.warnings = result.warnings.filter(warning => warning.path !== removedPath && !warning.path.startsWith(prefix));
    }

    public invalidate(): void {
        this.cancelScans();
        this.fileCache.clear();
        this.trees.clear();
        this.pendingCreates.clear();
    }

    /**
     * Disposes of the scanner.
     */
    public dispose(): void {
        this.workspaceFolderDisposable.dispose();
        this.invalidate();
    }
}
