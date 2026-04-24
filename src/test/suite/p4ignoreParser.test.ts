// Date: 24/04/2026
// Unit tests for the P4ignoreParser class

import * as assert from 'assert';
import { P4ignoreParser } from '../../parserStrategy';
import { GitignoreMatcher } from '../../matcherStrategy';

suite('P4ignoreParser Test Suite', () => {
    let parser: P4ignoreParser;

    setup(() => {
        parser = new P4ignoreParser();
    });

    suite('basic parsing', () => {
        test('should identify blank lines', () => {
            const result = parser.parseLine('');
            assert.strictEqual(result.type, 'blank');
        });

        test('should identify comments starting with #', () => {
            const result = parser.parseLine('# comment');
            assert.strictEqual(result.type, 'comment');
        });

        test('should identify simple patterns', () => {
            const result = parser.parseLine('*.dll');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '*.dll');
            assert.strictEqual(result.isNegation, false);
            assert.strictEqual(result.isDirectory, false);
        });

        test('should identify directory patterns', () => {
            const result = parser.parseLine('build/');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'build/');
            assert.strictEqual(result.isDirectory, true);
        });

        test('should identify negation patterns', () => {
            const result = parser.parseLine('!important.dll');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '!important.dll');
            assert.strictEqual(result.isNegation, true);
        });
    });

    suite('root-anchor normalisation', () => {
        test('should preserve leading / as gitignore root anchor', () => {
            const result = parser.parseLine('/build.properties');
            assert.strictEqual(result.pattern, '/build.properties');
        });

        test('should convert leading \\ to / (Windows root anchor)', () => {
            const result = parser.parseLine('\\build.properties');
            assert.strictEqual(result.pattern, '/build.properties');
        });

        test('should convert leading \\ to / for negation patterns', () => {
            const result = parser.parseLine('!\\build.properties');
            assert.strictEqual(result.pattern, '!/build.properties');
            assert.strictEqual(result.isNegation, true);
        });

        test('should convert path-internal backslashes to forward slashes', () => {
            const result = parser.parseLine('src\\build\\*.cpp');
            assert.strictEqual(result.pattern, 'src/build/*.cpp');
        });

        test('should handle leading \\ combined with path-internal backslashes', () => {
            const result = parser.parseLine('\\src\\build.properties');
            assert.strictEqual(result.pattern, '/src/build.properties');
        });
    });

    suite('parseFile', () => {
        test('should parse multi-line content', () => {
            const content = '# Perforce ignore\n*.dll\n/build.properties\n!important.dll\n';
            const result = parser.parseFile(content);
            assert.strictEqual(result.length, 5);  // 4 lines + trailing blank
            assert.strictEqual(result[0].type, 'comment');
            assert.strictEqual(result[1].pattern, '*.dll');
            assert.strictEqual(result[2].pattern, '/build.properties');
            assert.strictEqual(result[3].pattern, '!important.dll');
            assert.strictEqual(result[4].type, 'blank');
        });

        test('should strip UTF-8 BOM from first line', () => {
            const content = '﻿*.dll';
            const result = parser.parseFile(content);
            assert.strictEqual(result[0].pattern, '*.dll');
        });
    });

    suite('end-to-end: parser output drives GitignoreMatcher correctly', () => {
        // After parsing, patterns flow through GitignoreMatcher. These tests pin down
        // the combined behaviour that P4 users will observe.

        const matcher = new GitignoreMatcher();
        const files = ['build.properties', 'lib/build.properties', 'a.dll', 'lib/a.dll', 'src/tool/a.dll'];

        test('rooted pattern /build.properties matches root file only', () => {
            const parsed = parser.parseLine('/build.properties');
            const result = matcher.findMatches(parsed.pattern, files);
            assert.deepStrictEqual(result.matchingFiles, ['build.properties']);
        });

        test('Windows-rooted pattern \\build.properties matches root file only', () => {
            const parsed = parser.parseLine('\\build.properties');
            const result = matcher.findMatches(parsed.pattern, files);
            assert.deepStrictEqual(result.matchingFiles, ['build.properties']);
        });

        test('basename pattern *.dll matches at every depth', () => {
            const parsed = parser.parseLine('*.dll');
            const result = matcher.findMatches(parsed.pattern, files);
            assert.deepStrictEqual(
                result.matchingFiles.sort(),
                ['a.dll', 'lib/a.dll', 'src/tool/a.dll'].sort()
            );
        });

        test('Windows path pattern src\\build\\*.cpp matches src/build/*.cpp', () => {
            const parsed = parser.parseLine('src\\build\\*.cpp');
            const cppFiles = ['src/build/a.cpp', 'src/build/b.cpp', 'other/a.cpp'];
            const result = matcher.findMatches(parsed.pattern, cppFiles);
            assert.deepStrictEqual(
                result.matchingFiles.sort(),
                ['src/build/a.cpp', 'src/build/b.cpp'].sort()
            );
        });
    });
});
