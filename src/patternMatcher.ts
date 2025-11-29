// Date: 29/11/2025
// Handles gitignore pattern matching logic using the ignore package

import ignore, { Ignore } from 'ignore';
import { MatchResult } from './types';

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
        const isNegation = pattern.startsWith('!');
        const cleanPattern = isNegation ? pattern.substring(1) : pattern;

        // Create an ignore instance with just this pattern
        const ig: Ignore = ignore();
        ig.add(cleanPattern);

        // Find files that would be ignored by this pattern
        const matchingFiles: string[] = [];

        for (const file of files) {
            // The ignores() method returns true if the file matches the pattern
            const matches = ig.ignores(file);
            if (matches) {
                matchingFiles.push(file);
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
        const isNegation = pattern.startsWith('!');
        const cleanPattern = isNegation ? pattern.substring(1) : pattern;

        const ig: Ignore = ignore();
        ig.add(cleanPattern);

        const matches = ig.ignores(filePath);
        return matches;
    }
}
