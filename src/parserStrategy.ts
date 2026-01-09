// Date: 05/01/2026
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
    // All gitignore-style files use the same parser
    return new GitignoreParser();
}
