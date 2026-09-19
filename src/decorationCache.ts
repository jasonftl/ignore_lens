// Date: 24/04/2026
// Caches decoration data for instant display on tab switch

/**
 * Data for a single line's decoration.
 */
export interface LineDecorationData {
    lineIndex: number;
    lineLength: number;
    actionCount: number;
    noActionCount: number;
    blockedCount: number;
    setSize: number;
    isNegation: boolean;
    col1: string;  // "+N" or "−N"
    col2: string;  // "≡N" or "∅N" or "∅N ✗N" or empty
    col3: string;  // "(N)"
}

/**
 * Cached decoration data for a document.
 * col2 does not need alignment (it is the last column rendered) so its width is not tracked.
 */
export interface CachedDecorations {
    lineData: LineDecorationData[];
    maxLineLength: number;
    maxCol1Width: number;
    maxCol3Width: number;
}

export const decorationCache = new Map<string, CachedDecorations>();
