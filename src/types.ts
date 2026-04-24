// Date: 24/04/2026
// Common TypeScript interfaces and types for the IgnoreLens extension

/**
 * The semantic type of ignore file being processed.
 * Different types have different parsing and matching semantics.
 * - gitignore: Standard gitignore semantics (fnmatch, basename matching, directory blocking)
 * - vscodeignore: VS Code extension ignore (minimatch, root-only matching, no blocking)
 * - glob-no-negation: Glob patterns without negation support (! is literal, not negation)
 * - tfignore: Team Foundation (basename matching like gitignore, but \ anchors to root, no blocking)
 * - dockerignore: Docker ignore (minimatch-style, but strips leading/trailing slashes, no blocking)
 * - cvsignore: CVS ignore (simple glob, root only, no # comments, no negation)
 * - p4ignore: Perforce ignore (gitignore-style matching with / or \ as root anchor, first-match-wins)
 *
 * Note: Many ignore formats (e.g. .prettierignore, .eslintignore) follow gitignore semantics.
 * See supportedFiles.ts for the full list of supported files and their semantic types.
 */
export type IgnoreFileType = 'gitignore' | 'vscodeignore' | 'glob-no-negation' | 'tfignore' | 'dockerignore' | 'cvsignore' | 'p4ignore';

/**
 * The type of line in an ignore file.
 */
export type LineType = 'pattern' | 'comment' | 'blank';

/**
 * The decoration style for highlighting patterns.
 */
export type DecorationStyle = 'none' | 'background' | 'text' | 'both';

/**
 * Represents a parsed line from an ignore file.
 */
export interface ParsedLine {
    /** The type of this line */
    type: LineType;
    /** The pattern string (empty for comments and blank lines) */
    pattern: string;
    /** Whether this is a negation pattern (starts with !) */
    isNegation: boolean;
    /** Whether this specifically targets a directory (ends with /) */
    isDirectory: boolean;
    /** The original line text */
    rawText: string;
}

/**
 * Represents the result of matching a pattern against workspace files.
 */
export interface MatchResult {
    /** The original pattern string */
    pattern: string;
    /** Array of file paths that match this pattern */
    matchingFiles: string[];
    /** Whether this is a negation pattern */
    isNegation: boolean;
}

/**
 * Configuration options for the IgnoreLens extension.
 */
export interface IgnoreLensConfig {
    /** Whether the extension is enabled */
    enabled: boolean;
    /** The decoration style to use */
    decorationStyle: DecorationStyle;
    /** Debounce delay in milliseconds for rescanning */
    scanDebounceMs: number;
}

/**
 * Result of calculating counts for a single pattern.
 */
export interface AdvancedCountResult {
    /** Files added (normal) or removed (negation) */
    actionCount: number;
    /** Files already in set (normal) or not in set (negation) */
    noActionCount: number;
    /** Files that couldn't be un-ignored due to parent dir */
    blockedCount: number;
    /** Current set size after this operation */
    setSize: number;
}
