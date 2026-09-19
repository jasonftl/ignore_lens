// Date: 08/01/2026
// Scans workspace files for pattern matching

import * as vscode from 'vscode';
import * as path from 'path';
import { getLogger } from './logger';

/**
 * Scanner for workspace files.
 * Retrieves file lists from workspace folders for pattern matching.
 */
export class WorkspaceScanner implements vscode.Disposable {
    private readonly fileCache = new Map<string, Set<string>>();
    private readonly scans = new Map<string, Promise<Set<string>>>();
    private readonly pendingChanges = new Map<string, Array<{ path: string; exists: boolean }>>();
    private readonly workspaceFolderDisposable: vscode.Disposable;
    private generation = 0;

    constructor() {
        this.workspaceFolderDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => this.clear());
    }

    /**
     * Retrieves all files in a specific workspace folder.
     * Files are returned as relative paths from the folder root with forward slashes.
     *
     * @param folder - The workspace folder to scan
     * @returns Array of relative file paths
     */
    public async getFilesInFolder(folder: vscode.WorkspaceFolder): Promise<string[]> {
        const folderKey = folder.uri.toString();
        const cachedFiles = this.fileCache.get(folderKey);
        if (cachedFiles) {
            return Array.from(cachedFiles);
        }

        const scanKey = String(this.generation) + ':' + folderKey;
        let scan = this.scans.get(scanKey);
        if (!scan) {
            scan = this.scanFolder(folder, folderKey, scanKey, this.generation)
                .finally(() => this.scans.delete(scanKey));
            this.scans.set(scanKey, scan);
        }

        return Array.from(await scan);
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
            this.recordChange(folder, uri, false);
            throw error;
        }

        if ((stat.type & vscode.FileType.Directory) !== 0) {
            // A directory rename may emit only one create event, so rescan its files.
            this.clear();
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
        scanKey: string,
        generation: number
    ): Promise<Set<string>> {
        const logger = getLogger();
        const startTime = Date.now();

        // Use VS Code's findFiles API with null exclude to include all files
        // (including node_modules, .git, etc. that are normally excluded)
        // Note: empty string '' has undocumented behaviour; null explicitly disables excludes
        // Scope to specific folder using RelativePattern
        const pattern = new vscode.RelativePattern(folder, '**/*');
        const files = await vscode.workspace.findFiles(pattern, null);
        const allFiles = new Set<string>();

        for (const file of files) {
            allFiles.add(this.relativePath(folder, file));
        }

        for (const change of this.pendingChanges.get(scanKey) ?? []) {
            if (change.exists) {
                allFiles.add(change.path);
            } else {
                this.removeFromSet(allFiles, change.path);
            }
        }
        this.pendingChanges.delete(scanKey);

        if (generation === this.generation) {
            this.fileCache.set(folderKey, allFiles);
        }

        const duration = Date.now() - startTime;
        logger.logTiming('Workspace scan: ' + allFiles.size + ' files', duration);
        return allFiles;
    }

    private recordChange(folder: vscode.WorkspaceFolder, uri: vscode.Uri, exists: boolean): void {
        const folderKey = folder.uri.toString();
        const relativePath = this.relativePath(folder, uri);
        const cachedFiles = this.fileCache.get(folderKey);

        if (cachedFiles) {
            if (exists) {
                cachedFiles.add(relativePath);
            } else {
                this.removeFromSet(cachedFiles, relativePath);
            }
            return;
        }

        const scanKey = String(this.generation) + ':' + folderKey;
        const changes = this.pendingChanges.get(scanKey) ?? [];
        changes.push({ path: relativePath, exists });
        this.pendingChanges.set(scanKey, changes);
    }

    private relativePath(folder: vscode.WorkspaceFolder, uri: vscode.Uri): string {
        return path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/');
    }

    private isTracking(folder: vscode.WorkspaceFolder): boolean {
        const folderKey = folder.uri.toString();
        return this.fileCache.has(folderKey) || this.scans.has(String(this.generation) + ':' + folderKey);
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
        this.generation = this.generation + 1;
        this.fileCache.clear();
        this.scans.clear();
        this.pendingChanges.clear();
    }

    /**
     * Disposes of the scanner.
     */
    public dispose(): void {
        this.workspaceFolderDisposable.dispose();
        this.fileCache.clear();
        this.scans.clear();
        this.pendingChanges.clear();
    }
}
