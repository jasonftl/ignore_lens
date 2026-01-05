// Date: 05/01/2026
// Unit tests for the VscodeignoreCountCalculator class

import * as assert from 'assert';
import { VscodeignoreCountCalculator } from '../../countStrategy';

suite('VscodeignoreCountCalculator Test Suite', () => {
    let calculator: VscodeignoreCountCalculator;

    setup(() => {
        calculator = new VscodeignoreCountCalculator();
    });

    suite('normal patterns (add to set)', () => {
        test('should add all files when set is empty', () => {
            const matchingFiles = ['a.txt', 'b.txt', 'c.txt'];
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();

            const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.txt');

            assert.strictEqual(result.actionCount, 3);
            assert.strictEqual(result.noActionCount, 0);
            assert.strictEqual(result.blockedCount, 0);
            assert.strictEqual(result.setSize, 3);
        });

        test('should only count newly added files', () => {
            const matchingFiles = ['a.txt', 'b.txt', 'c.txt'];
            const cumulativeSet = new Set<string>(['a.txt']);
            const ignoredDirs = new Set<string>();

            const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.txt');

            assert.strictEqual(result.actionCount, 2);
            assert.strictEqual(result.noActionCount, 1);
            assert.strictEqual(result.blockedCount, 0);
        });
    });

    suite('negation patterns - NO directory blocking', () => {
        test('should NOT block negations for files under ignored directory', () => {
            // In vscodeignore, negations always work - no directory blocking
            const matchingFiles = ['dist/bundle.js', 'dist/index.js'];
            const cumulativeSet = new Set<string>(['dist/bundle.js', 'dist/index.js']);
            const ignoredDirs = new Set<string>(['dist/']);  // Would block in gitignore

            const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!dist/*.js');

            // Unlike gitignore, vscodeignore allows negation - files are removed
            assert.strictEqual(result.actionCount, 2);
            assert.strictEqual(result.blockedCount, 0);  // No blocking!
            assert.strictEqual(result.setSize, 0);
        });

        test('should remove files from set', () => {
            const matchingFiles = ['a.txt', 'b.txt'];
            const cumulativeSet = new Set<string>(['a.txt', 'b.txt', 'c.txt']);
            const ignoredDirs = new Set<string>();

            const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.txt');

            assert.strictEqual(result.actionCount, 2);
            assert.strictEqual(result.noActionCount, 0);
            assert.strictEqual(result.setSize, 1);  // Only c.txt remains
        });

        test('should count files not in set as no-action', () => {
            const matchingFiles = ['a.txt', 'b.txt'];
            const cumulativeSet = new Set<string>(['a.txt']);  // b.txt not in set
            const ignoredDirs = new Set<string>();

            const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!*.txt');

            assert.strictEqual(result.actionCount, 1);  // a.txt removed
            assert.strictEqual(result.noActionCount, 1);  // b.txt not in set
        });

        test('should allow negation even for deeply nested files under ignored dir', () => {
            // vscodeignore allows negating files at any depth
            const matchingFiles = ['node_modules/lodash/package.json'];
            const cumulativeSet = new Set<string>(['node_modules/lodash/package.json']);
            const ignoredDirs = new Set<string>(['node_modules/']);

            const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!node_modules/lodash/package.json');

            // Negation works - file is removed
            assert.strictEqual(result.actionCount, 1);
            assert.strictEqual(result.blockedCount, 0);
            assert.strictEqual(result.setSize, 0);
        });
    });

    suite('sequential pattern scenarios', () => {
        test('should track cumulative set across multiple patterns', () => {
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();

            // Add files
            const result1 = calculator.calculateCount(['a.txt', 'b.txt'], false, false, cumulativeSet, ignoredDirs, '*.txt');
            assert.strictEqual(result1.setSize, 2);

            // Add more files
            const result2 = calculator.calculateCount(['c.log'], false, false, cumulativeSet, ignoredDirs, '*.log');
            assert.strictEqual(result2.setSize, 3);

            // Remove a file
            const result3 = calculator.calculateCount(['a.txt'], true, false, cumulativeSet, ignoredDirs, '!a.txt');
            assert.strictEqual(result3.actionCount, 1);
            assert.strictEqual(result3.setSize, 2);
        });

        test('should allow negation after directory pattern (unlike gitignore)', () => {
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();

            // Add directory contents - in vscodeignore this doesn't block
            const distFiles = ['dist/bundle.js', 'dist/index.js'];
            calculator.calculateCount(distFiles, false, true, cumulativeSet, ignoredDirs, 'dist/');

            // Negation should work (unlike gitignore where dir/ blocks it)
            const result = calculator.calculateCount(['dist/bundle.js'], true, false, cumulativeSet, ignoredDirs, '!dist/bundle.js');

            assert.strictEqual(result.actionCount, 1);
            assert.strictEqual(result.blockedCount, 0);  // Not blocked!
            assert.strictEqual(result.setSize, 1);  // Only index.js remains
        });
    });
});
