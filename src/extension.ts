// Date: 08/01/2026
// Main extension entry point - handles activation and coordinates components

import * as vscode from 'vscode';
import * as path from 'path';
import { DecorationProvider } from './decorationProvider';
import { WorkspaceScanner } from './workspaceScanner';
import { log, disposeLogger } from './logger';
import { decorationCache } from './decorationCache';
import { getGcloudIncludeName, isGcloudIncludeName } from './parserStrategy';

// Module-level references to components
let decorationProvider: DecorationProvider | undefined;
let workspaceScanner: WorkspaceScanner | undefined;

/**
 * Helper to check if document is a supported ignore file.
 * Delegates to decorationProvider.isSupportedIgnoreFile().
 *
 * @param document - The text document to check
 * @returns True if the document is a supported ignore file
 */
function isSupportedIgnoreFile(document: vscode.TextDocument): boolean {
    if (!decorationProvider) {
        return false;
    }
    return decorationProvider.isSupportedIgnoreFile(document);
}

/**
 * Activates the extension.
 * Sets up all components and registers event listeners.
 *
 * @param context - The extension context
 */
export function activate(context: vscode.ExtensionContext): void {
    log('IgnoreLens extension activated');

    // Initialise the workspace scanner
    workspaceScanner = new WorkspaceScanner();

    // Initialise the decoration provider
    decorationProvider = new DecorationProvider(workspaceScanner);

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor && isSupportedIgnoreFile(editor.document)) {
            decorationProvider?.triggerUpdateDecorations(editor, false, 'editor switch', true);
        }
    }));
    context.subscriptions.push(vscode.window.onDidChangeVisibleTextEditors(editors => {
        decorationProvider?.retainEditors(editors.filter(editor => isSupportedIgnoreFile(editor.document)));
        refreshVisibleEditors('visible editors changed');
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
        refreshVisibleEditors('ignore file edit', undefined, false, event.document);
    }));
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(document => {
        refreshVisibleEditors('document open', undefined, false, document);
    }));
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(document => {
        decorationCache.delete(document.uri.toString());
    }));

    // Register file system watcher for workspace changes
    const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    context.subscriptions.push(fileWatcher);

    // Update decorations when files are created or deleted
    const createDisposable = fileWatcher.onDidCreate(uri => {
        if (!workspaceScanner) {
            return;
        }

        void workspaceScanner.addPath(uri).then(created => {
            if (created) {
                refreshVisibleEditors('file created', uri, created === 'rescan');
            } else {
                refreshGcloudIncludes(uri);
            }
        }, error => log('Failed to cache created file: ' + String(error)));
    });
    context.subscriptions.push(createDisposable);

    const deleteDisposable = fileWatcher.onDidDelete(uri => {
        if (workspaceScanner?.removePath(uri)) {
            refreshVisibleEditors('file deleted', uri);
        } else {
            refreshGcloudIncludes(uri);
        }
    });
    context.subscriptions.push(deleteDisposable);
    context.subscriptions.push(fileWatcher.onDidChange(refreshGcloudIncludes));

    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
        refreshVisibleEditors('workspace folders changed');
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
        const linkSettingChanged = event.affectsConfiguration('search.followSymlinks');
        if (linkSettingChanged) workspaceScanner?.invalidate();
        if (event.affectsConfiguration('ignorelens')) decorationProvider?.onConfigurationChanged();
        if (linkSettingChanged || event.affectsConfiguration('ignorelens')) {
            refreshVisibleEditors('config change');
        }
    }));

    refreshVisibleEditors('activation');
}

function refreshGcloudIncludes(uri: vscode.Uri): void {
    for (const editor of vscode.window.visibleTextEditors) {
        const documentUri = editor.document.uri;
        if (documentUri.scheme !== uri.scheme || documentUri.authority !== uri.authority ||
            path.basename(documentUri.fsPath).toLowerCase() !== '.gcloudignore') continue;

        const directory = path.dirname(documentUri.fsPath);
        if (path.relative(directory, path.dirname(uri.fsPath)) !== '') continue;

        for (let line = 0; line < editor.document.lineCount; line++) {
            const name = getGcloudIncludeName(editor.document.lineAt(line).text);
            if (name !== undefined && isGcloudIncludeName(name) && path.relative(path.join(directory, name), uri.fsPath) === '') {
                decorationProvider?.triggerUpdateDecorations(editor, true, 'Google Cloud include changed');
                break;
            }
        }
    }
}

function refreshVisibleEditors(reason: string, changedUri?: vscode.Uri, wholeFolder = false, document?: vscode.TextDocument): void {
    for (const editor of vscode.window.visibleTextEditors) {
        if (!isSupportedIgnoreFile(editor.document) || document && document !== editor.document) continue;

        if (changedUri) {
            const editorFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
            const changedFolder = vscode.workspace.getWorkspaceFolder(changedUri);
            if (!editorFolder || editorFolder.uri.toString() !== changedFolder?.uri.toString()) continue;

            const ignoreFileDir = path.dirname(editor.document.uri.fsPath);
            if (!wholeFolder && !isPathWithin(ignoreFileDir, changedUri.fsPath) && !isPathWithin(changedUri.fsPath, ignoreFileDir)) {
                continue;
            }
        }

        decorationProvider?.triggerUpdateDecorations(editor, true, reason);
    }
}

function isPathWithin(parent: string, candidate: string): boolean {
    const relative = path.relative(parent, candidate);
    return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
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
