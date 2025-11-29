// Date: 29/11/2025
// Unit tests for the PatternMatcher class

import * as assert from 'assert';
import { PatternMatcher } from '../../patternMatcher';

suite('PatternMatcher Test Suite', () => {
    let matcher: PatternMatcher;

    // Sample file list for testing
    const testFiles = [
        'src/app.ts',
        'src/utils/helper.ts',
        'src/utils/logger.js',
        'node_modules/lodash/index.js',
        'node_modules/lodash/package.json',
        'build/output.js',
        'build/styles.css',
        '.env',
        '.gitignore',
        'README.md',
        'package.json'
    ];

    setup(() => {
        matcher = new PatternMatcher();
    });

    suite('findMatches', () => {
        test('should match simple wildcard patterns', () => {
            const result = matcher.findMatches('*.md', testFiles);

            assert.strictEqual(result.isNegation, false);
            assert.ok(result.matchingFiles.includes('README.md'));
        });

        test('should match extension patterns in subdirectories with **', () => {
            const result = matcher.findMatches('**/*.ts', testFiles);

            assert.ok(result.matchingFiles.includes('src/app.ts'));
            assert.ok(result.matchingFiles.includes('src/utils/helper.ts'));
            assert.strictEqual(result.matchingFiles.filter(f => f.endsWith('.ts')).length, 2);
        });

        test('should match directory patterns', () => {
            const result = matcher.findMatches('node_modules/', testFiles);

            assert.ok(result.matchingFiles.includes('node_modules/lodash/index.js'));
            assert.ok(result.matchingFiles.includes('node_modules/lodash/package.json'));
        });

        test('should match specific file', () => {
            const result = matcher.findMatches('.env', testFiles);

            assert.strictEqual(result.matchingFiles.length, 1);
            assert.ok(result.matchingFiles.includes('.env'));
        });

        test('should match patterns starting with dot', () => {
            const result = matcher.findMatches('.git*', testFiles);

            assert.ok(result.matchingFiles.includes('.gitignore'));
        });

        test('should identify negation patterns', () => {
            const result = matcher.findMatches('!README.md', testFiles);

            assert.strictEqual(result.isNegation, true);
            // The pattern should still match the file (negation is handled at evaluation time)
            assert.ok(result.matchingFiles.includes('README.md'));
        });

        test('should return empty array for non-matching pattern', () => {
            const result = matcher.findMatches('*.xyz', testFiles);

            assert.strictEqual(result.matchingFiles.length, 0);
        });

        test('should match build directory', () => {
            const result = matcher.findMatches('build/', testFiles);

            assert.ok(result.matchingFiles.includes('build/output.js'));
            assert.ok(result.matchingFiles.includes('build/styles.css'));
        });
    });

    suite('testMatch', () => {
        test('should return true for matching file', () => {
            const matches = matcher.testMatch('*.js', 'src/utils/logger.js');
            assert.strictEqual(matches, true);
        });

        test('should return false for non-matching file', () => {
            const matches = matcher.testMatch('*.ts', 'src/utils/logger.js');
            assert.strictEqual(matches, false);
        });

        test('should match directory patterns', () => {
            const matches = matcher.testMatch('node_modules/', 'node_modules/lodash/index.js');
            assert.strictEqual(matches, true);
        });

        test('should handle double asterisk patterns', () => {
            const matches = matcher.testMatch('**/helper.ts', 'src/utils/helper.ts');
            assert.strictEqual(matches, true);
        });
    });
});
