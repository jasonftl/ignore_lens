// Date: 24/04/2026
// Strategy pattern for parsing different ignore file types
// Gitignore and vscodeignore have different whitespace handling rules

import { LineType, ParsedLine, IgnoreFileType } from './types';

/**
 * Interface for ignore file line parsers.
 */
export interface ILineParser {
    parseLine(line: string): ParsedLine;
    parseFile(content: string): ParsedLine[];
}

/**
 * Parser for .gitignore files.
 * Preserves leading whitespace, only trims trailing spaces (not tabs).
 * Handles escape sequences for trailing whitespace.
 */
export class GitignoreParser implements ILineParser {
    /**
     * Parses a single line from a gitignore file.
     * Handles gitignore escape rules for \#, \!, and trailing spaces.
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // Handle trailing whitespace: trim unless escaped with backslash
        // Gitignore allows \<space> or \<tab> to preserve trailing whitespace
        // Multiple escaped spaces are supported: "file\ \ \ " becomes "file   "
        let processedLine = line;

        // Check for escaped trailing whitespace (one or more backslash+space/tab sequences at end)
        // Pattern: (\\[ \t])+ at end of string
        const trailingEscapeMatch = processedLine.match(/((?:\\[ \t])+)$/);
        if (trailingEscapeMatch) {
            // Extract the escaped sequence and remove backslashes, keeping whitespace
            const escapedPart = trailingEscapeMatch[1];
            const preservedWhitespace = escapedPart.replace(/\\/g, '');
            processedLine = processedLine.slice(0, -escapedPart.length) + preservedWhitespace;
        } else {
            // Trim trailing spaces only (gitignore preserves trailing tabs)
            processedLine = processedLine.replace(/ +$/, '');
        }

        // Check for blank lines (after trailing space processing)
        if (processedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for comments - only unescaped # at the very start of line
        // (gitignore spec: comments must start with # at position 0)
        if (processedLine.startsWith('#')) {
            const result: ParsedLine = {
                type: 'comment' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for negation (lines starting with !, but not \!)
        // Leading spaces before ! are significant - " !file" is a pattern for " !file"
        // Note: We do NOT unescape \! or \# here - let the ignore library handle them
        let isNegation = false;
        if (processedLine.startsWith('!') && !processedLine.startsWith('\\!')) {
            isNegation = true;
        }

        // This is a pattern
        const isDirectory = processedLine.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: processedLine,
            isNegation: isNegation,
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
    }

    /**
     * Parses an entire ignore file content.
     *
     * @param content - The full content of an ignore file
     * @returns Array of ParsedLine objects
     */
    public parseFile(content: string): ParsedLine[] {
        // Strip UTF-8 BOM if present (common on Windows-authored files)
        let processedContent = content;
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.substring(1);
        }

        const lines = processedContent.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}

/**
 * Parser for .vscodeignore files.
 * Uses .trim() on every line (trims leading AND trailing whitespace including tabs).
 * This matches the vsce tool's parsing behaviour.
 */
export class VscodeignoreParser implements ILineParser {
    /**
     * Parses a single line from a vscodeignore file.
     * Simply trims all whitespace - no escape handling needed.
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // vscodeignore uses .trim() on every line
        const processedLine = line.trim();

        // Check for blank lines
        if (processedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for comments - # at start (after trimming)
        // vsce uses: .filter(i => !/^\s*#/.test(i))
        // Since we already trimmed, just check startsWith('#')
        if (processedLine.startsWith('#')) {
            const result: ParsedLine = {
                type: 'comment' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for negation (lines starting with !)
        // vscodeignore also uses ! for negation
        let isNegation = false;
        if (processedLine.startsWith('!')) {
            isNegation = true;
        }

        // This is a pattern
        const isDirectory = processedLine.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: processedLine,
            isNegation: isNegation,
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
    }

    /**
     * Parses an entire ignore file content.
     *
     * @param content - The full content of an ignore file
     * @returns Array of ParsedLine objects
     */
    public parseFile(content: string): ParsedLine[] {
        // Strip UTF-8 BOM if present (common on Windows-authored files)
        let processedContent = content;
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.substring(1);
        }

        const lines = processedContent.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}

/**
 * Parser for glob-style files without negation support.
 * Like VscodeignoreParser but treats ! as a literal character, not negation.
 * Used for .bzrignore, .chefignore and similar formats.
 */
export class GlobNoNegationParser implements ILineParser {
    /**
     * Parses a single line from a glob file without negation support.
     * Lines starting with ! are treated as literal patterns.
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // Trim all whitespace like vscodeignore
        const processedLine = line.trim();

        // Check for blank lines
        if (processedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for comments - # at start (after trimming)
        if (processedLine.startsWith('#')) {
            const result: ParsedLine = {
                type: 'comment' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // This is a pattern - ! is treated as literal, NOT negation
        const isDirectory = processedLine.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: processedLine,
            isNegation: false,  // Never treat as negation
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
    }

    /**
     * Parses an entire ignore file content.
     *
     * @param content - The full content of an ignore file
     * @returns Array of ParsedLine objects
     */
    public parseFile(content: string): ParsedLine[] {
        // Strip UTF-8 BOM if present (common on Windows-authored files)
        let processedContent = content;
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.substring(1);
        }

        const lines = processedContent.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}

/**
 * Parser for .tfignore files (Team Foundation Version Control).
 * Like GitignoreParser but uses \ as the root anchor instead of /.
 * Converts \pattern to /pattern for compatibility with GitignoreMatcher.
 */
export class TfignoreParser implements ILineParser {
    /**
     * Parses a single line from a tfignore file.
     * Handles trailing whitespace like gitignore, converts \ anchors to / anchors.
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // Handle trailing whitespace like gitignore
        let processedLine = line;

        // Check for escaped trailing whitespace
        const trailingEscapeMatch = processedLine.match(/((?:\\[ \t])+)$/);
        if (trailingEscapeMatch) {
            const escapedPart = trailingEscapeMatch[1];
            const preservedWhitespace = escapedPart.replace(/\\/g, '');
            processedLine = processedLine.slice(0, -escapedPart.length) + preservedWhitespace;
        } else {
            // Trim trailing spaces only
            processedLine = processedLine.replace(/ +$/, '');
        }

        // Check for blank lines
        if (processedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for comments - # at start
        if (processedLine.startsWith('#')) {
            const result: ParsedLine = {
                type: 'comment' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for negation (lines starting with !)
        let isNegation = false;
        let patternStart = 0;
        if (processedLine.startsWith('!')) {
            isNegation = true;
            patternStart = 1;
        }

        // Get the pattern part (after negation prefix if present)
        let patternPart = processedLine.substring(patternStart);

        // Convert leading \ to / for root-only anchoring
        // In tfignore: \*.txt = root only; in gitignore format: /*.txt = root only
        if (patternPart.startsWith('\\')) {
            patternPart = '/' + patternPart.substring(1);
        }

        // Convert any remaining backslashes in paths to forward slashes
        // This handles patterns like ProjA\*.cpp → ProjA/*.cpp
        patternPart = patternPart.replace(/\\/g, '/');

        // Reconstruct the full pattern with negation prefix if needed
        const finalPattern = isNegation ? '!' + patternPart : patternPart;

        const isDirectory = patternPart.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: finalPattern,
            isNegation: isNegation,
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
    }

    /**
     * Parses an entire ignore file content.
     *
     * @param content - The full content of an ignore file
     * @returns Array of ParsedLine objects
     */
    public parseFile(content: string): ParsedLine[] {
        // Strip UTF-8 BOM if present
        let processedContent = content;
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.substring(1);
        }

        const lines = processedContent.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}

/**
 * Parser for .dockerignore files.
 * Like VscodeignoreParser but strips leading and trailing / from patterns.
 * Docker's CLI uses Go's filepath.Clean which disregards leading/trailing slashes.
 */
export class DockerignoreParser implements ILineParser {
    /**
     * Parses a single line from a dockerignore file.
     * Strips leading and trailing / from patterns after handling negation.
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // Trim all whitespace like vscodeignore
        const processedLine = line.trim();

        // Check for blank lines
        if (processedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for comments - # at start (after trimming)
        if (processedLine.startsWith('#')) {
            const result: ParsedLine = {
                type: 'comment' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for negation (lines starting with !)
        let isNegation = false;
        let patternPart = processedLine;
        if (processedLine.startsWith('!')) {
            isNegation = true;
            patternPart = processedLine.substring(1);
        }

        // Strip leading / (Docker disregards it - /pattern = pattern)
        if (patternPart.startsWith('/')) {
            patternPart = patternPart.substring(1);
        }

        // Check for directory pattern (trailing /)
        // Do NOT strip trailing / - VscodeignoreMatcher.expandFolderPattern() needs it
        const isDirectory = patternPart.endsWith('/');

        // Reconstruct the full pattern with negation prefix if needed
        const finalPattern = isNegation ? '!' + patternPart : patternPart;

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: finalPattern,
            isNegation: isNegation,
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
    }

    /**
     * Parses an entire ignore file content.
     *
     * @param content - The full content of an ignore file
     * @returns Array of ParsedLine objects
     */
    public parseFile(content: string): ParsedLine[] {
        // Strip UTF-8 BOM if present
        let processedContent = content;
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.substring(1);
        }

        const lines = processedContent.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}

/**
 * Parser for .cvsignore files.
 * Simple glob patterns with no # comments and no negation support.
 * A lone ! clears the ignore list (skipped for IgnoreLens).
 * Patterns only match in the current directory (root-level only).
 */
export class CvsignoreParser implements ILineParser {
    /**
     * Parses a single line from a cvsignore file.
     * No comments (# is literal), no negation (! is literal or skip if alone).
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // Trim all whitespace
        const processedLine = line.trim();

        // Check for blank lines
        if (processedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // A lone ! clears the ignore list - treat as blank/skip for IgnoreLens
        if (processedLine === '!') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // No # comments in cvsignore - # is treated as literal
        // No negation - ! is treated as literal (part of the pattern)
        const isDirectory = processedLine.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: processedLine,
            isNegation: false,  // Never treat as negation
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
    }

    /**
     * Parses an entire ignore file content.
     *
     * @param content - The full content of an ignore file
     * @returns Array of ParsedLine objects
     */
    public parseFile(content: string): ParsedLine[] {
        // Strip UTF-8 BOM if present
        let processedContent = content;
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.substring(1);
        }

        const lines = processedContent.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}

/**
 * Parser for .p4ignore files (Perforce).
 * P4 uses leading `/` or `\` as the root anchor (relative to the ignore file's
 * directory). Rules without path separators are applied recursively.
 * Leading `\` is converted to `/` so GitignoreMatcher can honour the anchor;
 * other `\` in paths are converted to `/` so Windows-authored rules work.
 * Comment (`#`) and negation (`!`) syntax matches gitignore.
 */
export class P4ignoreParser implements ILineParser {
    /**
     * Parses a single line from a p4ignore file.
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // Handle trailing whitespace like gitignore
        let processedLine = line;

        const trailingEscapeMatch = processedLine.match(/((?:\\[ \t])+)$/);
        if (trailingEscapeMatch) {
            const escapedPart = trailingEscapeMatch[1];
            const preservedWhitespace = escapedPart.replace(/\\/g, '');
            processedLine = processedLine.slice(0, -escapedPart.length) + preservedWhitespace;
        } else {
            // Trim trailing spaces only
            processedLine = processedLine.replace(/ +$/, '');
        }

        // Check for blank lines
        if (processedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for comments - # at start
        if (processedLine.startsWith('#')) {
            const result: ParsedLine = {
                type: 'comment' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for negation (lines starting with !)
        let isNegation = false;
        let patternStart = 0;
        if (processedLine.startsWith('!')) {
            isNegation = true;
            patternStart = 1;
        }

        let patternPart = processedLine.substring(patternStart);

        // Convert leading \ to / (P4 Windows root anchor); leading / is already
        // the gitignore root anchor and needs no conversion.
        if (patternPart.startsWith('\\')) {
            patternPart = '/' + patternPart.substring(1);
        }

        // Convert any remaining backslashes in paths to forward slashes
        patternPart = patternPart.replace(/\\/g, '/');

        const finalPattern = isNegation ? '!' + patternPart : patternPart;
        const isDirectory = patternPart.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: finalPattern,
            isNegation: isNegation,
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
    }

    /**
     * Parses an entire ignore file content.
     *
     * @param content - The full content of an ignore file
     * @returns Array of ParsedLine objects
     */
    public parseFile(content: string): ParsedLine[] {
        // Strip UTF-8 BOM if present
        let processedContent = content;
        if (processedContent.charCodeAt(0) === 0xFEFF) {
            processedContent = processedContent.substring(1);
        }

        const lines = processedContent.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}

/**
 * Factory function to get the appropriate parser for a file type.
 * All gitignore-style files (see supportedFiles.ts) use the same parser.
 *
 * @param fileType - The semantic type of ignore file
 * @returns Parser instance for that file type
 */
export function getParser(fileType: IgnoreFileType): ILineParser {
    if (fileType === 'vscodeignore') {
        return new VscodeignoreParser();
    }
    if (fileType === 'glob-no-negation') {
        return new GlobNoNegationParser();
    }
    if (fileType === 'tfignore') {
        return new TfignoreParser();
    }
    if (fileType === 'dockerignore') {
        return new DockerignoreParser();
    }
    if (fileType === 'cvsignore') {
        return new CvsignoreParser();
    }
    if (fileType === 'p4ignore') {
        return new P4ignoreParser();
    }
    // All gitignore-style files use the same parser
    return new GitignoreParser();
}
