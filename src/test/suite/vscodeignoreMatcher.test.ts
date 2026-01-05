// Date: 05/01/2026
// Unit tests for the VscodeignoreMatcher class

import * as assert from 'assert';
import { VscodeignoreMatcher } from '../../matcherStrategy';

suite('VscodeignoreMatcher Test Suite', () => {
    let matcher: VscodeignoreMatcher;

    // Test files representing a typical project structure
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
        'node_modules/lodash/index.js'
    ];

    setup(() => {
        matcher = new VscodeignoreMatcher();
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

        test('should match *.js only at root level', () => {
            const result = matcher.findMatches('*.js', testFiles);

            // No .js files at root in our test set
            assert.strictEqual(result.matchingFiles.length, 0);
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

    suite('findMatches - folder pattern expansion', () => {
        test('should auto-expand folder/ to folder/**', () => {
            const result = matcher.findMatches('folder/', testFiles);

            // folder/ expands to folder/**, matching all files under folder/
            assert.ok(result.matchingFiles.includes('folder/file.txt'));
            assert.ok(result.matchingFiles.includes('folder/sub/file.txt'));
            assert.strictEqual(result.matchingFiles.length, 2);
        });

        test('should match explicit folder/** pattern', () => {
            const result = matcher.findMatches('folder/**', testFiles);

            assert.ok(result.matchingFiles.includes('folder/file.txt'));
            assert.ok(result.matchingFiles.includes('folder/sub/file.txt'));
        });

        test('should match node_modules/ expanded to node_modules/**', () => {
            const result = matcher.findMatches('node_modules/', testFiles);

            assert.ok(result.matchingFiles.includes('node_modules/lodash/index.js'));
            assert.strictEqual(result.matchingFiles.length, 1);
        });
    });

    suite('findMatches - negation patterns', () => {
        test('should identify negation patterns', () => {
            const result = matcher.findMatches('!dist/**', testFiles);

            assert.strictEqual(result.isNegation, true);
            assert.ok(result.matchingFiles.includes('dist/bundle.js'));
            assert.ok(result.matchingFiles.includes('dist/assets/logo.png'));
        });

        test('should handle negation with specific file', () => {
            const result = matcher.findMatches('!dist/bundle.js', testFiles);

            assert.strictEqual(result.isNegation, true);
            assert.ok(result.matchingFiles.includes('dist/bundle.js'));
            assert.strictEqual(result.matchingFiles.length, 1);
        });
    });

    suite('testMatch', () => {
        test('should return true for matching file at root', () => {
            const matches = matcher.testMatch('*.log', 'debug.log');
            assert.strictEqual(matches, true);
        });

        test('should return false for file in subdirectory (no basename matching)', () => {
            const matches = matcher.testMatch('*.log', 'src/debug.log');
            assert.strictEqual(matches, false);
        });

        test('should match with **/ pattern', () => {
            const matches = matcher.testMatch('**/*.log', 'src/debug.log');
            assert.strictEqual(matches, true);
        });

        test('should expand folder/ pattern', () => {
            const matches = matcher.testMatch('folder/', 'folder/file.txt');
            assert.strictEqual(matches, true);
        });
    });
});
