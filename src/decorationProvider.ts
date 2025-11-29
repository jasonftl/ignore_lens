// Date: 29/11/2025
// Manages line decorations for ignore pattern feedback

import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceScanner } from './workspaceScanner';
import { IgnoreParser } from './ignoreParser';
import { PatternMatcher } from './patternMatcher';
import { DecorationStyle } from './types';

/**
 * Provides line decorations for ignore files.
 * Shows visual feedback indicating whether patterns match files in the workspace.
 */
export class DecorationProvider implements vscode.Disposable {
    private noMatchDecorationType: vscode.TextEditorDecorationType | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private parser: IgnoreParser;
    private matcher: PatternMatcher;
    private currentStyle: DecorationStyle;

    /**
     * Creates a new DecorationProvider.
     *
     * @param workspaceScanner - The workspace scanner for getting file lists
     */
    constructor(private workspaceScanner: WorkspaceScanner) {
        this.parser = new IgnoreParser();
        this.matcher = new PatternMatcher();
        this.currentStyle = this.getDecorationStyle();

        // Create initial decoration types
        this.createDecorationTypes();
    }

    /**
     * Gets the current decoration style from configuration.
     *
     * @returns The decoration style setting
     */
    private getDecorationStyle(): DecorationStyle {
        const config = vscode.workspace.getConfiguration('ignorelens');
        const style = config.get<string>('decorationStyle', 'background');

        // Validate the style value
        if (style === 'none' || style === 'background' || style === 'text' || style === 'both') {
            return style;
        }

        return 'background';
    }

    /**
     * Creates decoration types based on the current style setting.
     */
    private createDecorationTypes(): void {
        // Dispose existing decoration type
        if (this.noMatchDecorationType) {
            this.noMatchDecorationType.dispose();
        }

        const style = this.currentStyle;

        // No decorations if style is 'none'
        if (style === 'none') {
            this.noMatchDecorationType = undefined;
            return;
        }

        // Build decoration options based on style (only for no-match patterns)
        const noMatchOptions: vscode.DecorationRenderOptions = { isWholeLine: true };

        if (style === 'background' || style === 'both') {
            noMatchOptions.backgroundColor = { id: 'ignorelens.noMatchBackground' };
        }

        if (style === 'text' || style === 'both') {
            noMatchOptions.color = { id: 'ignorelens.noMatchForeground' };
        }

        // Create the decoration type
        this.noMatchDecorationType = vscode.window.createTextEditorDecorationType(noMatchOptions);
    }

    /**
     * Handles configuration changes and recreates decorations if needed.
     */
    public onConfigurationChanged(): void {
        const newStyle = this.getDecorationStyle();

        if (newStyle !== this.currentStyle) {
            this.currentStyle = newStyle;
            this.createDecorationTypes();
        }
    }

    /**
     * Updates decorations for the given editor.
     * Parses the document and applies decorations based on pattern matches.
     *
     * @param editor - The text editor to update decorations for
     */
    public async updateDecorations(editor: vscode.TextEditor): Promise<void> {
        // Check if extension is enabled
        const config = vscode.workspace.getConfiguration('ignorelens');
        const enabled = config.get<boolean>('enabled', true);

        // Clear decorations if disabled or style is 'none'
        if (!enabled || this.currentStyle === 'none') {
            if (this.noMatchDecorationType) {
                editor.setDecorations(this.noMatchDecorationType, []);
            }
            return;
        }

        // Only process ignore language files
        if (editor.document.languageId !== 'ignore') {
            return;
        }

        // Ensure decoration type exists
        if (!this.noMatchDecorationType) {
            return;
        }

        const document = editor.document;
        const noMatchDecorations: vscode.DecorationOptions[] = [];

        // Get all workspace files
        let workspaceFiles = await this.workspaceScanner.getAllFiles();

        // Handle nested ignore files - make paths relative to the ignore file's directory
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            const ignoreFileDir = path.dirname(document.uri.fsPath);
            const workspaceRoot = workspaceFolder.uri.fsPath;
            const relativeDirPath = path.relative(workspaceRoot, ignoreFileDir);
            const normalisedRelativeDir = relativeDirPath.split(path.sep).join('/');

            // If ignore file is not at workspace root, filter and adjust paths
            if (normalisedRelativeDir !== '') {
                const prefix = normalisedRelativeDir + '/';
                workspaceFiles = workspaceFiles
                    .filter(file => file.startsWith(prefix))
                    .map(file => file.substring(prefix.length));
            }
        }

        // Process each line in the document
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex = lineIndex + 1) {
            const line = document.lineAt(lineIndex);
            const parsedLine = this.parser.parseLine(line.text);

            // Skip comments, blank lines, and negation patterns
            // Negations are context-dependent (depend on earlier patterns) so we can't
            // accurately determine if they're useful without full file analysis
            if (parsedLine.type === 'comment' || parsedLine.type === 'blank' || parsedLine.isNegation) {
                continue;
            }

            // Check pattern against workspace files
            const matchResult = this.matcher.findMatches(parsedLine.pattern, workspaceFiles);

            // Only decorate patterns that don't match any files (redundant patterns)
            if (matchResult.matchingFiles.length === 0) {
                const range = line.range;
                const decoration: vscode.DecorationOptions = { range };
                noMatchDecorations.push(decoration);
            }
        }

        // Apply decorations (only for no-match patterns)
        editor.setDecorations(this.noMatchDecorationType, noMatchDecorations);
    }

    /**
     * Triggers a decoration update with optional debouncing.
     *
     * @param editor - The text editor to update
     * @param throttle - Whether to debounce the update
     */
    public triggerUpdateDecorations(editor: vscode.TextEditor, throttle: boolean = false): void {
        // Clear any pending update
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        }

        if (throttle) {
            const config = vscode.workspace.getConfiguration('ignorelens');
            const debounceMs = config.get<number>('scanDebounceMs', 500);

            this.updateTimeout = setTimeout(() => {
                this.updateDecorations(editor);
            }, debounceMs);
        } else {
            this.updateDecorations(editor);
        }
    }

    /**
     * Disposes of the decoration provider.
     */
    public dispose(): void {
        if (this.noMatchDecorationType) {
            this.noMatchDecorationType.dispose();
        }

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
    }
}
