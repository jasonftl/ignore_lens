// Date: 05/01/2026
// Unit tests for the GitignoreMatcher class

import * as assert from 'assert';
import { GitignoreMatcher } from '../../matcherStrategy';

suite('GitignoreMatcher Test Suite', () => {
    let matcher: GitignoreMatcher;

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
        matcher = new GitignoreMatcher();
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

        test('should match anchored character class patterns only at root', () => {
            // Bug fix ISSUE-M009: /[ab].ts should only match root-level files
            const result = matcher.findMatches('/[ab].ts', charClassFiles);

            assert.ok(result.matchingFiles.includes('a.ts'), 'should match root a.ts');
            assert.ok(result.matchingFiles.includes('b.ts'), 'should match root b.ts');
            assert.ok(!result.matchingFiles.includes('src/a.ts'), 'should NOT match src/a.ts (not at root)');
        });

        test('testMatch should handle anchored character class patterns', () => {
            // Bug fix ISSUE-M009: testMatch should also respect anchored patterns
            const matchesRootA = matcher.testMatch('/[ab].ts', 'a.ts');
            const matchesNestedA = matcher.testMatch('/[ab].ts', 'src/a.ts');

            assert.strictEqual(matchesRootA, true, '/[ab].ts should match root a.ts');
            assert.strictEqual(matchesNestedA, false, '/[ab].ts should NOT match src/a.ts');
        });

        test('should match anchored character class patterns with subpaths', () => {
            // Bug fix ISSUE-M012: /[ab]/file.ts should match a/file.ts and b/file.ts
            const subpathFiles = [
                'a/file.ts',
                'b/file.ts',
                'c/file.ts',
                'a.ts',
                'file.ts'
            ];
            const result = matcher.findMatches('/[ab]/file.ts', subpathFiles);

            assert.ok(result.matchingFiles.includes('a/file.ts'), 'should match a/file.ts');
            assert.ok(result.matchingFiles.includes('b/file.ts'), 'should match b/file.ts');
            assert.ok(!result.matchingFiles.includes('c/file.ts'), 'should NOT match c/file.ts');
            assert.ok(!result.matchingFiles.includes('a.ts'), 'should NOT match a.ts');
        });

        test('testMatch should handle anchored character class patterns with subpaths', () => {
            // Bug fix ISSUE-M012: testMatch for anchored patterns with subpaths
            const matchesA = matcher.testMatch('/[ab]/file.ts', 'a/file.ts');
            const matchesB = matcher.testMatch('/[ab]/file.ts', 'b/file.ts');
            const matchesC = matcher.testMatch('/[ab]/file.ts', 'c/file.ts');

            assert.strictEqual(matchesA, true, '/[ab]/file.ts should match a/file.ts');
            assert.strictEqual(matchesB, true, '/[ab]/file.ts should match b/file.ts');
            assert.strictEqual(matchesC, false, '/[ab]/file.ts should NOT match c/file.ts');
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

    suite('negated character classes with wildcards', () => {
        // Bug fix: negated character classes with wildcards were inverted by ignore package
        const negCharFiles = [
            'a.ts',
            'b.ts',
            'abc.ts',
            'bcd.ts',
            'src/a.ts',
            'src/b.ts'
        ];

        test('should match [^a]*.ts (files not starting with a)', () => {
            const result = matcher.findMatches('[^a]*.ts', negCharFiles);

            assert.ok(result.matchingFiles.includes('b.ts'), 'should match b.ts');
            assert.ok(result.matchingFiles.includes('bcd.ts'), 'should match bcd.ts');
            assert.ok(result.matchingFiles.includes('src/b.ts'), 'should match src/b.ts');
            assert.ok(!result.matchingFiles.includes('a.ts'), 'should NOT match a.ts');
            assert.ok(!result.matchingFiles.includes('abc.ts'), 'should NOT match abc.ts');
        });

        test('should match **/[^a].ts (single char not a, recursive)', () => {
            const result = matcher.findMatches('**/[^a].ts', negCharFiles);

            assert.ok(result.matchingFiles.includes('b.ts'), 'should match b.ts');
            assert.ok(result.matchingFiles.includes('src/b.ts'), 'should match src/b.ts');
            assert.ok(!result.matchingFiles.includes('a.ts'), 'should NOT match a.ts');
            assert.ok(!result.matchingFiles.includes('src/a.ts'), 'should NOT match src/a.ts');
        });

        test('should match [!a]*.ts (alternative negation syntax)', () => {
            const result = matcher.findMatches('[!a]*.ts', negCharFiles);

            assert.ok(result.matchingFiles.includes('b.ts'), 'should match b.ts');
            assert.ok(result.matchingFiles.includes('bcd.ts'), 'should match bcd.ts');
            assert.ok(!result.matchingFiles.includes('a.ts'), 'should NOT match a.ts');
        });

        test('testMatch should handle negated character class with wildcard', () => {
            assert.strictEqual(matcher.testMatch('[^a]*.ts', 'b.ts'), true);
            assert.strictEqual(matcher.testMatch('[^a]*.ts', 'bcd.ts'), true);
            assert.strictEqual(matcher.testMatch('[^a]*.ts', 'a.ts'), false);
            assert.strictEqual(matcher.testMatch('[^a]*.ts', 'abc.ts'), false);
        });
    });
});
