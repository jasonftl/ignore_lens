// Date: 04/01/2026
// Handles gitignore pattern matching logic using the ignore package
// Falls back to minimatch for character class patterns without wildcards

import ignore, { Ignore } from 'ignore';
import { minimatch } from 'minimatch';
import { MatchResult } from './types';

/**
 * Checks if a pattern contains unescaped character classes (e.g., [abc], [a-z])
 * but no wildcards (* or **).
 * The 'ignore' package doesn't match these patterns correctly without wildcards.
 *
 * @param pattern - The gitignore pattern to check
 * @returns true if pattern needs minimatch fallback
 */
function needsMinimatchFallback(pattern: string): boolean {
    // Remove negation prefix if present (but not escaped \!)
    const isNegation = pattern.startsWith('!') && !pattern.startsWith('\\!');
    const cleanPattern = isNegation ? pattern.substring(1) : pattern;

    // Check for wildcards - if present, ignore package handles it fine
    if (cleanPattern.includes('*')) {
        return false;
    }

    // Check for unescaped character classes [...]
    // Must find [ that isn't preceded by \, followed by ], also not preceded by \
    const hasCharacterClass = /(?<!\\)\[.*?(?<!\\)\]/.test(cleanPattern);

    return hasCharacterClass;
}

/**
 * Matches files using minimatch for character class patterns.
 * Uses matchBase option so patterns match anywhere in the path.
 *
 * @param pattern - The gitignore pattern (without negation prefix)
 * @param files - Array of file paths to match against
 * @returns Array of matching file paths
 */
function matchWithMinimatch(pattern: string, files: string[]): string[] {
    const matchingFiles: string[] = [];

    for (const file of files) {
        // Try matching with matchBase (pattern matches basename)
        const matchesBase = minimatch(file, pattern, { matchBase: true });
        // Also try matching the full path
        const matchesFull = minimatch(file, pattern);

        if (matchesBase || matchesFull) {
            matchingFiles.push(file);
        }
    }

    return matchingFiles;
}

/**
 * Matcher for gitignore patterns.
 * Uses the 'ignore' package to test patterns against file paths.
 */
export class PatternMatcher {
    /**
     * Finds all files that match the given gitignore pattern.
     *
     * @param pattern - The gitignore pattern to match against
     * @param files - Array of file paths (relative, with forward slashes)
     * @returns MatchResult containing matched files
     */
    public findMatches(pattern: string, files: string[]): MatchResult {
        // Check for negation (! prefix) but not escaped \! which is a literal !
        const isNegation = pattern.startsWith('!') && !pattern.startsWith('\\!');
        const cleanPattern = isNegation ? pattern.substring(1) : pattern;

        let matchingFiles: string[] = [];

        // Check if this pattern needs minimatch fallback (character class without wildcards)
        if (needsMinimatchFallback(pattern)) {
            // Use minimatch for character class patterns like [a].ts
            matchingFiles = matchWithMinimatch(cleanPattern, files);
        } else {
            // Use the ignore package for standard patterns
            const ig: Ignore = ignore();
            ig.add(cleanPattern);

            for (const file of files) {
                // The ignores() method returns true if the file matches the pattern
                const matches = ig.ignores(file);
                if (matches) {
                    matchingFiles.push(file);
                }
            }
        }

        const result: MatchResult = {
            pattern: pattern,
            matchingFiles: matchingFiles,
            isNegation: isNegation
        };
        return result;
    }

    /**
     * Tests if a single file matches the pattern.
     *
     * @param pattern - The gitignore pattern
     * @param filePath - The file path to test
     * @returns true if the file matches the pattern
     */
    public testMatch(pattern: string, filePath: string): boolean {
        // Check for negation (! prefix) but not escaped \! which is a literal !
        const isNegation = pattern.startsWith('!') && !pattern.startsWith('\\!');
        const cleanPattern = isNegation ? pattern.substring(1) : pattern;

        // Check if this pattern needs minimatch fallback (character class without wildcards)
        if (needsMinimatchFallback(pattern)) {
            // Use minimatch for character class patterns like [a].ts
            const matchesBase = minimatch(filePath, cleanPattern, { matchBase: true });
            const matchesFull = minimatch(filePath, cleanPattern);
            return matchesBase || matchesFull;
        }

        // Use the ignore package for standard patterns
        const ig: Ignore = ignore();
        ig.add(cleanPattern);

        const matches = ig.ignores(filePath);
        return matches;
    }
}
