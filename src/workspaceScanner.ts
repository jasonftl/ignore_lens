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
    /**
     * Retrieves all files in a specific workspace folder.
     * Files are returned as relative paths from the folder root with forward slashes.
     *
     * @param folder - The workspace folder to scan
     * @returns Array of relative file paths
     */
    public async getFilesInFolder(folder: vscode.WorkspaceFolder): Promise<string[]> {
        const logger = getLogger();
        const startTime = Date.now();
        const allFiles: string[] = [];

        // Use VS Code's findFiles API with null exclude to include all files
        // (including node_modules, .git, etc. that are normally excluded)
        // Note: empty string '' has undocumented behaviour; null explicitly disables excludes
        // Scope to specific folder using RelativePattern
        const pattern = new vscode.RelativePattern(folder, '**/*');
        const files = await vscode.workspace.findFiles(pattern, null);

        for (const file of files) {
            const relativePath = path.relative(folder.uri.fsPath, file.fsPath);
            // Normalise path separators to forward slashes for gitignore matching
            const normalisedPath = relativePath.split(path.sep).join('/');
            allFiles.push(normalisedPath);
        }

        const duration = Date.now() - startTime;
        logger.logTiming('Workspace scan: ' + allFiles.length + ' files', duration);
        return allFiles;
    }

    /**
     * Disposes of the scanner.
     */
    public dispose(): void {
        // No resources to clean up
    }
}
