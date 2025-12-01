// Date: 01/12/2025
// Manages line decorations for ignore pattern feedback

import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceScanner } from './workspaceScanner';
import { IgnoreParser } from './ignoreParser';
import { PatternMatcher } from './patternMatcher';
import { DecorationStyle } from './types';
import { getLogger } from './logger';

/**
 * Provides line decorations for ignore files.
 * Shows visual feedback indicating whether patterns match files in the workspace.
 */
export class DecorationProvider implements vscode.Disposable {
    private noMatchDecorationType: vscode.TextEditorDecorationType | undefined;
    private matchCountDecorationType: vscode.TextEditorDecorationType | undefined;
    private updateTimeout: NodeJS.Timeout | undefined;
    private updateVersion: number = 0;
    private parser: IgnoreParser;
    private matcher: PatternMatcher;
    private currentStyle: DecorationStyle;
    private showMatchCount: boolean;

    /**
     * Creates a new DecorationProvider.
     *
     * @param workspaceScanner - The workspace scanner for getting file lists
     */
    constructor(private workspaceScanner: WorkspaceScanner) {
        this.parser = new IgnoreParser();
        this.matcher = new PatternMatcher();
        this.currentStyle = this.getDecorationStyle();
        this.showMatchCount = this.getShowMatchCount();

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
        const style = config.get<string>('decorationStyle', 'text');

        // Validate the style value
        if (style === 'none' || style === 'background' || style === 'text' || style === 'both') {
            return style;
        }

        return 'text';
    }

    /**
     * Gets the showMatchCount setting from configuration.
     *
     * @returns Whether to show match counts
     */
    private getShowMatchCount(): boolean {
        const config = vscode.workspace.getConfiguration('ignorelens');
        const showCount = config.get<boolean>('showMatchCount', true);
        return showCount;
    }

    /**
     * Creates decoration types based on the current style setting.
     */
    private createDecorationTypes(): void {
        // Dispose existing decoration types
        if (this.noMatchDecorationType) {
            this.noMatchDecorationType.dispose();
        }
        if (this.matchCountDecorationType) {
            this.matchCountDecorationType.dispose();
        }

        const style = this.currentStyle;

        // No decorations if style is 'none'
        if (style === 'none') {
            this.noMatchDecorationType = undefined;
        } else {
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

        // Create match count decoration type (renders count before line)
        if (this.showMatchCount) {
            this.matchCountDecorationType = vscode.window.createTextEditorDecorationType({});
        } else {
            this.matchCountDecorationType = undefined;
        }
    }

    /**
     * Handles configuration changes and recreates decorations if needed.
     */
    public onConfigurationChanged(): void {
        const newStyle = this.getDecorationStyle();
        const newShowMatchCount = this.getShowMatchCount();
        let needsRecreate = false;

        if (newStyle !== this.currentStyle) {
            this.currentStyle = newStyle;
            needsRecreate = true;
        }

        if (newShowMatchCount !== this.showMatchCount) {
            this.showMatchCount = newShowMatchCount;
            needsRecreate = true;
        }

        if (needsRecreate) {
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
        // Track this update's version to prevent stale results from overwriting newer ones
        this.updateVersion = this.updateVersion + 1;
        const thisVersion = this.updateVersion;

        // Check if extension is enabled
        const config = vscode.workspace.getConfiguration('ignorelens');
        const enabled = config.get<boolean>('enabled', true);

        // Clear decorations if disabled
        if (!enabled) {
            if (this.noMatchDecorationType) {
                editor.setDecorations(this.noMatchDecorationType, []);
            }
            if (this.matchCountDecorationType) {
                editor.setDecorations(this.matchCountDecorationType, []);
            }
            return;
        }

        // Only process ignore language files
        if (editor.document.languageId !== 'ignore') {
            return;
        }

        const document = editor.document;
        const noMatchDecorations: vscode.DecorationOptions[] = [];
        const matchCountDecorations: vscode.DecorationOptions[] = [];

        // Get the workspace folder containing this ignore file
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            return;
        }

        // Get files only from this workspace folder (not other roots in multi-root workspace)
        let workspaceFiles = await this.workspaceScanner.getFilesInFolder(workspaceFolder);

        // Check if a newer update has started while we were scanning
        if (thisVersion !== this.updateVersion) {
            const logger = getLogger();
            logger.log('Discarding stale decoration update (version ' + thisVersion + ' superseded by ' + this.updateVersion + ')');
            return;
        }

        // Handle nested ignore files - make paths relative to the ignore file's directory
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

        // First pass: find longest line (including comments) and collect pattern match counts
        const lineData: Array<{ lineIndex: number; lineLength: number; matchCount: number }> = [];
        let maxLineLength = 0;

        // Find max line length across all lines (including comments)
        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex = lineIndex + 1) {
            const line = document.lineAt(lineIndex);
            const lineLength = line.text.length;

            if (lineLength > maxLineLength) {
                maxLineLength = lineLength;
            }
        }

        // Collect pattern line data
        const logger = getLogger();
        const patternStartTime = Date.now();
        let patternCount = 0;
        const ignoredFiles = new Set<string>();

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex = lineIndex + 1) {
            const line = document.lineAt(lineIndex);
            const parsedLine = this.parser.parseLine(line.text);

            // Skip comments and blank lines (no count to show)
            if (parsedLine.type === 'comment' || parsedLine.type === 'blank') {
                continue;
            }

            // Check pattern against workspace files
            const matchResult = this.matcher.findMatches(parsedLine.pattern, workspaceFiles);
            const matchCount = matchResult.matchingFiles.length;
            const lineLength = line.text.length;

            // Track unique ignored files for summary (negations remove from set)
            if (parsedLine.isNegation) {
                for (const file of matchResult.matchingFiles) {
                    ignoredFiles.delete(file);
                }
            } else {
                for (const file of matchResult.matchingFiles) {
                    ignoredFiles.add(file);
                }
            }

            lineData.push({ lineIndex, lineLength, matchCount });
            patternCount = patternCount + 1;
        }

        const patternDuration = Date.now() - patternStartTime;
        logger.logTiming('Pattern matching: ' + patternCount + ' patterns', patternDuration);

        // Log approximate summary of ignored vs not ignored files
        // Note: This is a simplified model - doesn't perfectly replicate gitignore ordering edge cases
        const ignoredCount = ignoredFiles.size;
        const notIgnoredCount = workspaceFiles.length - ignoredCount;
        const ignoreFileName = path.basename(document.uri.fsPath);
        logger.log('Summary (' + ignoreFileName + '): ~' + ignoredCount + ' matched, ~' + notIgnoredCount + ' unmatched (of ' + workspaceFiles.length + ' paths)');

        // Second pass: create decorations with aligned counts
        let isFirstPattern = true;
        for (const data of lineData) {
            const { lineIndex, lineLength, matchCount } = data;
            const line = document.lineAt(lineIndex);

            // Add match count decoration at end of line if enabled
            if (this.showMatchCount && this.matchCountDecorationType) {
                const range = line.range;
                // First pattern shows "matches" label, rest just show number
                const countText = isFirstPattern
                    ? '(' + String(matchCount) + ' matches)'
                    : '(' + String(matchCount) + ')';
                isFirstPattern = false;
                // Pad with non-breaking spaces to align all counts
                const padding = '\u00A0'.repeat(maxLineLength - lineLength + 4);
                // Use red for 0 matches, green for >0
                const countColour = matchCount === 0
                    ? { id: 'ignorelens.noMatchForeground' }
                    : { id: 'ignorelens.matchCountForeground' };
                const countDecoration: vscode.DecorationOptions = {
                    range: range,
                    renderOptions: {
                        after: {
                            contentText: padding + countText,
                            color: countColour,
                            fontStyle: 'italic'
                        }
                    }
                };
                matchCountDecorations.push(countDecoration);
            }

            // Only decorate patterns that don't match any files (redundant patterns)
            if (matchCount === 0 && this.noMatchDecorationType && this.currentStyle !== 'none') {
                const range = line.range;
                const decoration: vscode.DecorationOptions = { range };
                noMatchDecorations.push(decoration);
            }
        }

        // Check again before applying - pattern matching may have taken time
        if (thisVersion !== this.updateVersion) {
            logger.log('Discarding stale decoration update (version ' + thisVersion + ' superseded by ' + this.updateVersion + ')');
            return;
        }

        // Apply decorations
        if (this.noMatchDecorationType) {
            editor.setDecorations(this.noMatchDecorationType, noMatchDecorations);
        }
        if (this.matchCountDecorationType) {
            editor.setDecorations(this.matchCountDecorationType, matchCountDecorations);
        }

        logger.log('Decoration update complete');
    }

    /**
     * Triggers a decoration update with optional debouncing.
     *
     * @param editor - The text editor to update
     * @param throttle - Whether to debounce the update
     * @param reason - Optional reason for the update (for logging)
     */
    public triggerUpdateDecorations(editor: vscode.TextEditor, throttle: boolean = false, reason?: string): void {
        const logger = getLogger();

        // Clear any pending update
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        }

        if (throttle) {
            const config = vscode.workspace.getConfiguration('ignorelens');
            const debounceMs = config.get<number>('scanDebounceMs', 500);

            this.updateTimeout = setTimeout(() => {
                if (reason) {
                    logger.log('Decoration update triggered by: ' + reason);
                }
                this.updateDecorations(editor);
            }, debounceMs);
        } else {
            if (reason) {
                logger.log('Decoration update triggered by: ' + reason);
            }
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

        if (this.matchCountDecorationType) {
            this.matchCountDecorationType.dispose();
        }

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
    }
}
