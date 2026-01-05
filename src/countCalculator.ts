// Date: 02/12/2025
// Calculates pattern match counts with cumulative set tracking

/**
 * Result of calculating counts for a single pattern.
 */
export interface AdvancedCountResult {
    actionCount: number;    // Files added (normal) or removed (negation)
    noActionCount: number;  // Files already in set (normal) or not in set (negation)
    blockedCount: number;   // Files that couldn't be un-ignored due to parent dir
    setSize: number;        // Current set size after this operation
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
    // This handles \[, \], \*, \?, \#, \!, \\, etc.
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
    // This ensures "\[temp\]/" matches files under "[temp]/"
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
 * Per Git documentation: "It is not possible to re-include a file if a parent
 * directory of that file is excluded."
 *
 * However, patterns like "dir/*" and "dir/**" do NOT exclude the directory itself,
 * they only exclude the contents. Git still traverses the directory and can apply
 * negation patterns to files within it.
 *
 * Only "dir/" (explicit directory pattern) excludes the directory itself, which
 * prevents Git from traversing it and blocks all negations for files within.
 *
 * @param pattern - The original pattern string
 * @param isDirectory - Whether pattern explicitly ends with /
 * @returns Set of directory prefixes to add to ignoredDirs
 */
function extractDirectoryPrefixes(pattern: string, isDirectory: boolean): Set<string> {
    const prefixes = new Set<string>();

    // Only explicit directory patterns (ends with /) block negations
    // dir/* and dir/** do NOT block negations - they only ignore contents,
    // Git still traverses the directory and can apply negation patterns
    // Check for * or ? which are always glob wildcards
    if (isDirectory) {
        // Remove leading / for checking wildcards (anchored patterns)
        let patternToCheck = pattern;
        if (patternToCheck.startsWith('/')) {
            patternToCheck = patternToCheck.substring(1);
        }

        // If pattern contains unescaped *, ?, or [ it's a glob pattern not a simple directory
        // e.g., "node_modules/**/" should not block, only "node_modules/" should
        // Character classes like [ab]/ should be treated as wildcards (match multiple directories)
        // ISSUE-M004 fix: Only detect UNESCAPED wildcards (not preceded by \)
        // ISSUE-M007 fix: Also detect [ as wildcard start (character class)
        const patternWithoutTrailingSlash = patternToCheck.endsWith('/') ? patternToCheck.slice(0, -1) : patternToCheck;
        // Match *, ?, or [ that are NOT preceded by a backslash
        // Uses negative lookbehind (?<!\\) to exclude escaped wildcards
        const hasUnescapedWildcards = /(?<!\\)[*?\[]/.test(patternWithoutTrailingSlash);
        if (hasUnescapedWildcards) {
            return prefixes;
        }

        // Derive prefix from pattern itself, not from matched files
        // This correctly handles nested directories like "src/vendor/"
        const normalised = normaliseDirectoryPrefix(pattern);
        prefixes.add(normalised);
        return prefixes;
    }

    return prefixes;
}

/**
 * Calculates the advanced count for a pattern.
 * Normal patterns add to the set, negation patterns remove from the set.
 * Tracks ignored directories and blocks negations for files under them.
 * Updates the sets in place.
 *
 * @param matchingFiles - Files that match this pattern
 * @param isNegation - Whether this is a negation pattern
 * @param isDirectory - Whether this is a directory pattern (ends with /)
 * @param cumulativeSet - Set of files currently ignored (modified in place)
 * @param ignoredDirs - Set of ignored directory prefixes (modified in place)
 * @param pattern - The original pattern string (for directory detection)
 * @returns Object with actionCount, noActionCount, blockedCount, and setSize
 */
export function calculateAdvancedCount(
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
    // e.g., "!dist/" or "!dist/**" should allow future negations for files under "dist/"
    // This works even if the directory is empty (no matching files)
    // Note: "!dist/*.js" should NOT clear ignoredDirs (only negates specific files)
    if (isNegation) {
        // Extract directory prefix from pattern (remove leading ! if present)
        const patternWithoutNegation = pattern.startsWith('!') ? pattern.substring(1) : pattern;

        // Check for explicit directory pattern (ends with /)
        if (patternWithoutNegation.endsWith('/')) {
            // Use normalised prefix (handles leading / for anchored patterns)
            const normalised = normaliseDirectoryPrefix(pattern);
            ignoredDirs.delete(normalised);
        } else if (patternWithoutNegation.endsWith('/**')) {
            // Glob pattern negating entire directory contents: "dir/**"
            // Strip leading / and ** to get normalised dir prefix
            let dirPattern = patternWithoutNegation.slice(0, -2);  // Remove "**", keep trailing /
            if (dirPattern.startsWith('/')) {
                dirPattern = dirPattern.substring(1);
            }
            // ISSUE-M005 fix: Unescape to match entries stored by normaliseDirectoryPrefix
            dirPattern = unescapePattern(dirPattern);
            ignoredDirs.delete(dirPattern);
        } else if (patternWithoutNegation.endsWith('/*')) {
            // Glob pattern negating immediate directory contents: "dir/*"
            // "dir/*.js" won't match (doesn't end with exactly /*)
            let dirPattern = patternWithoutNegation.slice(0, -1);  // Remove "*", keep trailing /
            if (dirPattern.startsWith('/')) {
                dirPattern = dirPattern.substring(1);
            }
            // ISSUE-M005 fix: Unescape to match entries stored by normaliseDirectoryPrefix
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
