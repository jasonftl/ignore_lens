// Date: 29/11/2025
// Common TypeScript interfaces and types for the Ignore Lens extension

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
 * Configuration options for the Ignore Lens extension.
 */
export interface IgnoreLensConfig {
    /** Whether the extension is enabled */
    enabled: boolean;
    /** The decoration style to use */
    decorationStyle: DecorationStyle;
    /** Debounce delay in milliseconds for rescanning */
    scanDebounceMs: number;
}
