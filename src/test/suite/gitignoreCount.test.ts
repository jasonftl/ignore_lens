// Date: 05/01/2026
// Unit tests for the GitignoreCountCalculator class

import * as assert from 'assert';
import { GitignoreCountCalculator, isUnderIgnoredDir } from '../../countStrategy';

suite('GitignoreCountCalculator Test Suite', () => {
    // Create a calculator instance for use across tests
    const calculator = new GitignoreCountCalculator();

    suite('isUnderIgnoredDir', () => {
        test('should return true for file under ignored directory', () => {
            const ignoredDirs = new Set<string>(['dist/', 'node_modules/']);

            assert.strictEqual(isUnderIgnoredDir('dist/bundle.js', ignoredDirs), true);
            assert.strictEqual(isUnderIgnoredDir('dist/sub/file.js', ignoredDirs), true);
            assert.strictEqual(isUnderIgnoredDir('node_modules/lodash/index.js', ignoredDirs), true);
        });

        test('should return false for file not under ignored directory', () => {
            const ignoredDirs = new Set<string>(['dist/', 'node_modules/']);

            assert.strictEqual(isUnderIgnoredDir('src/app.js', ignoredDirs), false);
            assert.strictEqual(isUnderIgnoredDir('index.js', ignoredDirs), false);
        });

        test('should return false for empty ignoredDirs', () => {
            const ignoredDirs = new Set<string>();

            assert.strictEqual(isUnderIgnoredDir('dist/bundle.js', ignoredDirs), false);
        });
    });

    suite('calculateCount', () => {

        suite('normal patterns (add to set)', () => {
            test('should add all files when set is empty', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.js');

                assert.strictEqual(result.actionCount, 2);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 2);
                assert.ok(cumulativeSet.has('file1.js'));
                assert.ok(cumulativeSet.has('file2.js'));
            });

            test('should only count newly added files', () => {
                const matchingFiles = ['file1.js', 'file2.js', 'file3.js'];
                const cumulativeSet = new Set<string>(['file1.js']);
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.js');

                assert.strictEqual(result.actionCount, 2);
                assert.strictEqual(result.noActionCount, 1);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 3);
            });

            test('should return zero action when all files already in set', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>(['file1.js', 'file2.js']);
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.js');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 2);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 2);
            });

            test('should return zero for empty matches', () => {
                const matchingFiles: string[] = [];
                const cumulativeSet = new Set<string>(['file1.js']);
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.ts');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 1);
            });

            test('should add directory prefix to ignoredDirs for directory patterns', () => {
                const matchingFiles = ['dist/bundle.js', 'dist/index.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');

                assert.strictEqual(result.actionCount, 2);
                assert.ok(ignoredDirs.has('dist/'));
            });

            test('should NOT add directory prefix to ignoredDirs for dir/** patterns', () => {
                // Per Git docs: dir/** only ignores contents, not the directory itself
                // Git still traverses the directory and can apply negation patterns
                const matchingFiles = ['dist/bundle.js', 'dist/sub/index.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, 'dist/**');

                assert.strictEqual(result.actionCount, 2);
                assert.ok(!ignoredDirs.has('dist/'));  // Should NOT be in ignoredDirs
            });

            test('should NOT add directory prefix to ignoredDirs for dir/* patterns', () => {
                // dir/* only matches immediate contents, not the directory itself
                // so negations should still be allowed for files under the directory
                const matchingFiles = ['build/app.js', 'build/lib.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, 'build/*');

                assert.strictEqual(result.actionCount, 2);
                assert.ok(!ignoredDirs.has('build/'));  // Should NOT be in ignoredDirs
            });
        });

        suite('negation patterns (remove from set)', () => {
            test('should remove files from set', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>(['file1.js', 'file2.js', 'file3.js']);
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.js');

                assert.strictEqual(result.actionCount, 2);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 1);
                assert.ok(!cumulativeSet.has('file1.js'));
                assert.ok(!cumulativeSet.has('file2.js'));
                assert.ok(cumulativeSet.has('file3.js'));
            });

            test('should count files not in set as no-action', () => {
                const matchingFiles = ['file1.js', 'file2.js', 'file3.js'];
                const cumulativeSet = new Set<string>(['file1.js']);
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.js');

                assert.strictEqual(result.actionCount, 1);
                assert.strictEqual(result.noActionCount, 2);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 0);
            });

            test('should return zero action when no files in set', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.js');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 2);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 0);
            });

            test('should return zero for empty matches', () => {
                const matchingFiles: string[] = [];
                const cumulativeSet = new Set<string>(['file1.js']);
                const ignoredDirs = new Set<string>();

                const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.ts');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 1);
            });

            test('should block negation for files under ignored directory', () => {
                const matchingFiles = ['dist/bundle.js', 'dist/index.js'];
                const cumulativeSet = new Set<string>(['dist/bundle.js', 'dist/index.js']);
                const ignoredDirs = new Set<string>(['dist/']);

                const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!dist/*.js');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 2);
                assert.strictEqual(result.setSize, 2);
                // Files should still be in set - not removed
                assert.ok(cumulativeSet.has('dist/bundle.js'));
                assert.ok(cumulativeSet.has('dist/index.js'));
            });

            test('should allow negation for files not under ignored directory', () => {
                const matchingFiles = ['src/app.js'];
                const cumulativeSet = new Set<string>(['src/app.js', 'dist/bundle.js']);
                const ignoredDirs = new Set<string>(['dist/']);

                const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!src/app.js');

                assert.strictEqual(result.actionCount, 1);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 1);
                assert.ok(!cumulativeSet.has('src/app.js'));
            });

            test('should remove directory from ignoredDirs when negating directory', () => {
                const matchingFiles = ['dist/bundle.js', 'dist/index.js'];
                const cumulativeSet = new Set<string>(['dist/bundle.js', 'dist/index.js']);
                const ignoredDirs = new Set<string>(['dist/']);

                // Negation directory pattern !dist/ should remove dist/ from ignoredDirs
                const result = calculator.calculateCount(matchingFiles, true, true, cumulativeSet, ignoredDirs, '!dist/');

                // After removing from ignoredDirs, files can be un-ignored
                assert.strictEqual(result.actionCount, 2);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 0);
                assert.ok(!ignoredDirs.has('dist/'));
            });

            test('should remove empty directory from ignoredDirs when negating', () => {
                // Edge case: negating an empty directory should still remove it from ignoredDirs
                const matchingFiles: string[] = [];  // Empty directory has no files
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>(['empty/']);

                // Negation directory pattern !empty/ should remove empty/ from ignoredDirs
                const result = calculator.calculateCount(matchingFiles, true, true, cumulativeSet, ignoredDirs, '!empty/');

                // Directory should be removed from ignoredDirs even with no matching files
                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.ok(!ignoredDirs.has('empty/'));
            });
        });

        suite('sequential pattern scenarios', () => {
            test('should track single set with add and remove operations', () => {
                // Simulates: node_modules/, *.js, !important.js, *.ts, !config.ts
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();
                const allFiles = [
                    'node_modules/lodash/index.js',
                    'node_modules/lodash/package.json',
                    'src/app.js',
                    'src/utils.js',
                    'important.js',
                    'src/main.ts',
                    'config.ts'
                ];

                // Pattern 1: node_modules/ matches 2 files - adds both
                const nodeModulesFiles = allFiles.filter(f => f.startsWith('node_modules/'));
                const result1 = calculator.calculateCount(nodeModulesFiles, false, true, cumulativeSet, ignoredDirs, 'node_modules/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.noActionCount, 0);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(ignoredDirs.has('node_modules/'));

                // Pattern 2: *.js matches 4 files - 1 already in set, 3 added
                const jsFiles = allFiles.filter(f => f.endsWith('.js'));
                const result2 = calculator.calculateCount(jsFiles, false, false, cumulativeSet, ignoredDirs, '*.js');
                assert.strictEqual(result2.actionCount, 3);
                assert.strictEqual(result2.noActionCount, 1);
                assert.strictEqual(result2.setSize, 5);

                // Pattern 3: !important.js - removes 1 file from set (not under ignored dir)
                const importantFiles = ['important.js'];
                const result3 = calculator.calculateCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!important.js');
                assert.strictEqual(result3.actionCount, 1);
                assert.strictEqual(result3.noActionCount, 0);
                assert.strictEqual(result3.blockedCount, 0);
                assert.strictEqual(result3.setSize, 4);
                assert.ok(!cumulativeSet.has('important.js'));

                // Pattern 4: *.ts matches 2 files - adds both
                const tsFiles = allFiles.filter(f => f.endsWith('.ts'));
                const result4 = calculator.calculateCount(tsFiles, false, false, cumulativeSet, ignoredDirs, '*.ts');
                assert.strictEqual(result4.actionCount, 2);
                assert.strictEqual(result4.noActionCount, 0);
                assert.strictEqual(result4.setSize, 6);

                // Pattern 5: !config.ts - removes 1 file from set
                const configFiles = ['config.ts'];
                const result5 = calculator.calculateCount(configFiles, true, false, cumulativeSet, ignoredDirs, '!config.ts');
                assert.strictEqual(result5.actionCount, 1);
                assert.strictEqual(result5.noActionCount, 0);
                assert.strictEqual(result5.setSize, 5);
                assert.ok(!cumulativeSet.has('config.ts'));

                // Final state: set has 5 files
                assert.strictEqual(cumulativeSet.size, 5);
            });

            test('should block negation for files under directory ignored earlier', () => {
                // Simulates: dist/, !dist/important.js
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: dist/ matches files - directory pattern
                const distFiles = ['dist/bundle.js', 'dist/important.js'];
                const result1 = calculator.calculateCount(distFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(ignoredDirs.has('dist/'));

                // Pattern 2: !dist/important.js - should be blocked
                const importantFiles = ['dist/important.js'];
                const result2 = calculator.calculateCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!dist/important.js');
                assert.strictEqual(result2.actionCount, 0);
                assert.strictEqual(result2.blockedCount, 1);
                assert.strictEqual(result2.setSize, 2);
                // File should still be in set
                assert.ok(cumulativeSet.has('dist/important.js'));
            });

            test('should allow negation after dir/** pattern (not blocked)', () => {
                // Simulates: dist/**, !dist/sub/important.js
                // Per Git docs: dir/** only ignores contents, not the directory itself
                // Git still traverses the directory and can apply negation patterns
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: dist/** matches files but does NOT add to ignoredDirs
                const distFiles = ['dist/bundle.js', 'dist/sub/important.js'];
                const result1 = calculator.calculateCount(distFiles, false, false, cumulativeSet, ignoredDirs, 'dist/**');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(!ignoredDirs.has('dist/'));  // NOT in ignoredDirs

                // Pattern 2: !dist/sub/important.js - should NOT be blocked
                const importantFiles = ['dist/sub/important.js'];
                const result2 = calculator.calculateCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!dist/sub/important.js');
                assert.strictEqual(result2.actionCount, 1);  // Successfully removed
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
                assert.strictEqual(result2.setSize, 1);
            });

            test('should allow negation with !dir/** after dir/ to clear ignoredDirs', () => {
                // Simulates: dist/, !dist/** (negating the whole directory with glob pattern)
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: dist/ matches files - explicit directory pattern adds to ignoredDirs
                const distFiles = ['dist/bundle.js', 'dist/sub/important.js'];
                const result1 = calculator.calculateCount(distFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(ignoredDirs.has('dist/'));  // Only dir/ adds to ignoredDirs

                // Pattern 2: !dist/** should clear dist/ from ignoredDirs and remove files
                const result2 = calculator.calculateCount(distFiles, true, false, cumulativeSet, ignoredDirs, '!dist/**');
                assert.ok(!ignoredDirs.has('dist/'));  // dist/ should be removed from ignoredDirs
                assert.strictEqual(result2.actionCount, 2);  // Files should be removed from set
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
                assert.strictEqual(result2.setSize, 0);
            });

            test('should allow negation after dir/* pattern (not blocked)', () => {
                // Simulates: dist/*, !dist/important.js
                // dir/* does NOT block negations (only matches immediate contents)
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: dist/* matches files but does NOT add to ignoredDirs
                const distFiles = ['dist/bundle.js', 'dist/important.js'];
                const result1 = calculator.calculateCount(distFiles, false, false, cumulativeSet, ignoredDirs, 'dist/*');
                assert.strictEqual(result1.actionCount, 2);
                assert.ok(!ignoredDirs.has('dist/'));  // NOT in ignoredDirs

                // Pattern 2: !dist/important.js should NOT be blocked
                const importantFiles = ['dist/important.js'];
                const result2 = calculator.calculateCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!dist/important.js');
                assert.strictEqual(result2.actionCount, 1);  // Successfully removed
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
                assert.strictEqual(result2.setSize, 1);
            });

            test('should allow negation after negating directory', () => {
                // Simulates: dist/, !dist/, dist/secret.js (file under dist/ now un-ignored then re-added)
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: dist/ ignores the directory
                const distFiles = ['dist/bundle.js', 'dist/important.js'];
                calculator.calculateCount(distFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');
                assert.ok(ignoredDirs.has('dist/'));
                assert.strictEqual(cumulativeSet.size, 2);

                // Pattern 2: !dist/ un-ignores the directory
                const result2 = calculator.calculateCount(distFiles, true, true, cumulativeSet, ignoredDirs, '!dist/');
                assert.ok(!ignoredDirs.has('dist/'));
                assert.strictEqual(result2.actionCount, 2);
                assert.strictEqual(cumulativeSet.size, 0);

                // Pattern 3: dist/secret.js can now be added without blocking
                const secretFiles = ['dist/secret.js'];
                const result3 = calculator.calculateCount(secretFiles, false, false, cumulativeSet, ignoredDirs, 'dist/secret.js');
                assert.strictEqual(result3.actionCount, 1);
                assert.strictEqual(cumulativeSet.size, 1);
            });

            test('should handle escaped directory names with glob metacharacters', () => {
                // Simulates: \[tmp\]/, !\[tmp\]/** - literal directory name [tmp]
                // To match literal brackets, they must be escaped
                // Unescaped [tmp]/ is a character class matching t/, m/, or p/
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: \[tmp\]/ ignores the literal directory [tmp]/
                const tmpFiles = ['[tmp]/file1.txt', '[tmp]/sub/file2.txt'];
                calculator.calculateCount(tmpFiles, false, true, cumulativeSet, ignoredDirs, '\\[tmp\\]/');
                // Stored as unescaped form: [tmp]/
                assert.ok(ignoredDirs.has('[tmp]/'));
                assert.strictEqual(cumulativeSet.size, 2);

                // Pattern 2: !\[tmp\]/** should clear [tmp]/ from ignoredDirs
                const result2 = calculator.calculateCount(tmpFiles, true, false, cumulativeSet, ignoredDirs, '!\\[tmp\\]/**');
                assert.ok(!ignoredDirs.has('[tmp]/'));  // Should be removed
                assert.strictEqual(result2.actionCount, 2);  // Files should be removed from set
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
                assert.strictEqual(result2.setSize, 0);
            });

            test('should NOT block negations for dir/**/ patterns with trailing slash', () => {
                // Simulates: node_modules/**/, !node_modules/ignore/
                // Bug fix: dir/**/ was incorrectly treated as blocking directory pattern
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: node_modules/**/ should NOT add to ignoredDirs
                const nodeFiles = ['node_modules/lodash/index.js', 'node_modules/ignore/index.js'];
                const result1 = calculator.calculateCount(nodeFiles, false, true, cumulativeSet, ignoredDirs, 'node_modules/**/');
                assert.strictEqual(result1.actionCount, 2);
                assert.ok(!ignoredDirs.has('node_modules/'));  // Should NOT be in ignoredDirs

                // Pattern 2: !node_modules/ignore/ should NOT be blocked
                const ignoreFiles = ['node_modules/ignore/index.js'];
                const result2 = calculator.calculateCount(ignoreFiles, true, true, cumulativeSet, ignoredDirs, '!node_modules/ignore/');
                assert.strictEqual(result2.actionCount, 1);  // Successfully removed
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
                assert.strictEqual(result2.setSize, 1);
            });

            test('should store correct prefix for nested directory patterns', () => {
                // Bug fix: src/vendor/ was storing "src/" instead of "src/vendor/"
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern: src/vendor/ should store "src/vendor/", not "src/"
                const vendorFiles = ['src/vendor/lib.js', 'src/vendor/util.js'];
                calculator.calculateCount(vendorFiles, false, true, cumulativeSet, ignoredDirs, 'src/vendor/');

                // Should have "src/vendor/" in ignoredDirs, NOT "src/"
                assert.ok(ignoredDirs.has('src/vendor/'));
                assert.ok(!ignoredDirs.has('src/'));

                // src/app.js should NOT be blocked (not under src/vendor/)
                assert.strictEqual(isUnderIgnoredDir('src/app.js', ignoredDirs), false);

                // src/vendor/lib.js SHOULD be blocked
                assert.strictEqual(isUnderIgnoredDir('src/vendor/lib.js', ignoredDirs), true);
            });

            test('should handle anchored patterns with leading slash', () => {
                // Bug fix: /dist/ should store "dist/" (without leading /)
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern: /dist/ (anchored) should store "dist/"
                const distFiles = ['dist/bundle.js'];
                calculator.calculateCount(distFiles, false, true, cumulativeSet, ignoredDirs, '/dist/');

                // Should have "dist/" in ignoredDirs, NOT "/dist/"
                assert.ok(ignoredDirs.has('dist/'));
                assert.ok(!ignoredDirs.has('/dist/'));
            });

            test('should clear ignoredDirs with anchored negation patterns', () => {
                // Bug fix: !/dist/ was trying to delete "/dist/" but stored as "dist/"
                const cumulativeSet = new Set<string>(['dist/bundle.js', 'dist/important.js']);
                const ignoredDirs = new Set<string>(['dist/']);

                // Pattern: !/dist/ should delete "dist/" from ignoredDirs
                const distFiles = ['dist/important.js'];
                const result = calculator.calculateCount(distFiles, true, true, cumulativeSet, ignoredDirs, '!/dist/');

                // ignoredDirs should be empty now
                assert.strictEqual(ignoredDirs.size, 0);
                // File should be removed from set
                assert.strictEqual(result.actionCount, 1);
                assert.strictEqual(result.blockedCount, 0);
            });

            test('should block negations for escaped directory patterns', () => {
                // Bug fix ISSUE-M003: \[temp\]/ was not detected as blocking
                // Pattern \[temp\]/ should block negations like !\[temp\]/*.tmp
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: \[temp\]/ ignores the directory (escaped brackets)
                const tempFiles = ['[temp]/cache.tmp', '[temp]/data.tmp'];
                const result1 = calculator.calculateCount(tempFiles, false, true, cumulativeSet, ignoredDirs, '\\[temp\\]/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                // Should store "[temp]/" (unescaped) in ignoredDirs
                assert.ok(ignoredDirs.has('[temp]/'));

                // Pattern 2: !\[temp\]/*.tmp should be BLOCKED
                const result2 = calculator.calculateCount(tempFiles, true, false, cumulativeSet, ignoredDirs, '!\\[temp\\]/*.tmp');
                assert.strictEqual(result2.actionCount, 0);  // Nothing removed
                assert.strictEqual(result2.blockedCount, 2);  // Both blocked
                assert.strictEqual(result2.setSize, 2);  // Set unchanged
            });

            test('should treat escaped wildcards as literal characters in directory patterns', () => {
                // Bug fix ISSUE-M004: dir\*/ should block negations (escaped * is literal)
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern: dir\*/ is a directory named "dir*" (literal asterisk)
                const starDirFiles = ['dir*/file.txt', 'dir*/sub/file2.txt'];
                const result1 = calculator.calculateCount(starDirFiles, false, true, cumulativeSet, ignoredDirs, 'dir\\*/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                // Should store "dir*/" (unescaped) in ignoredDirs - NOT treated as glob
                assert.ok(ignoredDirs.has('dir*/'));

                // Negation should be blocked
                const result2 = calculator.calculateCount(starDirFiles, true, false, cumulativeSet, ignoredDirs, '!dir\\*/*.txt');
                assert.strictEqual(result2.blockedCount, 2);  // Both blocked
            });

            test('should clear ignoredDirs with escaped directory in /** negation', () => {
                // Bug fix ISSUE-M005: !\[temp\]/** should clear [temp]/ from ignoredDirs
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: \[temp\]/ adds to ignoredDirs
                const tempFiles = ['[temp]/file1.txt', '[temp]/file2.txt'];
                calculator.calculateCount(tempFiles, false, true, cumulativeSet, ignoredDirs, '\\[temp\\]/');
                assert.ok(ignoredDirs.has('[temp]/'));
                assert.strictEqual(cumulativeSet.size, 2);

                // Pattern 2: !\[temp\]/** should clear [temp]/ from ignoredDirs and un-ignore
                const result2 = calculator.calculateCount(tempFiles, true, false, cumulativeSet, ignoredDirs, '!\\[temp\\]/**');
                assert.ok(!ignoredDirs.has('[temp]/'));  // Should be removed
                assert.strictEqual(result2.actionCount, 2);  // Files un-ignored
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
                assert.strictEqual(result2.setSize, 0);
            });

            test('should NOT store character class directory patterns as literal prefixes', () => {
                // Bug fix ISSUE-M007: [ab]/ should be treated as wildcard, not stored literally
                // Git treats [ab]/ as matching directories 'a' or 'b', not a literal '[ab]'
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern: [ab]/ is a glob pattern matching directories a/ or b/
                const files = ['a/file.txt', 'b/file.txt'];
                calculator.calculateCount(files, false, true, cumulativeSet, ignoredDirs, '[ab]/');

                // Should NOT store '[ab]/' as literal prefix (it's a wildcard pattern)
                assert.ok(!ignoredDirs.has('[ab]/'));
                // Files should still be added to cumulative set
                assert.strictEqual(cumulativeSet.size, 2);
            });

            test('should allow negations for files under character class matched directories', () => {
                // Bug fix ISSUE-M007: Negations under [ab]/ matched dirs should work
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: [ab]/ matches a/ and b/
                const files = ['a/file.txt', 'b/file.txt'];
                calculator.calculateCount(files, false, true, cumulativeSet, ignoredDirs, '[ab]/');
                assert.strictEqual(cumulativeSet.size, 2);
                // ignoredDirs should be empty (pattern is a wildcard)
                assert.strictEqual(ignoredDirs.size, 0);

                // Pattern 2: !a/file.txt should work (not blocked)
                const result2 = calculator.calculateCount(['a/file.txt'], true, false, cumulativeSet, ignoredDirs, '!a/file.txt');
                assert.strictEqual(result2.actionCount, 1);  // Successfully removed
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
            });
        });
    });
});
