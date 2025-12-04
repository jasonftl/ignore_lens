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
 * Extracts directory prefixes from matched files for a directory-style pattern.
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
 * @param matchingFiles - Files that matched the pattern
 * @param pattern - The original pattern string
 * @param isDirectory - Whether pattern explicitly ends with /
 * @returns Set of directory prefixes to add to ignoredDirs
 */
function extractDirectoryPrefixes(matchingFiles: string[], pattern: string, isDirectory: boolean): Set<string> {
    const prefixes = new Set<string>();

    if (matchingFiles.length === 0) {
        return prefixes;
    }

    // Only explicit directory patterns (ends with /) block negations
    // dir/* and dir/** do NOT block negations - they only ignore contents,
    // Git still traverses the directory and can apply negation patterns
    // Check for * or ? which are always glob wildcards
    if (isDirectory) {
        // If pattern contains * or ?, it's a glob pattern not a simple directory
        // e.g., "node_modules/**/" should not block, only "node_modules/" should
        // Note: [ and ] can be literal in directory names, so we only check * and ?
        const patternWithoutTrailingSlash = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
        const hasWildcards = /[*?]/.test(patternWithoutTrailingSlash);
        if (hasWildcards) {
            return prefixes;
        }

        const firstFile = matchingFiles[0];
        const slashIndex = firstFile.indexOf('/');
        if (slashIndex !== -1) {
            prefixes.add(firstFile.substring(0, slashIndex + 1));
        }
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
            ignoredDirs.delete(patternWithoutNegation);
        } else if (patternWithoutNegation.endsWith('/**')) {
            // Glob pattern negating entire directory contents: "dir/**"
            // Use suffix check instead of regex to handle dir names with metacharacters
            const dirPrefix = patternWithoutNegation.slice(0, -2);  // Remove "**", keep trailing /
            ignoredDirs.delete(dirPrefix);
        } else if (patternWithoutNegation.endsWith('/*')) {
            // Glob pattern negating immediate directory contents: "dir/*"
            // "dir/*.js" won't match (doesn't end with exactly /*)
            const dirPrefix = patternWithoutNegation.slice(0, -1);  // Remove "*", keep trailing /
            ignoredDirs.delete(dirPrefix);
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
        const dirPrefixes = extractDirectoryPrefixes(matchingFiles, pattern, isDirectory);
        for (const prefix of dirPrefixes) {
            ignoredDirs.add(prefix);
        }
    }

    return { actionCount, noActionCount, blockedCount, setSize: cumulativeSet.size };
}
