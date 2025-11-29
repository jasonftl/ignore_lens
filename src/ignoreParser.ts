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
     *
     * @param line - The raw line text from the ignore file
     * @returns ParsedLine with type and pattern information
     */
    public parseLine(line: string): ParsedLine {
        const trimmedLine = line.trim();

        // Check for blank lines
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

        // Check for comments (lines starting with #)
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

        // This is a pattern
        const isNegation = trimmedLine.startsWith('!');
        const isDirectory = trimmedLine.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: trimmedLine,
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
