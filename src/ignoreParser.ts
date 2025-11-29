// Date: 29/11/2025
// Parses ignore file lines to identify patterns, comments, and blank lines

import { LineType, ParsedLine } from './types';

/**
 * Parser for ignore file lines.
 * Identifies line types (pattern, comment, blank) and extracts pattern information.
 */
export class IgnoreParser {
    /**
     * Parses a single line from an ignore file.
     * Handles gitignore escape rules for \#, \!, and trailing spaces.
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        // Handle trailing whitespace: trim unless escaped with backslash
        // Gitignore allows \<space> or \<tab> to preserve trailing whitespace
        let processedLine = line;

        // Check for escaped trailing whitespace (backslash followed by space or tab at end)
        const trailingEscapeMatch = processedLine.match(/\\([ \t])$/);
        if (trailingEscapeMatch) {
            // Remove backslash but keep the whitespace character
            processedLine = processedLine.slice(0, -2) + trailingEscapeMatch[1];
        } else {
            // Trim trailing whitespace only
            processedLine = processedLine.replace(/\s+$/, '');
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

        // Handle escaped # at start (literal # filename)
        if (processedLine.startsWith('\\#')) {
            processedLine = processedLine.substring(1);  // Remove the backslash, keep #
        }

        // Check for negation (lines starting with !, but not \!)
        // Leading spaces before ! are significant - " !file" is a pattern for " !file"
        let isNegation = false;
        if (processedLine.startsWith('!')) {
            isNegation = true;
        } else if (processedLine.startsWith('\\!')) {
            // Escaped ! - literal ! filename, remove backslash
            processedLine = processedLine.substring(1);
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
        const lines = content.split(/\r?\n/);
        const parsedLines: ParsedLine[] = [];

        for (const line of lines) {
            const parsed = this.parseLine(line);
            parsedLines.push(parsed);
        }

        return parsedLines;
    }
}
