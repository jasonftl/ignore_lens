// Date: 24/04/2026
// Strategy pattern for count calculation in different ignore file types
// Gitignore has directory blocking for negations; vscodeignore does not;
// p4ignore uses first-match-wins (tracked via decidedSet)

import { AdvancedCountResult, IgnoreFileType } from './types';

/**
 * Interface for count calculators.
 * decidedSet is only consumed by calculators that need first-match-wins
 * semantics (currently P4ignoreCountCalculator); other calculators ignore it.
 */
export interface ICountCalculator {
    calculateCount(
        matchingFiles: string[],
        isNegation: boolean,
        isDirectory: boolean,
        cumulativeSet: Set<string>,
        ignoredDirs: Set<string>,
        pattern: string,
        decidedSet?: Set<string>
    ): AdvancedCountResult;
}

/**
 * Checks if a file path is under any ignored directory.
 * Git won't let you un-ignore a file if its parent directory is ignored.
 *
 * @param filePath - The file path to check
 * @param ignoredDirs - Set of ignored directory prefixes
 * @returns True if the file is under an ignored directory
 */
export function isUnderIgnoredDir(filePath: string, ignoredDirs: Set<string>): boolean {
    for (const dir of ignoredDirs) {
        if (filePath.startsWith(dir)) {
            return true;
        }
    }
    return false;
}

/**
 * Removes gitignore escape sequences from a pattern.
 * In gitignore, backslash escapes special characters: \[ means literal [
 *
 * @param pattern - The pattern with possible escape sequences
 * @returns Pattern with escapes resolved to literal characters
 */
function unescapePattern(pattern: string): string {
    // Replace \X with X for any character X
    return pattern.replace(/\\(.)/g, '$1');
}

/**
 * Normalises a directory pattern for use in ignoredDirs.
 * Strips leading / (anchored patterns), removes escape sequences,
 * and ensures trailing /.
 *
 * @param pattern - The pattern string (may have leading ! for negation)
 * @returns Normalised directory prefix for storage/lookup
 */
function normaliseDirectoryPrefix(pattern: string): string {
    let normalised = pattern;

    // Remove leading ! if present (for negation patterns)
    if (normalised.startsWith('!')) {
        normalised = normalised.substring(1);
    }

    // Remove leading / (anchored patterns store without it)
    if (normalised.startsWith('/')) {
        normalised = normalised.substring(1);
    }

    // Remove escape sequences (e.g., \[ -> [, \] -> ])
    normalised = unescapePattern(normalised);

    // Ensure trailing /
    if (!normalised.endsWith('/')) {
        normalised = normalised + '/';
    }

    return normalised;
}

/**
 * Extracts directory prefixes from a directory-style pattern.
 * Only explicit directory patterns (ending with /) block negations.
 *
 * @param pattern - The original pattern string
 * @param isDirectory - Whether pattern explicitly ends with /
 * @returns Set of directory prefixes to add to ignoredDirs
 */
function extractDirectoryPrefixes(pattern: string, isDirectory: boolean): Set<string> {
    const prefixes = new Set<string>();

    if (isDirectory) {
        // Remove leading / for checking wildcards (anchored patterns)
        let patternToCheck = pattern;
        if (patternToCheck.startsWith('/')) {
            patternToCheck = patternToCheck.substring(1);
        }

        // If pattern contains unescaped *, ?, or [ it's a glob pattern not a simple directory
        // Character classes like [ab]/ should be treated as wildcards (match multiple directories)
        const patternWithoutTrailingSlash = patternToCheck.endsWith('/') ? patternToCheck.slice(0, -1) : patternToCheck;
        const hasUnescapedWildcards = /(?<!\\)[*?\[]/.test(patternWithoutTrailingSlash);
        if (hasUnescapedWildcards) {
            return prefixes;
        }

        // Derive prefix from pattern itself
        const normalised = normaliseDirectoryPrefix(pattern);
        prefixes.add(normalised);
        return prefixes;
    }

    return prefixes;
}

/**
 * Count calculator for .gitignore files.
 * Implements directory blocking for negations.
 * Git won't let you un-ignore a file if its parent directory is ignored.
 */
export class GitignoreCountCalculator implements ICountCalculator {
    /**
     * Calculates the count for a gitignore pattern.
     * Normal patterns add to the set, negation patterns remove from the set.
     * Tracks ignored directories and blocks negations for files under them.
     *
     * @param matchingFiles - Files that match this pattern
     * @param isNegation - Whether this is a negation pattern
     * @param isDirectory - Whether this is a directory pattern (ends with /)
     * @param cumulativeSet - Set of files currently ignored (modified in place)
     * @param ignoredDirs - Set of ignored directory prefixes (modified in place)
     * @param pattern - The original pattern string
     * @returns Count result with actionCount, noActionCount, blockedCount, setSize
     */
    public calculateCount(
        matchingFiles: string[],
        isNegation: boolean,
        isDirectory: boolean,
        cumulativeSet: Set<string>,
        ignoredDirs: Set<string>,
        pattern: string = ''
    ): AdvancedCountResult {
        let actionCount: number = 0;
        let noActionCount: number = 0;
        let blockedCount: number = 0;

        // Handle negation directory patterns - remove from ignoredDirs
        if (isNegation) {
            const patternWithoutNegation = pattern.startsWith('!') ? pattern.substring(1) : pattern;

            if (patternWithoutNegation.endsWith('/')) {
                const normalised = normaliseDirectoryPrefix(pattern);
                ignoredDirs.delete(normalised);
            } else if (patternWithoutNegation.endsWith('/**')) {
                let dirPattern = patternWithoutNegation.slice(0, -2);
                if (dirPattern.startsWith('/')) {
                    dirPattern = dirPattern.substring(1);
                }
                dirPattern = unescapePattern(dirPattern);
                ignoredDirs.delete(dirPattern);
            } else if (patternWithoutNegation.endsWith('/*')) {
                let dirPattern = patternWithoutNegation.slice(0, -1);
                if (dirPattern.startsWith('/')) {
                    dirPattern = dirPattern.substring(1);
                }
                dirPattern = unescapePattern(dirPattern);
                ignoredDirs.delete(dirPattern);
            }
        }

        for (const file of matchingFiles) {
            if (isNegation) {
                // Check if any parent directory is ignored
                if (isUnderIgnoredDir(file, ignoredDirs)) {
                    blockedCount = blockedCount + 1;
                    continue;  // Can't un-ignore - parent dir is ignored
                }
                // Negation: remove from set
                if (cumulativeSet.has(file)) {
                    cumulativeSet.delete(file);
                    actionCount = actionCount + 1;
                } else {
                    noActionCount = noActionCount + 1;
                }
            } else {
                // Normal: add to set
                if (cumulativeSet.has(file)) {
                    noActionCount = noActionCount + 1;
                } else {
                    cumulativeSet.add(file);
                    actionCount = actionCount + 1;
                }
            }
        }

        // For normal patterns, extract and add directory prefixes to block future negations
        if (!isNegation) {
            const dirPrefixes = extractDirectoryPrefixes(pattern, isDirectory);
            for (const prefix of dirPrefixes) {
                ignoredDirs.add(prefix);
            }
        }

        return { actionCount, noActionCount, blockedCount, setSize: cumulativeSet.size };
    }
}

/**
 * Count calculator for .vscodeignore files.
 * NO directory blocking - negations always work.
 * The ignoredDirs parameter is unused but kept for interface compatibility.
 */
export class VscodeignoreCountCalculator implements ICountCalculator {
    /**
     * Calculates the count for a vscodeignore pattern.
     * Normal patterns add to the set, negation patterns remove from the set.
     * No directory blocking - negations always succeed.
     *
     * @param matchingFiles - Files that match this pattern
     * @param isNegation - Whether this is a negation pattern
     * @param isDirectory - Whether this is a directory pattern (unused for vscodeignore)
     * @param cumulativeSet - Set of files currently ignored (modified in place)
     * @param ignoredDirs - Set of ignored directory prefixes (unused for vscodeignore)
     * @param pattern - The original pattern string (unused for vscodeignore)
     * @returns Count result with actionCount, noActionCount, blockedCount (always 0), setSize
     */
    public calculateCount(
        matchingFiles: string[],
        isNegation: boolean,
        isDirectory: boolean,
        cumulativeSet: Set<string>,
        ignoredDirs: Set<string>,
        pattern: string = ''
    ): AdvancedCountResult {
        let actionCount: number = 0;
        let noActionCount: number = 0;
        // blockedCount is always 0 for vscodeignore (no directory blocking)
        const blockedCount: number = 0;

        // Unused parameters - kept for interface compatibility
        void isDirectory;
        void ignoredDirs;
        void pattern;

        for (const file of matchingFiles) {
            if (isNegation) {
                // Simply remove from set - no blocking checks
                if (cumulativeSet.has(file)) {
                    cumulativeSet.delete(file);
                    actionCount = actionCount + 1;
                } else {
                    noActionCount = noActionCount + 1;
                }
            } else {
                // Normal: add to set
                if (cumulativeSet.has(file)) {
                    noActionCount = noActionCount + 1;
                } else {
                    cumulativeSet.add(file);
                    actionCount = actionCount + 1;
                }
            }
        }

        return { actionCount, noActionCount, blockedCount, setSize: cumulativeSet.size };
    }
}

/**
 * Count calculator for .p4ignore files (Perforce).
 * Implements first-match-wins semantics: once a file has been decided by any
 * earlier pattern, later patterns matching the same file do nothing.
 * This is the opposite of gitignore's last-match-wins.
 *
 * - cumulativeSet tracks files currently ignored (same as gitignore)
 * - decidedSet tracks files whose fate has been determined by an earlier pattern
 * - ignoredDirs is unused (P4 has no directory-blocking semantics)
 */
export class P4ignoreCountCalculator implements ICountCalculator {
    /**
     * Calculates the count for a p4ignore pattern using first-match-wins.
     *
     * @param matchingFiles - Files that match this pattern
     * @param isNegation - Whether this is a negation pattern
     * @param isDirectory - Whether this is a directory pattern (unused for p4)
     * @param cumulativeSet - Set of files currently ignored (modified in place)
     * @param ignoredDirs - Unused for p4
     * @param pattern - The original pattern string (unused for p4)
     * @param decidedSet - Files already decided by an earlier pattern (modified in place)
     * @returns Count result with actionCount, noActionCount, blockedCount (always 0), setSize
     */
    public calculateCount(
        matchingFiles: string[],
        isNegation: boolean,
        isDirectory: boolean,
        cumulativeSet: Set<string>,
        ignoredDirs: Set<string>,
        pattern: string = '',
        decidedSet?: Set<string>
    ): AdvancedCountResult {
        let actionCount: number = 0;
        let noActionCount: number = 0;
        // blockedCount is always 0 for p4ignore (no directory blocking)
        const blockedCount: number = 0;

        // Unused parameters - kept for interface compatibility
        void isDirectory;
        void ignoredDirs;
        void pattern;

        // Defensive: if caller omits decidedSet, fall back to a local one
        // (each pattern starts fresh, so first-match-wins degrades to "this pattern wins")
        const decided = decidedSet ? decidedSet : new Set<string>();

        for (const file of matchingFiles) {
            if (decided.has(file)) {
                // Earlier pattern already decided this file's fate - first-match-wins
                noActionCount = noActionCount + 1;
                continue;
            }
            // First pattern to match this file - decide its fate
            decided.add(file);
            if (isNegation) {
                // Decide as "not ignored" (never added to cumulativeSet)
                actionCount = actionCount + 1;
            } else {
                // Decide as "ignored"
                cumulativeSet.add(file);
                actionCount = actionCount + 1;
            }
        }

        return { actionCount, noActionCount, blockedCount, setSize: cumulativeSet.size };
    }
}

/**
 * Factory function to get the appropriate count calculator for a file type.
 * All gitignore-style files (see supportedFiles.ts) use the same calculator with directory blocking.
 *
 * @param fileType - The semantic type of ignore file
 * @returns Count calculator instance for that file type
 */
export function getCountCalculator(fileType: IgnoreFileType): ICountCalculator {
    if (fileType === 'p4ignore') {
        // P4 uses first-match-wins semantics
        return new P4ignoreCountCalculator();
    }
    if (fileType === 'vscodeignore' || fileType === 'glob-no-negation' || fileType === 'tfignore' || fileType === 'dockerignore' || fileType === 'cvsignore') {
        // These use simple add/remove logic (no directory blocking)
        // For glob-no-negation/cvsignore, negation code won't be triggered since parser sets isNegation=false
        // For tfignore/dockerignore, directory blocking is not documented/not applicable
        return new VscodeignoreCountCalculator();
    }
    // All gitignore-style files use the same calculator with directory blocking
    return new GitignoreCountCalculator();
}
