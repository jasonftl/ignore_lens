// Date: 09/01/2026
// Manages line decorations for ignore pattern feedback

import * as vscode from 'vscode';
import { execFile } from 'node:child_process';
import * as path from 'path';
import { WorkspaceScanner } from './workspaceScanner';
import { AdvancedCountResult, DecorationStyle, IgnoreFileType, ParsedLine } from './types';
import { log, logTiming } from './logger';
import { getParser, ILineParser, isGcloudIncludeName, parseFile } from './parserStrategy';
import { getMatcher, IPatternMatcher } from './matcherStrategy';
import { getCountCalculator, ICountCalculator } from './countStrategy';
import { decorationCache, CachedDecorations, LineDecorationData, LineWarning } from './decorationCache';
import { ALL_SUPPORTED_FILES, SUPPORTED_FILE_TYPES } from './supportedFiles';

interface LineCollectionResult {
    lineData: LineDecorationData[];
    warnings: LineWarning[];
    maxLineLength: number;
    maxCol1Width: number;
    maxCol3Width: number;
    totalShadowed: number;
    totalNotInSet: number;
    totalBlocked: number;
    finalSetSize: number;
}

interface EditorUpdate {
    timeout?: NodeJS.Timeout;
    scanning?: boolean;
}

function readGitIgnoreCase(directory: string): Promise<boolean> {
    return new Promise(resolve => {
        execFile('git', ['-C', directory, 'config', '--type=bool', '--get', 'core.ignoreCase'],
            { timeout: 5000, windowsHide: true }, (error, stdout) => resolve(!error && stdout.trim() === 'true'));
    });
}

/**
 * Provides line decorations for ignore files.
 * Shows visual feedback indicating whether patterns match files in the workspace.
 */
export class DecorationProvider implements vscode.Disposable {
    private noMatchDecorationType: vscode.TextEditorDecorationType | undefined;
    private matchCountDecorationType: vscode.TextEditorDecorationType | undefined;
    // Stale decoration types for cached data (darker colours)
    private staleNoMatchDecorationType: vscode.TextEditorDecorationType | undefined;
    private staleMatchCountDecorationType: vscode.TextEditorDecorationType | undefined;
    private readonly scanStatusDecorationType: vscode.TextEditorDecorationType;
    private readonly updates = new Map<vscode.TextEditor, EditorUpdate>();
    private currentStyle: DecorationStyle;
    private showMatchCount: boolean;
    private readonly matchers = new Map<IgnoreFileType | 'gitignore-ignore-case', IPatternMatcher>();

    /**
     * Creates a new DecorationProvider.
     *
     * @param workspaceScanner - The workspace scanner for getting file lists
     */
    constructor(private workspaceScanner: WorkspaceScanner) {
        this.currentStyle = this.getDecorationStyle();
        this.showMatchCount = this.getShowMatchCount();

        // Create initial decoration types
        this.scanStatusDecorationType = vscode.window.createTextEditorDecorationType({});
        this.createDecorationTypes();
    }

    /**
     * Detects the semantic ignore file type from the document.
     * Returns 'vscodeignore' for minimatch-style files, 'gitignore' for all others.
     * See supportedFiles.ts for the complete list of supported files.
     *
     * @param document - The text document to check
     * @returns The detected ignore file type
     */
    private detectFileType(document: vscode.TextDocument): IgnoreFileType {
        const fileName = path.basename(document.uri.fsPath).toLowerCase();

        return SUPPORTED_FILE_TYPES[fileName] ?? 'gitignore';
    }

    /**
     * Checks if a document is a supported ignore file type.
     * Supports files with 'ignore' languageId, plus all files in supportedFiles.ts.
     *
     * @param document - The text document to check
     * @returns True if the document is a supported ignore file
     */
    public isSupportedIgnoreFile(document: vscode.TextDocument): boolean {
        // Check for 'ignore' language ID (standard .gitignore detection)
        if (document.languageId === 'ignore') {
            return true;
        }

        // Check against centralised list of supported filenames
        const fileName = path.basename(document.uri.fsPath).toLowerCase();
        return ALL_SUPPORTED_FILES.includes(fileName);
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
     * Creates both normal and stale (darker) versions for cached data display.
     */
    private createDecorationTypes(): void {
        // Dispose existing decoration types
        if (this.noMatchDecorationType) {
            this.noMatchDecorationType.dispose();
        }
        if (this.matchCountDecorationType) {
            this.matchCountDecorationType.dispose();
        }
        if (this.staleNoMatchDecorationType) {
            this.staleNoMatchDecorationType.dispose();
        }
        if (this.staleMatchCountDecorationType) {
            this.staleMatchCountDecorationType.dispose();
        }

        const style = this.currentStyle;

        // No decorations if style is 'none'
        if (style === 'none') {
            this.noMatchDecorationType = undefined;
            this.staleNoMatchDecorationType = undefined;
        } else {
            // Get stale colours (uses inline hex by default, ThemeColor if user customised)

            // Build decoration options based on style (only for no-match patterns)
            const noMatchOptions: vscode.DecorationRenderOptions = { isWholeLine: true };
            const staleNoMatchOptions: vscode.DecorationRenderOptions = { isWholeLine: true };

            if (style === 'background' || style === 'both') {
                noMatchOptions.backgroundColor = { id: 'ignorelens.noMatchBackground' };
                staleNoMatchOptions.backgroundColor = { id: 'ignorelens.staleNoMatchBackground' };
            }

            if (style === 'text' || style === 'both') {
                noMatchOptions.color = { id: 'ignorelens.noMatchForeground' };
                staleNoMatchOptions.color = { id: 'ignorelens.staleNoMatchForeground' };
            }

            // Create the decoration types (normal and stale)
            this.noMatchDecorationType = vscode.window.createTextEditorDecorationType(noMatchOptions);
            this.staleNoMatchDecorationType = vscode.window.createTextEditorDecorationType(staleNoMatchOptions);
        }

        // Create match count decoration types (renders count after line)
        if (this.showMatchCount) {
            this.matchCountDecorationType = vscode.window.createTextEditorDecorationType({});
            this.staleMatchCountDecorationType = vscode.window.createTextEditorDecorationType({});
        } else {
            this.matchCountDecorationType = undefined;
            this.staleMatchCountDecorationType = undefined;
        }
    }

    /**
     * Handles configuration changes and recreates decorations if needed.
     */
    public onConfigurationChanged(): void {
        if (!vscode.workspace.getConfiguration('ignorelens').get<boolean>('enabled', true)) {
            this.cancelUpdate();
            for (const editor of vscode.window.visibleTextEditors) {
                if (this.isSupportedIgnoreFile(editor.document)) this.clearDecorations(editor);
            }
        }
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
        this.cancelEditorUpdate(editor);
        const update: EditorUpdate = {};
        this.updates.set(editor, update);
        const isCurrent = () => this.updates.get(editor) === update;

        try {
            await this.runUpdate(editor, update, isCurrent);
        } catch (error) {
            if (!isCurrent()) return;
            this.clearProgress(editor, update);
            if (error instanceof vscode.CancellationError) return;

            log('Decoration update failed: ' + String(error), true);
            try {
                if (!decorationCache.has(editor.document.uri.toString())) this.clearDecorations(editor);
                this.applyDecorationsFromData(editor, decorationCache.get(editor.document.uri.toString()), true,
                    'Scan failed. Check the IgnoreLens output for details.');
            } catch (clearError) {
                log('Failed to clear decorations: ' + String(clearError));
            }
        } finally {
            if (isCurrent()) this.updates.delete(editor);
        }
    }

    private async runUpdate(editor: vscode.TextEditor, update: EditorUpdate, isCurrent: () => boolean): Promise<void> {
        // Check if extension is enabled
        const config = vscode.workspace.getConfiguration('ignorelens');
        const enabled = config.get<boolean>('enabled', true);

        // Clear all decorations (normal and stale) if disabled
        if (!enabled) {
            this.clearDecorations(editor);
            return;
        }

        // Only process supported ignore files
        if (!this.isSupportedIgnoreFile(editor.document)) {
            return;
        }

        const document = editor.document;
        const documentUri = document.uri.toString();

        // Phase 1: Check cache and show stale decorations immediately
        const cachedDecorations = decorationCache.get(documentUri);
        update.scanning = true;
        this.applyDecorationsFromData(editor, cachedDecorations, true, 'Scanning...');
        if (cachedDecorations) {
            log('Showing cached decorations (stale) while refreshing...');
        }

        const ignoreFileDir = path.dirname(document.uri.fsPath);
        const fileType = this.detectFileType(document);
        const ignoreCase = document.uri.scheme === 'file' && path.basename(document.uri.fsPath).toLowerCase() === '.gitignore'
            && await readGitIgnoreCase(ignoreFileDir);
        if (!isCurrent()) return;

        const parser = getParser(fileType);
        const matcherKey = ignoreCase ? 'gitignore-ignore-case' : fileType;
        let matcher = this.matchers.get(matcherKey);
        if (!matcher) {
            matcher = getMatcher(fileType, ignoreCase);
            this.matchers.set(matcherKey, matcher);
        }
        const countCalculator = getCountCalculator(fileType, ignoreCase);
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) {
            this.clearDecorations(editor);
            return;
        }

        // Get files only from this workspace folder (not other roots in multi-root workspace)
        let previousProgress = 'Scanning...';
        let nextProgress = performance.now() + 1000 / 3;
        const scan = await this.workspaceScanner.getFilesInFolder(workspaceFolder, message => {
            if (isCurrent() && message !== previousProgress && performance.now() >= nextProgress) {
                this.applyDecorationsFromData(editor, cachedDecorations, true, message);
                previousProgress = message;
                nextProgress = performance.now() + 1000 / 3;
            }
        });

        // Check if a newer update has started while we were scanning
        if (!isCurrent()) return;

        // Handle nested ignore files - make paths relative to the ignore file's directory
        const workspaceRoot = workspaceFolder.uri.fsPath;
        const relativeDirPath = path.relative(workspaceRoot, ignoreFileDir);
        const normalisedRelativeDir = relativeDirPath.split(path.sep).join('/');
        let workspaceFiles = Array.from(scan.files);

        // If ignore file is not at workspace root, filter and adjust paths
        if (normalisedRelativeDir !== '') {
            const prefix = normalisedRelativeDir + '/';
            workspaceFiles = workspaceFiles
                .filter(file => file.startsWith(prefix))
                .map(file => file.substring(prefix.length));
        }

        // Collect line data using helper method
        const prefix = normalisedRelativeDir ? normalisedRelativeDir + '/' : '';
        const loopPaths = scan.warnings.flatMap(warning => {
            if (warning.message !== 'Symlink loop' || !warning.path.startsWith(prefix)) return [];
            const relative = warning.path.slice(prefix.length);
            return [relative, relative + '/'];
        });
        const collectionResult = await this.collectLineData(document, parser, matcher, countCalculator, workspaceFiles, loopPaths, isCurrent);
        if (!collectionResult) {
            log('Cancelled stale decoration update');
            return;
        }
        const { lineData, warnings, maxLineLength, maxCol1Width, maxCol3Width, totalShadowed, totalNotInSet, totalBlocked, finalSetSize } = collectionResult;

        // Log accurate summary using cumulative set data
        const ignoreFileName = path.basename(document.uri.fsPath);
        const summaryText = 'Summary (' + ignoreFileName + '): ' + workspaceFiles.length + ' files, ' + finalSetSize + ' ignored, ≡' + totalShadowed + ' shadowed, ∅' + totalNotInSet + ' not in set, ✗' + totalBlocked + ' blocked';
        log(summaryText);

        // Check again before applying - pattern matching may have taken time
        if (!isCurrent()) return;

        // Store fresh data to cache only after confirming this update is still current
        const cachedData: CachedDecorations = {
            lineData: lineData,
            warnings,
            maxLineLength: maxLineLength,
            maxCol1Width: maxCol1Width,
            maxCol3Width: maxCol3Width
        };
        decorationCache.set(documentUri, cachedData);

        update.scanning = false;
        this.applyDecorationsFromData(editor, cachedData, false);

        log('Decoration update complete (fresh data applied)');
    }

    private clearDecorations(editor: vscode.TextEditor): void {
        for (const decorationType of [
            this.noMatchDecorationType,
            this.matchCountDecorationType,
            this.staleNoMatchDecorationType,
            this.staleMatchCountDecorationType,
            this.scanStatusDecorationType
        ]) {
            if (decorationType) {
                editor.setDecorations(decorationType, []);
            }
        }
    }

    private clearProgress(editor: vscode.TextEditor, update: EditorUpdate): void {
        if (!update.scanning) return;
        update.scanning = false;
        this.applyDecorationsFromData(editor, decorationCache.get(editor.document.uri.toString()), true);
    }

    /**
     * Collects line data for all patterns in the document.
     * Calculates match counts, column strings, and summary statistics.
     *
     * @param document - The text document
     * @param parser - The line parser strategy
     * @param matcher - The pattern matcher strategy
     * @param countCalculator - The count calculator strategy
     * @param workspaceFiles - List of workspace files to match against
     * @returns Collection result with line data and statistics
     */
    private async collectLineData(
        document: vscode.TextDocument,
        parser: ILineParser,
        matcher: IPatternMatcher,
        countCalculator: ICountCalculator,
        workspaceFiles: string[],
        loopPaths: string[],
        isCurrent: () => boolean
    ): Promise<LineCollectionResult | undefined> {
        const lineData: LineDecorationData[] = [];
        const warnings: LineWarning[] = [];
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
        const patternStartTime = Date.now();
        let patternCount = 0;
        const patternsPerYield = Math.max(1, Math.floor(10000 / Math.max(1, workspaceFiles.length)));
        // Cumulative set tracking which files are ignored
        const cumulativeSet = new Set<string>();
        // Accumulators for debug summary totals
        let totalShadowed = 0;   // Sum of ≡ (noActionCount for normal patterns)
        let totalNotInSet = 0;   // Sum of ∅ (noActionCount for negation patterns)
        let totalBlocked = 0;    // Sum of ✗ (blockedCount for negation patterns)

        for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex = lineIndex + 1) {
            const line = document.lineAt(lineIndex);
            const parsedLine = parser.parseLine(line.text);

            // Skip comments and blank lines (no count to show)
            if (parsedLine.type === 'comment' || parsedLine.type === 'blank') {
                continue;
            }

            if (parsedLine.warning) {
                warnings.push({ lineIndex, message: parsedLine.warning });
                continue;
            }

            if (patternCount > 0 && patternCount % patternsPerYield === 0) {
                await new Promise<void>(resolve => setImmediate(resolve));
                if (!isCurrent()) {
                    return undefined;
                }
            }

            let isNegation = parsedLine.isNegation;
            let removed = 0;
            let countResult: AdvancedCountResult;
            const reset = parsedLine.tokens?.lastIndexOf('!') ?? -1;
            let patterns = parsedLine.tokens?.slice(reset + 1) ?? [parsedLine.pattern];
            if (parsedLine.type === 'include' || reset !== -1) {
                const previous = new Set(cumulativeSet);
                if (parsedLine.type === 'include') {
                    const included = await this.readGcloudInclude(document.uri, parsedLine.pattern, parser);
                    if (!isCurrent()) return undefined;
                    if (typeof included === 'string') {
                        warnings.push({ lineIndex, message: included });
                        continue;
                    }
                    if (included.some(rule => rule.type === 'include')) {
                        warnings.push({ lineIndex, message: 'Google Cloud does not process nested include directives.' });
                    }
                    patterns = included.filter(rule => rule.type === 'pattern').map(rule => rule.pattern);
                    for (const rule of included) {
                        if (rule.type !== 'pattern') continue;
                        if (++patternCount % patternsPerYield === 0) {
                            await new Promise<void>(resolve => setImmediate(resolve));
                            if (!isCurrent()) return undefined;
                        }
                        const matches = await this.findMatchesCooperatively(matcher, rule.pattern, workspaceFiles, isCurrent);
                        if (!matches) return undefined;
                        countCalculator.calculateCount(matches, rule.isNegation, cumulativeSet, rule.pattern);
                    }
                } else {
                    const matches = await this.findLineMatches(matcher, patterns, workspaceFiles, isCurrent);
                    if (!matches) return undefined;
                    cumulativeSet.clear();
                    for (const file of matches) cumulativeSet.add(file);
                }
                let added = 0;
                for (const file of previous) {
                    if (!cumulativeSet.has(file)) removed++;
                }
                for (const file of cumulativeSet) {
                    if (!previous.has(file)) added++;
                }
                isNegation = added === 0 && (removed > 0 || parsedLine.type !== 'include');
                countResult = { actionCount: isNegation ? removed : added, noActionCount: 0, blockedCount: 0, setSize: cumulativeSet.size };
            } else {
                const matches = await this.findLineMatches(matcher, patterns, workspaceFiles, isCurrent);
                if (!matches) return undefined;
                countResult = countCalculator.calculateCount(matches, isNegation, cumulativeSet, parsedLine.pattern);
            }
            if (loopPaths.length) {
                const matches = await this.findLineMatches(matcher, patterns, loopPaths, isCurrent);
                if (!matches) return undefined;
                const loops = new Set(matches.map(file => file.replace(/\/$/, '')));
                const [first] = loops;
                if (first) {
                    const more = loops.size > 1 ? ' (+' + (loops.size - 1) + ' more)' : '';
                    warnings.push({ lineIndex, symlinkLoop: true, message: 'Symlink loop skipped: ' + first + more + '. The rest of the folder was scanned.' });
                }
            }
            const { actionCount, noActionCount, blockedCount, setSize } = countResult;
            const lineLength = line.text.length;

            // Accumulate totals for debug summary
            if (isNegation) {
                totalNotInSet = totalNotInSet + noActionCount;
                totalBlocked = totalBlocked + blockedCount;
            } else {
                totalShadowed = totalShadowed + noActionCount;
            }

            // Pre-compute column strings for alignment
            let col1: string;
            let col2 = '';

            if (isNegation) {
                col1 = '−' + String(actionCount);
                // Build middle column: ∅N and/or ✗N
                if (noActionCount > 0 && blockedCount > 0) {
                    col2 = '∅' + String(noActionCount) + ' ✗' + String(blockedCount);
                } else if (noActionCount > 0) {
                    col2 = '∅' + String(noActionCount);
                } else if (blockedCount > 0) {
                    col2 = '✗' + String(blockedCount);
                }
            } else {
                col1 = '+' + String(actionCount) + (removed ? ' −' + String(removed) : '');
                if (noActionCount > 0) {
                    col2 = '≡' + String(noActionCount);
                }
            }
            const col3 = '(' + String(setSize) + ')';

            lineData.push({ lineIndex, lineLength, actionCount, noActionCount, blockedCount, setSize, isNegation, col1, col2, col3 });
            patternCount = patternCount + 1;
        }

        const patternDuration = Date.now() - patternStartTime;
        logTiming('Pattern matching: ' + patternCount + ' patterns', patternDuration);

        // Calculate max column widths for alignment (col2 is last, needs no padding)
        let maxCol1Width = 0;
        let maxCol3Width = 0;

        for (const data of lineData) {
            if (data.col1.length > maxCol1Width) {
                maxCol1Width = data.col1.length;
            }
            if (data.col3.length > maxCol3Width) {
                maxCol3Width = data.col3.length;
            }
        }

        return {
            lineData,
            warnings,
            maxLineLength,
            maxCol1Width,
            maxCol3Width,
            totalShadowed,
            totalNotInSet,
            totalBlocked,
            finalSetSize: cumulativeSet.size
        };
    }

    private async readGcloudInclude(documentUri: vscode.Uri, name: string, parser: ILineParser): Promise<ParsedLine[] | string> {
        if (!isGcloudIncludeName(name)) return 'Google Cloud can only include a file in the same directory.';

        const uri = vscode.Uri.joinPath(documentUri, '..', name);
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type !== vscode.FileType.File) return 'Google Cloud include must name a regular file: ' + name;
            const content = await vscode.workspace.fs.readFile(uri);
            return parseFile(parser, Buffer.from(content).toString('utf8'));
        } catch {
            return 'Could not read Google Cloud include file: ' + name;
        }
    }

    private async findLineMatches(
        matcher: IPatternMatcher, patterns: string[], files: string[], isCurrent: () => boolean
    ): Promise<string[] | undefined> {
        if (patterns.length === 1) {
            return this.findMatchesCooperatively(matcher, patterns[0], files, isCurrent);
        }
        const all = new Set<string>();
        for (const pattern of patterns) {
            const matches = await this.findMatchesCooperatively(matcher, pattern, files, isCurrent);
            if (!matches) return undefined;
            for (const file of matches) all.add(file);
        }
        return Array.from(all);
    }

    private async findMatchesCooperatively(
        matcher: IPatternMatcher,
        pattern: string,
        files: string[],
        isCurrent: () => boolean
    ): Promise<string[] | undefined> {
        const chunkSize = 10000;
        if (files.length <= chunkSize) {
            return matcher.findMatches(pattern, files);
        }

        const matchingFiles: string[] = [];
        for (let offset = 0; offset < files.length; offset = offset + chunkSize) {
            const chunk = files.slice(offset, offset + chunkSize);
            matchingFiles.push(...matcher.findMatches(pattern, chunk));

            await new Promise<void>(resolve => setImmediate(resolve));
            if (!isCurrent()) {
                return undefined;
            }
        }

        return matchingFiles;
    }

    /**
     * Builds decoration options from line data.
     * Shared helper used by both fresh and cached rendering paths.
     *
     * @param document - The text document
     * @param data - The cached line counts and column widths
     * @param useStaleColours - Whether to use stale (darker) colours
     * @returns Object containing noMatchDecorations and matchCountDecorations arrays
     */
    private buildDecorationsFromLineData(
        document: vscode.TextDocument,
        data: CachedDecorations,
        useStaleColours: boolean,
        loopLines: Set<number>
    ): { noMatchDecorations: vscode.DecorationOptions[]; matchCountDecorations: vscode.DecorationOptions[] } {
        const noMatchDecorations: vscode.DecorationOptions[] = [];
        const matchCountDecorations: vscode.DecorationOptions[] = [];

        const { lineData, maxLineLength, maxCol1Width, maxCol3Width } = data;

        // Build decorations from line data
        for (const row of lineData) {
            const { lineIndex, lineLength, actionCount, noActionCount, isNegation, col1, col2, col3 } = row;

            // Check line still exists in document (important for cached data)
            if (lineIndex >= document.lineCount) {
                continue;
            }

            const line = document.lineAt(lineIndex);

            // Add match count decoration at end of line if enabled
            if (this.showMatchCount && this.matchCountDecorationType) {
                const range = line.range;

                // Compact three-column format with Unicode symbols
                // Key: +N added, −N removed, (N) set size, ≡N already in set, ∅N not in set, ✗N blocked
                // Columns are right-padded with non-breaking spaces to align across all lines
                // Column order: col1 (action), col3 (set size), col2 (secondary counts)
                const nbsp = '\u00A0';
                const col1Padded = col1 + nbsp.repeat(maxCol1Width - col1.length);
                const col3Padded = col3 + nbsp.repeat(maxCol3Width - col3.length);
                // col2 doesn't need padding (it's the last column)

                // Build aligned output with two nbsp between columns
                const countText = col1Padded + nbsp + nbsp + col3Padded + nbsp + nbsp + col2;

                const colour = isNegation || (actionCount === 0 && noActionCount > 0)
                    ? 'negationForeground'
                    : actionCount > 0 ? 'matchCountForeground' : 'noMatchForeground';
                const themeColour = useStaleColours ? 'stale' + colour[0].toUpperCase() + colour.slice(1) : colour;
                const countColour = new vscode.ThemeColor('ignorelens.' + themeColour);

                // Pad with non-breaking spaces to align all counts
                // Clamp to 0 to prevent RangeError if document has grown since cache was created
                const paddingCount = Math.max(0, maxLineLength - lineLength + 4);
                const loop = loopLines.has(lineIndex);
                const countDecoration: vscode.DecorationOptions = {
                    range,
                    renderOptions: {
                        after: {
                            contentText: loop ? countText : nbsp.repeat(paddingCount) + countText,
                            color: countColour,
                            fontStyle: 'italic'
                        }
                    }
                };
                matchCountDecorations.push(countDecoration);
            }

            // A pattern is truly redundant when it matches nothing at all
            // Shadowed patterns (+0 with files already in set) are not redundant - just informational
            // Negations are never redundant (they're informational even when 0)
            const isTrulyRedundant = !isNegation && actionCount === 0 && noActionCount === 0;
            if (isTrulyRedundant && this.noMatchDecorationType && this.currentStyle !== 'none') {
                const range = line.range;
                const decoration: vscode.DecorationOptions = { range };
                noMatchDecorations.push(decoration);
            }
        }

        return { noMatchDecorations, matchCountDecorations };
    }

    /**
     * Applies decorations from cached data.
     * Used to show stale (darker) decorations while refreshing in background.
     *
     * @param editor - The text editor to apply decorations to
     * @param cachedData - The cached decoration data
     * @param isStale - Whether to use stale (darker) decoration colours
     */
    private applyDecorationsFromData(
        editor: vscode.TextEditor, cachedData: CachedDecorations | undefined, isStale: boolean, progress?: string
    ): void {
        const document = editor.document;

        // Select decoration types based on stale flag
        const noMatchType = isStale ? this.staleNoMatchDecorationType : this.noMatchDecorationType;
        const matchCountType = isStale ? this.staleMatchCountDecorationType : this.matchCountDecorationType;

        // Build decorations using shared helper
        const loopLines = new Set(cachedData?.warnings.filter(w => w.symlinkLoop).map(w => w.lineIndex));
        const { noMatchDecorations, matchCountDecorations } = cachedData
            ? this.buildDecorationsFromLineData(document, cachedData, isStale, loopLines)
            : { noMatchDecorations: [], matchCountDecorations: [] };

        const messages = new Map<number, string>();
        if (progress) messages.set(0, '');
        for (const { lineIndex, message } of cachedData?.warnings ?? []) {
            if (lineIndex >= document.lineCount) continue;
            const previous = messages.get(lineIndex);
            messages.set(lineIndex, previous ? previous + '\n' + message : message);
        }
        const notes: vscode.DecorationOptions[] = [];
        if (messages.size) {
            const counts = new Map(matchCountDecorations.map(count => [count.range.start.line, count]));
            const highlightText = this.currentStyle === 'text' || this.currentStyle === 'both';
            const highlightedLines = new Set(highlightText ? noMatchDecorations.map(row => row.range.start.line) : []);
            const noMatchColour = isStale ? 'ignorelens.staleNoMatchForeground' : 'ignorelens.noMatchForeground';
            for (const [lineIndex, message] of messages) {
                const loop = loopLines.has(lineIndex);
                const loopColour = highlightedLines.has(lineIndex) ? new vscode.ThemeColor(noMatchColour) : 'inherit';
                const status = lineIndex === 0 && progress ? '\u00a0' + progress : '';
                const marker = loop ? '\u00a0\u26a0\ufe0e' : '\u00a0\u26a0';
                const hover = message ? new vscode.MarkdownString().appendText(message) : undefined;
                const count = counts.get(lineIndex);
                if (count?.renderOptions?.after && cachedData) {
                    count.renderOptions.after.contentText += status + (message && !loop ? marker : '');
                    count.hoverMessage = hover;
                    if (loop) {
                        const line = document.lineAt(lineIndex);
                        // Both attachments share the rule's range and its single hover message.
                        const padding = Math.max(0, cachedData.maxLineLength - line.text.length + 2);
                        notes.push({
                            range: line.range,
                            renderOptions: { after: {
                                contentText: '\u00a0'.repeat(padding) + '\u26a0\ufe0e\u00a0',
                                color: count.renderOptions.after.color
                            } }
                        });
                    }
                } else {
                    notes.push({
                        range: document.lineAt(lineIndex).range,
                        hoverMessage: hover,
                        renderOptions: { after: {
                            contentText: (message ? marker : '') + status,
                            color: loop ? loopColour : new vscode.ThemeColor(message ? 'editorWarning.foreground' : 'descriptionForeground')
                        } }
                    });
                }
            }
        }

        // Clear existing decorations first (both stale and normal)
        if (this.noMatchDecorationType) {
            editor.setDecorations(this.noMatchDecorationType, []);
        }
        if (this.staleNoMatchDecorationType) {
            editor.setDecorations(this.staleNoMatchDecorationType, []);
        }
        if (this.matchCountDecorationType) {
            editor.setDecorations(this.matchCountDecorationType, []);
        }
        if (this.staleMatchCountDecorationType) {
            editor.setDecorations(this.staleMatchCountDecorationType, []);
        }

        // Apply the appropriate decorations
        if (noMatchType) {
            editor.setDecorations(noMatchType, noMatchDecorations);
        }
        // Insert the triangle before the count at the same end-of-line position.
        editor.setDecorations(this.scanStatusDecorationType, notes);
        if (matchCountType) {
            editor.setDecorations(matchCountType, matchCountDecorations);
        }
    }

    /**
     * Triggers a decoration update with optional debouncing.
     *
     * @param editor - The text editor to update
     * @param throttle - Whether to debounce the update
     * @param reason - Optional reason for the update (for logging)
     */
    public triggerUpdateDecorations(editor: vscode.TextEditor, throttle: boolean = false, reason?: string): void {
        this.cancelEditorUpdate(editor);

        const run = () => {
            if (reason) log('Decoration update triggered by: ' + reason);
            void this.updateDecorations(editor);
        };
        if (throttle) {
            const debounceMs = vscode.workspace.getConfiguration('ignorelens').get<number>('scanDebounceMs', 500);
            const update = { timeout: setTimeout(run, debounceMs) };
            this.updates.set(editor, update);
        } else {
            run();
        }
    }

    private cancelEditorUpdate(editor: vscode.TextEditor): void {
        const update = this.updates.get(editor);
        if (!update) return;
        clearTimeout(update.timeout);
        this.updates.delete(editor);
        this.clearProgress(editor, update);
    }

    public retainEditors(editors: readonly vscode.TextEditor[]): void {
        const visible = new Set(editors);
        for (const editor of this.updates.keys()) {
            if (!visible.has(editor)) this.cancelEditorUpdate(editor);
        }
    }

    public cancelUpdate(): void {
        this.retainEditors([]);
        this.workspaceScanner.cancelScans();
    }


    /**
     * Disposes of the decoration provider.
     */
    public dispose(): void {
        this.cancelUpdate();
        this.scanStatusDecorationType.dispose();
        if (this.noMatchDecorationType) {
            this.noMatchDecorationType.dispose();
        }

        if (this.matchCountDecorationType) {
            this.matchCountDecorationType.dispose();
        }

        if (this.staleNoMatchDecorationType) {
            this.staleNoMatchDecorationType.dispose();
        }

        if (this.staleMatchCountDecorationType) {
            this.staleMatchCountDecorationType.dispose();
        }

    }
}
