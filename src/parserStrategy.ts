// Date: 24/04/2026
// Strategy pattern for parsing different ignore file types
// Gitignore and vscodeignore have different whitespace handling rules

import { posix } from 'node:path';
import { compileHelmPattern } from './helmPattern';
import { LineType, ParsedLine, IgnoreFileType } from './types';

/**
 * Interface for ignore file line parsers.
 */
export interface ILineParser {
    parseLine(line: string): ParsedLine;
}

export function parseFile(parser: ILineParser, content: string): ParsedLine[] {
    const processedContent = content.charCodeAt(0) === 0xFEFF ? content.substring(1) : content;
    return processedContent.split(/\r?\n/).map(line => parser.parseLine(line));
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
        // Leave escaped spaces for the matching engine.
        const processedLine = line.replace(/(?<!\\)(?:\\\\)* +$/, suffix => suffix.trimEnd());

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

        patternPart = posix.normalize(patternPart.trim()).replace(/^\/+|\/+$/g, '');
        const isDirectory = false;
        if (!patternPart || patternPart === '.') {
            return { type: 'blank', pattern: '', isNegation: false, isDirectory, rawText: line };
        }

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

}

/**
 * Parser for .cvsignore files.
 * Simple glob patterns with no # comments and no negation support.
 * Whitespace separates patterns. A lone ! token clears the ignore list.
 * Patterns only match in the current directory (root-level only).
 */
export class CvsignoreParser implements ILineParser {
    /**
     * Parses a single line from a cvsignore file.
     * The # character and a ! within a filename are literal.
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

        const isDirectory = processedLine.endsWith('/');

        const result: ParsedLine = {
            type: 'pattern' as LineType,
            pattern: processedLine,
            tokens: processedLine.split(/\s+/),
            isNegation: false,  // Never treat as negation
            isDirectory: isDirectory,
            rawText: line
        };
        return result;
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

        // A leading escaped hash is a literal, even on Windows.
        if (patternPart.startsWith('\\#')) {
            patternPart = '\\' + patternPart.slice(1).replace(/\\/g, '/');
        } else {
            patternPart = patternPart.replace(/\\/g, '/');
        }

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

}

export function getGcloudIncludeName(line: string): string | undefined {
    return /^#\s*!include:(.*)$/.exec(line)?.[1];
}

export function isGcloudIncludeName(name: string): boolean {
    return name !== '' && name !== '.' && name !== '..' && !/[/\\:\0]/.test(name);
}

export function getParser(fileType: IgnoreFileType): ILineParser {
    switch (fileType) {
        case 'vscodeignore': return new VscodeignoreParser();
        case 'npmignore': {
            const parser = new VscodeignoreParser();
            return {
                parseLine(line) {
                    const rule = parser.parseLine(line);
                    rule.isNegation = ((/^!+/.exec(rule.pattern)?.[0].length ?? 0) % 2) === 1;
                    return rule;
                }
            };
        }
        case 'helmignore': {
            const parser = new VscodeignoreParser();
            return {
                parseLine(line) {
                    const rule = parser.parseLine(line);
                    if (rule.type === 'pattern') {
                        if (rule.pattern.includes('**')) {
                            rule.warning = 'Helm does not support the ** wildcard.';
                        } else if (!compileHelmPattern(rule.pattern)) {
                            rule.warning = 'Invalid Helm ignore pattern.';
                        }
                        // A Helm ! rule excludes non-matches and never restores files.
                        rule.isNegation = false;
                    }
                    return rule;
                }
            };
        }
        case 'gcloudignore': {
            const parser = new GitignoreParser();
            return {
                parseLine(line) {
                    const name = getGcloudIncludeName(line);
                    if (name === undefined) return parser.parseLine(line);
                    return { type: 'include', pattern: name, isNegation: false, isDirectory: false, rawText: line };
                }
            };
        }
        case 'glob-no-negation': return new GlobNoNegationParser();
        case 'bazelignore': return {
            parseLine(line) {
                const type = line === '' ? 'blank' : line.startsWith('#') ? 'comment' : 'pattern';
                return { type, pattern: type === 'pattern' ? line : '', isNegation: false, isDirectory: line.endsWith('/'), rawText: line };
            }
        };
        case 'tfignore':
        case 'p4ignore': return new P4ignoreParser();
        case 'dockerignore': return new DockerignoreParser();
        case 'cvsignore': return new CvsignoreParser();
        default: return new GitignoreParser();
    }
}
