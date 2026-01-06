// Date: 05/01/2026
// Caches decoration data for instant display on tab switch

import * as vscode from 'vscode';

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
 */
export interface CachedDecorations {
    lineData: LineDecorationData[];
    maxLineLength: number;
    maxCol1Width: number;
    maxCol2Width: number;
    maxCol3Width: number;
    timestamp: number;
}

/**
 * Result from cache lookup, includes flag to indicate if data is cached.
 */
export interface CacheResult {
    data: CachedDecorations;
    isCached: boolean;  // true = use stale colours, false = use normal colours
}

/**
 * Manages cached decoration data for ignore files.
 * Uses "overwrite, never clear" strategy - stale data is always preferred over no data.
 */
class DecorationCache {
    // Document URI string → cached data
    private cache = new Map<string, CachedDecorations>();

    /**
     * Gets cached decoration data for a document.
     *
     * @param uri - The document URI string
     * @returns CacheResult with data and isCached flag, or undefined if no cache
     */
    public get(uri: string): CacheResult | undefined {
        const cached = this.cache.get(uri);
        if (cached) {
            const result: CacheResult = {
                data: cached,
                isCached: true
            };
            return result;
        }
        return undefined;
    }

    /**
     * Stores decoration data for a document.
     * Overwrites any existing cached data.
     *
     * @param uri - The document URI string
     * @param data - The decoration data to cache
     */
    public set(uri: string, data: CachedDecorations): void {
        this.cache.set(uri, data);
    }

    /**
     * Checks if a document has cached data.
     *
     * @param uri - The document URI string
     * @returns true if cache exists for this document
     */
    public has(uri: string): boolean {
        return this.cache.has(uri);
    }

    /**
     * Gets the number of cached documents.
     *
     * @returns The cache size
     */
    public size(): number {
        return this.cache.size;
    }
}

// Singleton instance
export const decorationCache = new DecorationCache();
