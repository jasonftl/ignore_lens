// Date: 10/01/2026
// Unit tests for the GlobNoNegationMatcher class

import * as assert from 'assert';
import { GlobNoNegationMatcher } from '../../matcherStrategy';

suite('GlobNoNegationMatcher Test Suite', () => {
    let matcher: GlobNoNegationMatcher;

    // Test files representing a typical project structure
    // Includes files starting with ! and # for literal character testing
    const testFiles = [
        'debug.log',
        'src/debug.log',
        'src/utils/debug.log',
        '.hidden',
        'src/.hidden',
        'folder/file.txt',
        'folder/sub/file.txt',
        'dist/bundle.js',
        'dist/assets/logo.png',
        'node_modules/lodash/index.js',
        '!important.txt',
        '#readme.txt'
    ];

    setup(() => {
        matcher = new GlobNoNegationMatcher();
    });

    suite('findMatches - literal ! patterns (nonegate)', () => {
        test('should match !important.txt as literal filename', () => {
            const result = matcher.findMatches('!important.txt', testFiles);

            // Should match the file literally named !important.txt
            assert.ok(result.matchingFiles.includes('!important.txt'));
            assert.strictEqual(result.matchingFiles.length, 1);
            // Should NOT be treated as negation
            assert.strictEqual(result.isNegation, false);
        });

        test('should NOT treat ! as negation pattern', () => {
            const result = matcher.findMatches('!dist/**', testFiles);

            // In GlobNoNegationMatcher, !dist/** should NOT match dist/ contents
            // because ! is treated as literal, not negation
            // The pattern looks for files starting with "!dist/"
            assert.strictEqual(result.isNegation, false);
            assert.strictEqual(result.matchingFiles.length, 0);
        });

        test('should match files starting with ! using wildcard', () => {
            const result = matcher.findMatches('!*', testFiles);

            // Should match !important.txt (files starting with !)
            assert.ok(result.matchingFiles.includes('!important.txt'));
            assert.strictEqual(result.matchingFiles.length, 1);
            assert.strictEqual(result.isNegation, false);
        });
    });

    suite('findMatches - literal # patterns (nocomment)', () => {
        test('should match #readme.txt as literal filename', () => {
            const result = matcher.findMatches('#readme.txt', testFiles);

            // Should match the file literally named #readme.txt
            assert.ok(result.matchingFiles.includes('#readme.txt'));
            assert.strictEqual(result.matchingFiles.length, 1);
        });

        test('should NOT treat # as comment', () => {
            // In standard minimatch, #pattern is treated as a comment and matches nothing
            // GlobNoNegationMatcher should treat # as literal
            const result = matcher.findMatches('#*', testFiles);

            // Should match files starting with #
            assert.ok(result.matchingFiles.includes('#readme.txt'));
            assert.strictEqual(result.matchingFiles.length, 1);
        });
    });

    suite('findMatches - no recursive basename matching', () => {
        test('should NOT match *.log in subdirectories (no basename matching)', () => {
            const result = matcher.findMatches('*.log', testFiles);

            // Only root level debug.log should match
            assert.ok(result.matchingFiles.includes('debug.log'));
            assert.ok(!result.matchingFiles.includes('src/debug.log'));
            assert.ok(!result.matchingFiles.includes('src/utils/debug.log'));
            assert.strictEqual(result.matchingFiles.length, 1);
        });

        test('should match **/*.log in all directories', () => {
            const result = matcher.findMatches('**/*.log', testFiles);

            assert.ok(result.matchingFiles.includes('debug.log'));
            assert.ok(result.matchingFiles.includes('src/debug.log'));
            assert.ok(result.matchingFiles.includes('src/utils/debug.log'));
            assert.strictEqual(result.matchingFiles.length, 3);
        });
    });

    suite('findMatches - folder pattern expansion', () => {
        test('should auto-expand folder/ to folder/**', () => {
            const result = matcher.findMatches('folder/', testFiles);

            // folder/ expands to folder/**, matching all files under folder/
            assert.ok(result.matchingFiles.includes('folder/file.txt'));
            assert.ok(result.matchingFiles.includes('folder/sub/file.txt'));
            assert.strictEqual(result.matchingFiles.length, 2);
        });

        test('should match node_modules/ expanded to node_modules/**', () => {
            const result = matcher.findMatches('node_modules/', testFiles);

            assert.ok(result.matchingFiles.includes('node_modules/lodash/index.js'));
            assert.strictEqual(result.matchingFiles.length, 1);
        });
    });

    suite('findMatches - dotfile matching', () => {
        test('should match dotfiles with { dot: true }', () => {
            const result = matcher.findMatches('.*', testFiles);

            // Only root level .hidden should match (no basename matching)
            assert.ok(result.matchingFiles.includes('.hidden'));
            assert.strictEqual(result.matchingFiles.length, 1);
        });

        test('should match dotfiles in subdirectories with **/', () => {
            const result = matcher.findMatches('**/.*', testFiles);

            assert.ok(result.matchingFiles.includes('.hidden'));
            assert.ok(result.matchingFiles.includes('src/.hidden'));
            assert.strictEqual(result.matchingFiles.length, 2);
        });
    });

    suite('testMatch', () => {
        test('should match literal ! filename', () => {
            const matches = matcher.testMatch('!important.txt', '!important.txt');
            assert.strictEqual(matches, true);
        });

        test('should match literal # filename', () => {
            const matches = matcher.testMatch('#readme.txt', '#readme.txt');
            assert.strictEqual(matches, true);
        });

        test('should return true for matching file at root', () => {
            const matches = matcher.testMatch('*.log', 'debug.log');
            assert.strictEqual(matches, true);
        });

        test('should return false for file in subdirectory (no basename matching)', () => {
            const matches = matcher.testMatch('*.log', 'src/debug.log');
            assert.strictEqual(matches, false);
        });

        test('should expand folder/ pattern', () => {
            const matches = matcher.testMatch('folder/', 'folder/file.txt');
            assert.strictEqual(matches, true);
        });
    });
});
