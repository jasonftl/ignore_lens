// Date: 04/01/2026
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
        // per gitignore spec. Unescaping here would cause the pattern matcher to
        // misinterpret !file as negation when \!file means literal "!file".
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
