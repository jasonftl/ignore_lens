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
        // Handle trailing spaces: trim unless escaped with backslash
        let processedLine = line;

        // Remove trailing spaces unless escaped
        if (processedLine.endsWith('\\ ')) {
            // Trailing space is escaped - keep it but remove the backslash
            processedLine = processedLine.slice(0, -2) + ' ';
        } else {
            // Trim trailing whitespace only
            processedLine = processedLine.replace(/\s+$/, '');
        }

        // Trim leading spaces for comment/blank detection
        // (practical UX - indented comments are common in ignore files)
        const trimmedLine = processedLine.trimStart();

        // Check for blank lines (after processing)
        if (trimmedLine === '') {
            const result: ParsedLine = {
                type: 'blank' as LineType,
                pattern: '',
                isNegation: false,
                isDirectory: false,
                rawText: line
            };
            return result;
        }

        // Check for comments (lines starting with #, but not \#)
        // Use trimmedLine to allow indented comments
        if (trimmedLine.startsWith('#')) {
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
        if (trimmedLine.startsWith('\\#')) {
            processedLine = trimmedLine.substring(1);  // Remove the backslash
        } else {
            processedLine = trimmedLine;  // Use trimmed version for patterns
        }

        // Check for negation (lines starting with !, but not \!)
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
