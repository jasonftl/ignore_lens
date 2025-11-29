// Date: 29/11/2025
// Scans workspace files and maintains a cached file list for pattern matching

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Scanner for workspace files.
 * Maintains a cached list of all files in the workspace for efficient pattern matching.
 */
export class WorkspaceScanner implements vscode.Disposable {
    private cachedFiles: string[] | null = null;
    private cacheInvalidated: boolean = true;

    /**
     * Retrieves all files in a specific workspace folder.
     * Files are returned as relative paths from the folder root with forward slashes.
     *
     * @param folder - The workspace folder to scan (if undefined, scans all folders)
     * @returns Array of relative file paths
     */
    public async getFilesInFolder(folder: vscode.WorkspaceFolder): Promise<string[]> {
        const allFiles: string[] = [];

        // Use VS Code's findFiles API with empty exclude to include all files
        // (including node_modules, .git, etc. that are normally excluded)
        // Scope to specific folder using RelativePattern
        const pattern = new vscode.RelativePattern(folder, '**/*');
        const files = await vscode.workspace.findFiles(pattern, '');

        for (const file of files) {
            const relativePath = path.relative(folder.uri.fsPath, file.fsPath);
            // Normalise path separators to forward slashes for gitignore matching
            const normalisedPath = relativePath.split(path.sep).join('/');
            allFiles.push(normalisedPath);
        }

        // Also include directories by extracting unique directory paths
        const directories = new Set<string>();

        for (const filePath of allFiles) {
            const parts = filePath.split('/');
            let currentPath = '';

            for (let i = 0; i < parts.length - 1; i = i + 1) {
                const separator = currentPath ? '/' : '';
                currentPath = currentPath + separator + parts[i];
                // Trailing slash indicates directory
                const directoryPath = currentPath + '/';
                directories.add(directoryPath);
            }
        }

        const allPaths = [...allFiles, ...Array.from(directories)];
        return allPaths;
    }

    /**
     * Retrieves all files in the workspace, using cache when available.
     * Files are returned as relative paths from the workspace root with forward slashes.
     * Note: In multi-root workspaces, prefer getFilesInFolder() for accurate results.
     *
     * @returns Array of relative file paths
     */
    public async getAllFiles(): Promise<string[]> {
        // Return cached files if cache is valid
        if (this.cachedFiles !== null && !this.cacheInvalidated) {
            return this.cachedFiles;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;

        // Return empty array if no workspace is open
        if (!workspaceFolders || workspaceFolders.length === 0) {
            this.cachedFiles = [];
            this.cacheInvalidated = false;
            return [];
        }

        const allFiles: string[] = [];

        // Use VS Code's findFiles API with empty exclude to include all files
        // (including node_modules, .git, etc. that are normally excluded)
        const files = await vscode.workspace.findFiles('**/*', '');

        for (const file of files) {
            // Convert to relative path from workspace root
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);

            if (workspaceFolder) {
                const relativePath = path.relative(workspaceFolder.uri.fsPath, file.fsPath);
                // Normalise path separators to forward slashes for gitignore matching
                const normalisedPath = relativePath.split(path.sep).join('/');
                allFiles.push(normalisedPath);
            }
        }

        // Also include directories by extracting unique directory paths
        const directories = new Set<string>();

        for (const filePath of allFiles) {
            const parts = filePath.split('/');
            let currentPath = '';

            for (let i = 0; i < parts.length - 1; i = i + 1) {
                const separator = currentPath ? '/' : '';
                currentPath = currentPath + separator + parts[i];
                // Trailing slash indicates directory
                const directoryPath = currentPath + '/';
                directories.add(directoryPath);
            }
        }

        const allPaths = [...allFiles, ...Array.from(directories)];
        this.cachedFiles = allPaths;
        this.cacheInvalidated = false;

        return allPaths;
    }

    /**
     * Invalidates the file cache, forcing a rescan on next request.
     */
    public invalidateCache(): void {
        this.cacheInvalidated = true;
    }

    /**
     * Disposes of the scanner and clears the cache.
     */
    public dispose(): void {
        this.cachedFiles = null;
    }
}
