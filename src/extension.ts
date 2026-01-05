// Date: 05/01/2026
// Main extension entry point - handles activation and coordinates components

import * as vscode from 'vscode';
import * as path from 'path';
import { DecorationProvider } from './decorationProvider';
import { WorkspaceScanner } from './workspaceScanner';
import { getLogger, disposeLogger } from './logger';

// Module-level references to components
let decorationProvider: DecorationProvider | undefined;
let workspaceScanner: WorkspaceScanner | undefined;

/**
 * Checks if a document is a supported ignore file type.
 * Supports .gitignore (via languageId), .vscodeignore and .prettierignore (via filename).
 *
 * @param document - The text document to check
 * @returns True if the document is a supported ignore file
 */
function isSupportedIgnoreFile(document: vscode.TextDocument): boolean {
    // Check for 'ignore' language ID (standard .gitignore detection)
    if (document.languageId === 'ignore') {
        return true;
    }

    // Also check filenames for files that may not have 'ignore' languageId
    const fileName = path.basename(document.uri.fsPath).toLowerCase();
    if (fileName === '.vscodeignore' || fileName === '.prettierignore') {
        return true;
    }

    return false;
}

/**
 * Activates the extension.
 * Sets up all components and registers event listeners.
 *
 * @param context - The extension context
 */
export function activate(context: vscode.ExtensionContext): void {
    const logger = getLogger();
    logger.log('IgnoreLens extension activated');

    // Initialise the workspace scanner
    workspaceScanner = new WorkspaceScanner();

    // Initialise the decoration provider
    decorationProvider = new DecorationProvider(workspaceScanner);

    // Register for active editor changes
    const editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isSupportedIgnoreFile(editor.document) && decorationProvider) {
            decorationProvider.triggerUpdateDecorations(editor, false, 'editor switch');
        }
    });
    context.subscriptions.push(editorChangeDisposable);

    // Register for document changes (with debounce)
    const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (editor && event.document === editor.document && isSupportedIgnoreFile(event.document) && decorationProvider) {
            decorationProvider.triggerUpdateDecorations(editor, true, 'ignore file edit');
        }
    });
    context.subscriptions.push(documentChangeDisposable);

    // Register for document open events (also fires on language mode change)
    const documentOpenDisposable = vscode.workspace.onDidOpenTextDocument(document => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === document && isSupportedIgnoreFile(document) && decorationProvider) {
            decorationProvider.triggerUpdateDecorations(editor, false, 'document open');
        }
    });
    context.subscriptions.push(documentOpenDisposable);

    // Register file system watcher for workspace changes
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    context.subscriptions.push(fileWatcher);

    // Invalidate cache and update decorations when files are created or deleted
    const createDisposable = fileWatcher.onDidCreate((uri) => {
        logger.log('Cache invalidated: file created - ' + uri.fsPath);
        if (workspaceScanner) {
            workspaceScanner.invalidateCache();
        }
        refreshActiveEditor('file created');
    });
    context.subscriptions.push(createDisposable);

    const deleteDisposable = fileWatcher.onDidDelete((uri) => {
        logger.log('Cache invalidated: file deleted - ' + uri.fsPath);
        if (workspaceScanner) {
            workspaceScanner.invalidateCache();
        }
        refreshActiveEditor('file deleted');
    });
    context.subscriptions.push(deleteDisposable);

    // Register for configuration changes
    const configDisposable = vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('ignorelens')) {
            // Notify decoration provider of config change (may need to recreate decoration types)
            if (decorationProvider) {
                decorationProvider.onConfigurationChanged();
            }
            refreshActiveEditor('config change');
        }
    });
    context.subscriptions.push(configDisposable);

    // Initial decoration update for the active editor
    if (vscode.window.activeTextEditor && isSupportedIgnoreFile(vscode.window.activeTextEditor.document)) {
        decorationProvider.updateDecorations(vscode.window.activeTextEditor);
    }
}

/**
 * Refreshes decorations for the active editor if it's an ignore file.
 *
 * @param reason - Optional reason for the refresh (for logging)
 */
function refreshActiveEditor(reason?: string): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && isSupportedIgnoreFile(editor.document) && decorationProvider) {
        decorationProvider.triggerUpdateDecorations(editor, true, reason);
    }
}

/**
 * Deactivates the extension.
 * Cleans up all components.
 */
export function deactivate(): void {
    if (decorationProvider) {
        decorationProvider.dispose();
        decorationProvider = undefined;
    }

    if (workspaceScanner) {
        workspaceScanner.dispose();
        workspaceScanner = undefined;
    }

    // Dispose the logger
    disposeLogger();
}
