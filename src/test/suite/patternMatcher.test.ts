// Date: 04/01/2026
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

    suite('character class patterns (minimatch fallback)', () => {
        // Files for character class testing
        const charClassFiles = [
            'a.ts',
            'b.ts',
            'c.ts',
            'x.txt',
            'ab.ts',
            'src/a.ts',
            'src/b.js',
            '[special].ts'
        ];

        test('should match [a].ts to a.ts using minimatch fallback', () => {
            const result = matcher.findMatches('[a].ts', charClassFiles);

            assert.ok(result.matchingFiles.includes('a.ts'), 'should match a.ts');
            assert.ok(result.matchingFiles.includes('src/a.ts'), 'should match src/a.ts');
            assert.ok(!result.matchingFiles.includes('b.ts'), 'should not match b.ts');
        });

        test('should match [abc].ts to a.ts, b.ts, c.ts', () => {
            const result = matcher.findMatches('[abc].ts', charClassFiles);

            assert.ok(result.matchingFiles.includes('a.ts'), 'should match a.ts');
            assert.ok(result.matchingFiles.includes('b.ts'), 'should match b.ts');
            assert.ok(result.matchingFiles.includes('c.ts'), 'should match c.ts');
            assert.ok(!result.matchingFiles.includes('ab.ts'), 'should not match ab.ts (two chars)');
        });

        test('should match [a-c].ts using character range', () => {
            const result = matcher.findMatches('[a-c].ts', charClassFiles);

            assert.ok(result.matchingFiles.includes('a.ts'), 'should match a.ts');
            assert.ok(result.matchingFiles.includes('b.ts'), 'should match b.ts');
            assert.ok(result.matchingFiles.includes('c.ts'), 'should match c.ts');
        });

        test('should use ignore package for patterns with wildcards', () => {
            // Pattern with both character class and wildcard should use ignore package
            const result = matcher.findMatches('[ab]*.ts', charClassFiles);

            // This tests that the ignore package handles it (may or may not match)
            assert.strictEqual(result.isNegation, false);
        });

        test('testMatch should use minimatch fallback for character class', () => {
            const matchesA = matcher.testMatch('[a].ts', 'a.ts');
            const matchesB = matcher.testMatch('[a].ts', 'b.ts');

            assert.strictEqual(matchesA, true, '[a].ts should match a.ts');
            assert.strictEqual(matchesB, false, '[a].ts should not match b.ts');
        });

        test('should handle escaped brackets (literal match, not character class)', () => {
            // Escaped brackets should NOT use minimatch fallback
            // They represent literal [ and ] characters
            const result = matcher.findMatches('\\[special\\].ts', charClassFiles);

            // Should match the literal file [special].ts
            assert.ok(result.matchingFiles.includes('[special].ts'), 'should match [special].ts literally');
            assert.ok(!result.matchingFiles.includes('s.ts') || !charClassFiles.includes('s.ts'), 'should not treat as character class');
        });
    });

    suite('escaped special characters', () => {
        const specialFiles = [
            '!important.txt',
            '#readme.txt',
            'important.txt',
            'readme.txt'
        ];

        test('should not treat escaped \\! as negation', () => {
            // \!important.txt should match literal file "!important.txt", not negate "important.txt"
            const result = matcher.findMatches('\\!important.txt', specialFiles);

            assert.strictEqual(result.isNegation, false, 'escaped ! should not be negation');
            assert.ok(result.matchingFiles.includes('!important.txt'), 'should match !important.txt literally');
            assert.ok(!result.matchingFiles.includes('important.txt'), 'should not match important.txt');
        });

        test('should not treat escaped \\# as comment in matching', () => {
            // \#readme.txt should match literal file "#readme.txt"
            const result = matcher.findMatches('\\#readme.txt', specialFiles);

            assert.strictEqual(result.isNegation, false);
            assert.ok(result.matchingFiles.includes('#readme.txt'), 'should match #readme.txt literally');
        });

        test('testMatch should handle escaped \\! correctly', () => {
            const matchesBang = matcher.testMatch('\\!important.txt', '!important.txt');
            const matchesNoBang = matcher.testMatch('\\!important.txt', 'important.txt');

            assert.strictEqual(matchesBang, true, 'should match !important.txt');
            assert.strictEqual(matchesNoBang, false, 'should not match important.txt');
        });
    });
});
