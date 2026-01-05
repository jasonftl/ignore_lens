// Date: 05/01/2026
// Strategy pattern for pattern matching in different ignore file types
// Gitignore uses fnmatch with basename matching; vscodeignore uses minimatch without

import ignore, { Ignore } from 'ignore';
import { minimatch } from 'minimatch';
import { MatchResult, IgnoreFileType } from './types';

/**
 * Interface for pattern matchers.
 */
export interface IPatternMatcher {
    findMatches(pattern: string, files: string[]): MatchResult;
    testMatch(pattern: string, filePath: string): boolean;
}

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
 * Uses matchBase option so patterns match anywhere in the path (gitignore behaviour).
 * Handles anchored patterns (leading /) by restricting matches to root-level files.
 *
 * @param pattern - The gitignore pattern (without negation prefix)
 * @param files - Array of file paths to match against
 * @returns Array of matching file paths
 */
function matchWithMinimatchBasename(pattern: string, files: string[]): string[] {
    const matchingFiles: string[] = [];

    // ISSUE-M009 fix: Handle anchored patterns (leading /)
    // Git treats /pattern as matching only at root level
    const isAnchored = pattern.startsWith('/');
    const cleanPattern = isAnchored ? pattern.substring(1) : pattern;

    for (const file of files) {
        // For anchored patterns, only match root-level files (no / in path)
        if (isAnchored) {
            const isRootLevel = !file.includes('/');
            if (!isRootLevel) {
                continue;  // Skip non-root files for anchored patterns
            }
            // Match against cleaned pattern (without leading /)
            const matches = minimatch(file, cleanPattern);
            if (matches) {
                matchingFiles.push(file);
            }
        } else {
            // Non-anchored: try matching with matchBase (pattern matches basename)
            const matchesBase = minimatch(file, cleanPattern, { matchBase: true });
            // Also try matching the full path
            const matchesFull = minimatch(file, cleanPattern);

            if (matchesBase || matchesFull) {
                matchingFiles.push(file);
            }
        }
    }

    return matchingFiles;
}

/**
 * Matcher for .gitignore patterns.
 * Uses the 'ignore' package to test patterns against file paths.
 * Falls back to minimatch for character class patterns without wildcards.
 */
export class GitignoreMatcher implements IPatternMatcher {
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
            matchingFiles = matchWithMinimatchBasename(cleanPattern, files);
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
        let cleanPattern = isNegation ? pattern.substring(1) : pattern;

        // Check if this pattern needs minimatch fallback (character class without wildcards)
        if (needsMinimatchFallback(pattern)) {
            // ISSUE-M009 fix: Handle anchored patterns (leading /)
            const isAnchored = cleanPattern.startsWith('/');
            if (isAnchored) {
                cleanPattern = cleanPattern.substring(1);
                // Anchored patterns only match root-level files
                const isRootLevel = !filePath.includes('/');
                if (!isRootLevel) {
                    return false;
                }
                return minimatch(filePath, cleanPattern);
            }

            // Non-anchored: use minimatch for character class patterns like [a].ts
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

/**
 * Matcher for .vscodeignore patterns.
 * Uses pure minimatch with { dot: true }.
 * NO recursive basename matching - *.log only matches root level.
 * Auto-expands folder/ to folder/** before matching.
 */
export class VscodeignoreMatcher implements IPatternMatcher {
    /**
     * Expands a folder pattern to include all contents.
     * vsce does: patterns like "folder/" become "folder/**"
     * Also handles patterns without trailing slash if they don't contain wildcards.
     *
     * @param pattern - The original pattern
     * @returns Expanded pattern or original if no expansion needed
     */
    private expandFolderPattern(pattern: string): string {
        // If pattern ends with /, expand to /**
        if (pattern.endsWith('/')) {
            return pattern + '**';
        }
        return pattern;
    }

    /**
     * Finds all files that match the given vscodeignore pattern.
     * Uses minimatch without matchBase - patterns are strict.
     *
     * @param pattern - The vscodeignore pattern to match against
     * @param files - Array of file paths (relative, with forward slashes)
     * @returns MatchResult containing matched files
     */
    public findMatches(pattern: string, files: string[]): MatchResult {
        // Check for negation (! prefix)
        const isNegation = pattern.startsWith('!');
        let cleanPattern = isNegation ? pattern.substring(1) : pattern;

        // Auto-expand folder patterns: folder/ becomes folder/**
        cleanPattern = this.expandFolderPattern(cleanPattern);

        const matchingFiles: string[] = [];

        for (const file of files) {
            // NO matchBase option - *.log only matches root level
            // Use { dot: true } to match dotfiles
            const matches = minimatch(file, cleanPattern, { dot: true });
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
     * @param pattern - The vscodeignore pattern
     * @param filePath - The file path to test
     * @returns true if the file matches the pattern
     */
    public testMatch(pattern: string, filePath: string): boolean {
        // Check for negation (! prefix)
        const isNegation = pattern.startsWith('!');
        let cleanPattern = isNegation ? pattern.substring(1) : pattern;

        // Auto-expand folder patterns
        cleanPattern = this.expandFolderPattern(cleanPattern);

        // NO matchBase option - strict matching
        const matches = minimatch(filePath, cleanPattern, { dot: true });
        return matches;
    }
}

/**
 * Factory function to get the appropriate matcher for a file type.
 *
 * @param fileType - The type of ignore file
 * @returns Matcher instance for that file type
 */
export function getMatcher(fileType: IgnoreFileType): IPatternMatcher {
    if (fileType === 'vscodeignore') {
        return new VscodeignoreMatcher();
    }
    return new GitignoreMatcher();
}
