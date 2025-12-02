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
 * Directory-style patterns include:
 * - Explicit directory patterns ending with / (e.g., "dist/")
 * - Patterns with ** that match directory contents (e.g., "dist/**")
 * - Patterns matching files in a directory (e.g., "dist/*.js")
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

    // Explicit directory pattern (ends with /)
    if (isDirectory) {
        const firstFile = matchingFiles[0];
        const slashIndex = firstFile.indexOf('/');
        if (slashIndex !== -1) {
            prefixes.add(firstFile.substring(0, slashIndex + 1));
        }
        return prefixes;
    }

    // Check for patterns that target directories: "dir/**", "dir/**/*", "dir/*.ext"
    // These patterns imply the directory is being ignored
    const dirGlobMatch = pattern.match(/^([^*?[\]!]+)\/(\*\*|\*)/);
    if (dirGlobMatch) {
        const dirPrefix = dirGlobMatch[1] + '/';
        prefixes.add(dirPrefix);
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
        } else {
            // Check for glob patterns that negate entire directories: "dir/**" or "dir/*"
            // Only match if the pattern ends with /** or /* (negating all contents)
            // "dir/*.js" should NOT match (only negates specific files)
            const dirGlobMatch = patternWithoutNegation.match(/^([^*?[\]]+)\/(\*\*|\*)$/);
            if (dirGlobMatch) {
                const dirPrefix = dirGlobMatch[1] + '/';
                ignoredDirs.delete(dirPrefix);
            }
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
