// Date: 02/12/2025
// Unit tests for the count calculator functions

import * as assert from 'assert';
import { calculateAdvancedCount, isUnderIgnoredDir } from '../../countCalculator';

suite('CountCalculator Test Suite', () => {

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

    suite('calculateAdvancedCount', () => {

        suite('normal patterns (add to set)', () => {
            test('should add all files when set is empty', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.js');

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

                const result = calculateAdvancedCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.js');

                assert.strictEqual(result.actionCount, 2);
                assert.strictEqual(result.noActionCount, 1);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 3);
            });

            test('should return zero action when all files already in set', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>(['file1.js', 'file2.js']);
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.js');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 2);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 2);
            });

            test('should return zero for empty matches', () => {
                const matchingFiles: string[] = [];
                const cumulativeSet = new Set<string>(['file1.js']);
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.ts');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 1);
            });

            test('should add directory prefix to ignoredDirs for directory patterns', () => {
                const matchingFiles = ['dist/bundle.js', 'dist/index.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');

                assert.strictEqual(result.actionCount, 2);
                assert.ok(ignoredDirs.has('dist/'));
            });

            test('should NOT add directory prefix to ignoredDirs for dir/** patterns', () => {
                // Per Git docs: dir/** only ignores contents, not the directory itself
                // Git still traverses the directory and can apply negation patterns
                const matchingFiles = ['dist/bundle.js', 'dist/sub/index.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, 'dist/**');

                assert.strictEqual(result.actionCount, 2);
                assert.ok(!ignoredDirs.has('dist/'));  // Should NOT be in ignoredDirs
            });

            test('should NOT add directory prefix to ignoredDirs for dir/* patterns', () => {
                // dir/* only matches immediate contents, not the directory itself
                // so negations should still be allowed for files under the directory
                const matchingFiles = ['build/app.js', 'build/lib.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, 'build/*');

                assert.strictEqual(result.actionCount, 2);
                assert.ok(!ignoredDirs.has('build/'));  // Should NOT be in ignoredDirs
            });
        });

        suite('negation patterns (remove from set)', () => {
            test('should remove files from set', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>(['file1.js', 'file2.js', 'file3.js']);
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.js');

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

                const result = calculateAdvancedCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.js');

                assert.strictEqual(result.actionCount, 1);
                assert.strictEqual(result.noActionCount, 2);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 0);
            });

            test('should return zero action when no files in set', () => {
                const matchingFiles = ['file1.js', 'file2.js'];
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.js');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 2);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 0);
            });

            test('should return zero for empty matches', () => {
                const matchingFiles: string[] = [];
                const cumulativeSet = new Set<string>(['file1.js']);
                const ignoredDirs = new Set<string>();

                const result = calculateAdvancedCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.ts');

                assert.strictEqual(result.actionCount, 0);
                assert.strictEqual(result.noActionCount, 0);
                assert.strictEqual(result.blockedCount, 0);
                assert.strictEqual(result.setSize, 1);
            });

            test('should block negation for files under ignored directory', () => {
                const matchingFiles = ['dist/bundle.js', 'dist/index.js'];
                const cumulativeSet = new Set<string>(['dist/bundle.js', 'dist/index.js']);
                const ignoredDirs = new Set<string>(['dist/']);

                const result = calculateAdvancedCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!dist/*.js');

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

                const result = calculateAdvancedCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!src/app.js');

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
                const result = calculateAdvancedCount(matchingFiles, true, true, cumulativeSet, ignoredDirs, '!dist/');

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
                const result = calculateAdvancedCount(matchingFiles, true, true, cumulativeSet, ignoredDirs, '!empty/');

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
                const result1 = calculateAdvancedCount(nodeModulesFiles, false, true, cumulativeSet, ignoredDirs, 'node_modules/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.noActionCount, 0);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(ignoredDirs.has('node_modules/'));

                // Pattern 2: *.js matches 4 files - 1 already in set, 3 added
                const jsFiles = allFiles.filter(f => f.endsWith('.js'));
                const result2 = calculateAdvancedCount(jsFiles, false, false, cumulativeSet, ignoredDirs, '*.js');
                assert.strictEqual(result2.actionCount, 3);
                assert.strictEqual(result2.noActionCount, 1);
                assert.strictEqual(result2.setSize, 5);

                // Pattern 3: !important.js - removes 1 file from set (not under ignored dir)
                const importantFiles = ['important.js'];
                const result3 = calculateAdvancedCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!important.js');
                assert.strictEqual(result3.actionCount, 1);
                assert.strictEqual(result3.noActionCount, 0);
                assert.strictEqual(result3.blockedCount, 0);
                assert.strictEqual(result3.setSize, 4);
                assert.ok(!cumulativeSet.has('important.js'));

                // Pattern 4: *.ts matches 2 files - adds both
                const tsFiles = allFiles.filter(f => f.endsWith('.ts'));
                const result4 = calculateAdvancedCount(tsFiles, false, false, cumulativeSet, ignoredDirs, '*.ts');
                assert.strictEqual(result4.actionCount, 2);
                assert.strictEqual(result4.noActionCount, 0);
                assert.strictEqual(result4.setSize, 6);

                // Pattern 5: !config.ts - removes 1 file from set
                const configFiles = ['config.ts'];
                const result5 = calculateAdvancedCount(configFiles, true, false, cumulativeSet, ignoredDirs, '!config.ts');
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
                const result1 = calculateAdvancedCount(distFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(ignoredDirs.has('dist/'));

                // Pattern 2: !dist/important.js - should be blocked
                const importantFiles = ['dist/important.js'];
                const result2 = calculateAdvancedCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!dist/important.js');
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
                const result1 = calculateAdvancedCount(distFiles, false, false, cumulativeSet, ignoredDirs, 'dist/**');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(!ignoredDirs.has('dist/'));  // NOT in ignoredDirs

                // Pattern 2: !dist/sub/important.js - should NOT be blocked
                const importantFiles = ['dist/sub/important.js'];
                const result2 = calculateAdvancedCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!dist/sub/important.js');
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
                const result1 = calculateAdvancedCount(distFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');
                assert.strictEqual(result1.actionCount, 2);
                assert.strictEqual(result1.setSize, 2);
                assert.ok(ignoredDirs.has('dist/'));  // Only dir/ adds to ignoredDirs

                // Pattern 2: !dist/** should clear dist/ from ignoredDirs and remove files
                const result2 = calculateAdvancedCount(distFiles, true, false, cumulativeSet, ignoredDirs, '!dist/**');
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
                const result1 = calculateAdvancedCount(distFiles, false, false, cumulativeSet, ignoredDirs, 'dist/*');
                assert.strictEqual(result1.actionCount, 2);
                assert.ok(!ignoredDirs.has('dist/'));  // NOT in ignoredDirs

                // Pattern 2: !dist/important.js should NOT be blocked
                const importantFiles = ['dist/important.js'];
                const result2 = calculateAdvancedCount(importantFiles, true, false, cumulativeSet, ignoredDirs, '!dist/important.js');
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
                calculateAdvancedCount(distFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');
                assert.ok(ignoredDirs.has('dist/'));
                assert.strictEqual(cumulativeSet.size, 2);

                // Pattern 2: !dist/ un-ignores the directory
                const result2 = calculateAdvancedCount(distFiles, true, true, cumulativeSet, ignoredDirs, '!dist/');
                assert.ok(!ignoredDirs.has('dist/'));
                assert.strictEqual(result2.actionCount, 2);
                assert.strictEqual(cumulativeSet.size, 0);

                // Pattern 3: dist/secret.js can now be added without blocking
                const secretFiles = ['dist/secret.js'];
                const result3 = calculateAdvancedCount(secretFiles, false, false, cumulativeSet, ignoredDirs, 'dist/secret.js');
                assert.strictEqual(result3.actionCount, 1);
                assert.strictEqual(cumulativeSet.size, 1);
            });

            test('should handle directory names with glob metacharacters', () => {
                // Simulates: [tmp]/, ![tmp]/** - directory name contains [ and ]
                // Bug fix: regex previously excluded dir names with *, ?, [, ]
                const cumulativeSet = new Set<string>();
                const ignoredDirs = new Set<string>();

                // Pattern 1: [tmp]/ ignores the directory (name contains metacharacters)
                const tmpFiles = ['[tmp]/file1.txt', '[tmp]/sub/file2.txt'];
                calculateAdvancedCount(tmpFiles, false, true, cumulativeSet, ignoredDirs, '[tmp]/');
                assert.ok(ignoredDirs.has('[tmp]/'));
                assert.strictEqual(cumulativeSet.size, 2);

                // Pattern 2: ![tmp]/** should clear [tmp]/ from ignoredDirs
                const result2 = calculateAdvancedCount(tmpFiles, true, false, cumulativeSet, ignoredDirs, '![tmp]/**');
                assert.ok(!ignoredDirs.has('[tmp]/'));  // Should be removed despite metacharacters
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
                const result1 = calculateAdvancedCount(nodeFiles, false, true, cumulativeSet, ignoredDirs, 'node_modules/**/');
                assert.strictEqual(result1.actionCount, 2);
                assert.ok(!ignoredDirs.has('node_modules/'));  // Should NOT be in ignoredDirs

                // Pattern 2: !node_modules/ignore/ should NOT be blocked
                const ignoreFiles = ['node_modules/ignore/index.js'];
                const result2 = calculateAdvancedCount(ignoreFiles, true, true, cumulativeSet, ignoredDirs, '!node_modules/ignore/');
                assert.strictEqual(result2.actionCount, 1);  // Successfully removed
                assert.strictEqual(result2.blockedCount, 0);  // Not blocked
                assert.strictEqual(result2.setSize, 1);
            });
        });
    });
});
