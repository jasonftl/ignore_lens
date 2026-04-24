// Date: 24/04/2026
// Strategy pattern for pattern matching in different ignore file types
// Gitignore uses fnmatch with basename matching; vscodeignore uses minimatch without

import ignore, { Ignore } from 'ignore';
import { minimatch, Minimatch } from 'minimatch';
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

    // Check for negated character classes [^...] or [!...]
    // These MUST use minimatch because the ignore package inverts them
    const hasNegatedCharClass = /(?<!\\)\[[\^!]/.test(cleanPattern);
    if (hasNegatedCharClass) {
        return true;
    }

    // For non-negated patterns with unescaped wildcards, ignore package handles it fine
    // Must check for unescaped * (not preceded by \)
    const hasUnescapedWildcard = /(?<!\\)\*/.test(cleanPattern);
    if (hasUnescapedWildcard) {
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
 * Handles anchored patterns (leading /) by matching from the root.
 *
 * ISSUE-M025 optimisation: the pattern is compiled once into a Minimatch instance
 * (or a pair of instances for the non-anchored matchBase + full-path case) before
 * iterating files, avoiding one regex compilation per file.
 *
 * @param pattern - The gitignore pattern (without negation prefix)
 * @param files - Array of file paths to match against
 * @returns Array of matching file paths
 */
function matchWithMinimatchBasename(pattern: string, files: string[]): string[] {
    const matchingFiles: string[] = [];

    // ISSUE-M009 fix: Handle anchored patterns (leading /)
    // Git treats /pattern as matching from the root
    const isAnchored = pattern.startsWith('/');
    const cleanPattern = isAnchored ? pattern.substring(1) : pattern;

    // ISSUE-M012 fix: Check if anchored pattern contains subpath
    // /[ab].txt should only match root-level files
    // /[ab]/file.txt should match a/file.txt or b/file.txt
    const anchoredHasSubpath = isAnchored && cleanPattern.includes('/');

    // Compile once, reuse for every file (ISSUE-M025)
    // ISSUE-M018 fix: Use { dot: true } to match dotfiles
    if (isAnchored && !anchoredHasSubpath) {
        // Simple anchored pattern: only test root-level files against cleaned pattern
        const rootMatcher = new Minimatch(cleanPattern, { dot: true });
        for (const file of files) {
            if (file.includes('/')) {
                continue;  // Skip non-root files for simple anchored patterns
            }
            if (rootMatcher.match(file)) {
                matchingFiles.push(file);
            }
        }
    } else if (isAnchored) {
        // Anchored with subpath: match against full path
        const fullMatcher = new Minimatch(cleanPattern, { dot: true });
        for (const file of files) {
            if (fullMatcher.match(file)) {
                matchingFiles.push(file);
            }
        }
    } else {
        // Non-anchored: combine basename and full-path matching
        const baseMatcher = new Minimatch(cleanPattern, { matchBase: true, dot: true });
        const fullMatcher = new Minimatch(cleanPattern, { dot: true });
        for (const file of files) {
            if (baseMatcher.match(file) || fullMatcher.match(file)) {
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
                // ISSUE-M012 fix: Check if anchored pattern contains subpath
                const anchoredHasSubpath = cleanPattern.includes('/');
                if (anchoredHasSubpath) {
                    // Pattern has subpath structure, match against full path
                    // ISSUE-M018 fix: Use { dot: true } to match dotfiles
                    return minimatch(filePath, cleanPattern, { dot: true });
                } else {
                    // Pattern has no subpath, only match root-level files
                    const isRootLevel = !filePath.includes('/');
                    if (!isRootLevel) {
                        return false;
                    }
                    // ISSUE-M018 fix: Use { dot: true } to match dotfiles
                    return minimatch(filePath, cleanPattern, { dot: true });
                }
            }

            // Non-anchored: use minimatch for character class patterns like [a].ts
            // ISSUE-M018 fix: Use { dot: true } to match dotfiles
            const matchesBase = minimatch(filePath, cleanPattern, { matchBase: true, dot: true });
            const matchesFull = minimatch(filePath, cleanPattern, { dot: true });
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
     * ISSUE-M025 optimisation: compile the pattern into a Minimatch instance once
     * and reuse it across every file in the workspace.
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

        // Compile once, reuse for every file (ISSUE-M025)
        // NO matchBase option - *.log only matches root level
        // Use { dot: true } to match dotfiles
        // Use { nonegate: true } so literal ! in patterns (e.g. from bzrignore) isn't treated as negation
        // (We handle negation ourselves by stripping the ! prefix above)
        const matcher = new Minimatch(cleanPattern, { dot: true, nonegate: true });

        for (const file of files) {
            if (matcher.match(file)) {
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
        // Use { nonegate: true } so literal ! in patterns isn't treated as negation
        const matches = minimatch(filePath, cleanPattern, { dot: true, nonegate: true });
        return matches;
    }
}

/**
 * Matcher for files that never treat ! as negation (bzrignore, chefignore, cvsignore).
 * Uses pure minimatch with { dot: true, nonegate: true, nocomment: true }.
 * The ! character at the start of a pattern matches a literal ! in filenames.
 * The # character at the start of a pattern matches a literal # in filenames (cvsignore).
 */
export class GlobNoNegationMatcher implements IPatternMatcher {
    /**
     * Expands a folder pattern to include all contents.
     * folder/ becomes folder/**
     *
     * @param pattern - The original pattern
     * @returns Expanded pattern or original if no expansion needed
     */
    private expandFolderPattern(pattern: string): string {
        if (pattern.endsWith('/')) {
            return pattern + '**';
        }
        return pattern;
    }

    /**
     * Finds all files that match the given pattern.
     * Never treats ! as negation - it's always a literal character.
     *
     * ISSUE-M025 optimisation: compile the pattern into a Minimatch instance once
     * and reuse it across every file in the workspace.
     *
     * @param pattern - The pattern to match against
     * @param files - Array of file paths (relative, with forward slashes)
     * @returns MatchResult containing matched files
     */
    public findMatches(pattern: string, files: string[]): MatchResult {
        // Never treat ! as negation in these file types
        const isNegation = false;
        let cleanPattern = pattern;

        // Auto-expand folder patterns: folder/ becomes folder/**
        cleanPattern = this.expandFolderPattern(cleanPattern);

        const matchingFiles: string[] = [];

        // Compile once, reuse for every file (ISSUE-M025)
        // NO matchBase option - *.log only matches root level
        // Use { dot: true } to match dotfiles
        // Use { nonegate: true } so ! in patterns is treated as literal
        // Use { nocomment: true } so # in patterns is treated as literal (cvsignore)
        const matcher = new Minimatch(cleanPattern, { dot: true, nonegate: true, nocomment: true });

        for (const file of files) {
            if (matcher.match(file)) {
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
     * @param pattern - The pattern
     * @param filePath - The file path to test
     * @returns true if the file matches the pattern
     */
    public testMatch(pattern: string, filePath: string): boolean {
        let cleanPattern = pattern;

        // Auto-expand folder patterns
        cleanPattern = this.expandFolderPattern(cleanPattern);

        // Use { nonegate: true } so ! in patterns is treated as literal
        // Use { nocomment: true } so # in patterns is treated as literal (cvsignore)
        const matches = minimatch(filePath, cleanPattern, { dot: true, nonegate: true, nocomment: true });
        return matches;
    }
}

/**
 * Factory function to get the appropriate matcher for a file type.
 * All gitignore-style files (see supportedFiles.ts) use the same matcher.
 *
 * @param fileType - The semantic type of ignore file
 * @returns Matcher instance for that file type
 */
export function getMatcher(fileType: IgnoreFileType): IPatternMatcher {
    if (fileType === 'glob-no-negation' || fileType === 'cvsignore') {
        // These formats treat ! as literal, never as negation
        return new GlobNoNegationMatcher();
    }
    if (fileType === 'vscodeignore' || fileType === 'dockerignore') {
        // These use minimatch-style matching with ! as negation
        return new VscodeignoreMatcher();
    }
    // gitignore-style, tfignore, and p4ignore files use basename matching
    // (P4ignoreParser normalises anchors to gitignore form before reaching this matcher)
    return new GitignoreMatcher();
}
