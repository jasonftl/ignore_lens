// Date: 24/04/2026
// Unit tests for the P4ignoreCountCalculator class
// P4IGNORE uses first-match-wins evaluation — once a file has been decided by
// an earlier pattern, later patterns matching the same file do nothing.

import * as assert from 'assert';
import { P4ignoreCountCalculator } from '../../countStrategy';

suite('P4ignoreCountCalculator Test Suite', () => {
    let calculator: P4ignoreCountCalculator;

    setup(() => {
        calculator = new P4ignoreCountCalculator();
    });

    suite('first-match-wins for normal patterns', () => {
        test('should ignore all matched files on the first pattern', () => {
            const matchingFiles = ['a.log', 'b.log', 'c.log'];
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();
            const decidedSet = new Set<string>();

            const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.log', decidedSet);

            assert.strictEqual(result.actionCount, 3);
            assert.strictEqual(result.noActionCount, 0);
            assert.strictEqual(result.blockedCount, 0);
            assert.strictEqual(result.setSize, 3);
            assert.strictEqual(decidedSet.size, 3);
        });

        test('should treat already-decided files as no-action on a later normal pattern', () => {
            // First pattern decides a.log and b.log
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();
            const decidedSet = new Set<string>();
            calculator.calculateCount(['a.log', 'b.log'], false, false, cumulativeSet, ignoredDirs, '*.log', decidedSet);

            // Second pattern also matches a.log plus new file c.txt
            const result = calculator.calculateCount(['a.log', 'c.txt'], false, false, cumulativeSet, ignoredDirs, 'a.log', decidedSet);

            // a.log was already decided → no-action; c.txt is new → action
            assert.strictEqual(result.actionCount, 1);
            assert.strictEqual(result.noActionCount, 1);
            assert.strictEqual(result.setSize, 3);  // a.log, b.log, c.txt
        });
    });

    suite('first-match-wins for negation patterns', () => {
        test('negation on previously-ignored file is no-action (first-match-wins)', () => {
            // First pattern ignores a.log and b.log
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();
            const decidedSet = new Set<string>();
            calculator.calculateCount(['a.log', 'b.log'], false, false, cumulativeSet, ignoredDirs, '*.log', decidedSet);

            // Later negation tries to un-ignore a.log — in P4 first-match-wins, this does nothing
            const result = calculator.calculateCount(['a.log'], true, false, cumulativeSet, ignoredDirs, '!a.log', decidedSet);

            assert.strictEqual(result.actionCount, 0);
            assert.strictEqual(result.noActionCount, 1);
            assert.strictEqual(result.setSize, 2);  // a.log remains ignored!
            assert.ok(cumulativeSet.has('a.log'), 'a.log should remain in ignored set');
        });

        test('negation first, later normal pattern cannot re-ignore the file', () => {
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();
            const decidedSet = new Set<string>();

            // First: !important.log un-ignores important.log (decides it as "not ignored")
            const negResult = calculator.calculateCount(['important.log'], true, false, cumulativeSet, ignoredDirs, '!important.log', decidedSet);
            assert.strictEqual(negResult.actionCount, 1);
            assert.strictEqual(negResult.setSize, 0);  // nothing ignored yet

            // Second: *.log would match important.log AND a.log, but important.log is already decided
            const normResult = calculator.calculateCount(['important.log', 'a.log'], false, false, cumulativeSet, ignoredDirs, '*.log', decidedSet);

            assert.strictEqual(normResult.actionCount, 1);  // only a.log is new
            assert.strictEqual(normResult.noActionCount, 1);  // important.log already decided
            assert.strictEqual(normResult.setSize, 1);
            assert.ok(!cumulativeSet.has('important.log'), 'important.log should NOT be re-ignored');
            assert.ok(cumulativeSet.has('a.log'));
        });

        test('negation for never-seen file decides it as not-ignored', () => {
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();
            const decidedSet = new Set<string>();

            const result = calculator.calculateCount(['new.log'], true, false, cumulativeSet, ignoredDirs, '!new.log', decidedSet);

            assert.strictEqual(result.actionCount, 1);
            assert.strictEqual(result.noActionCount, 0);
            assert.strictEqual(result.setSize, 0);
            assert.ok(decidedSet.has('new.log'), 'file should now be decided');
            assert.ok(!cumulativeSet.has('new.log'), 'file must not be in ignored set');
        });
    });

    suite('blockedCount is always zero for P4', () => {
        test('P4 has no directory blocking even if ignoredDirs is populated', () => {
            const matchingFiles = ['dist/bundle.js'];
            const cumulativeSet = new Set<string>(['dist/bundle.js']);
            const ignoredDirs = new Set<string>(['dist/']);  // would block in gitignore
            const decidedSet = new Set<string>();

            const result = calculator.calculateCount(matchingFiles, true, false, cumulativeSet, ignoredDirs, '!dist/bundle.js', decidedSet);

            assert.strictEqual(result.blockedCount, 0);
        });
    });

    suite('defensive: omitted decidedSet', () => {
        test('should not crash when decidedSet is not supplied (each call independent)', () => {
            const matchingFiles = ['a.log'];
            const cumulativeSet = new Set<string>();
            const ignoredDirs = new Set<string>();

            // Call without decidedSet — calculator should fall back to a fresh local set
            const result = calculator.calculateCount(matchingFiles, false, false, cumulativeSet, ignoredDirs, '*.log');

            assert.strictEqual(result.actionCount, 1);
            assert.strictEqual(result.setSize, 1);
        });
    });
});
