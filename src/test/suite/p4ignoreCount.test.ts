import * as assert from 'assert';
import { getCountCalculator } from '../../countStrategy';
import { getMatcher } from '../../matcherStrategy';
import { getParser, parseFile } from '../../parserStrategy';

suite('Perforce ignore rules through parsing, matching, and counting', () => {
    test('later rules win in either order and exceptions remove only ignored files', () => {
        const matcher = getMatcher('p4ignore');
        const calculator = getCountCalculator('p4ignore');
        const files = ['readme.html', 'other.html'];
        const ignored = new Set<string>();
        const rules = parseFile(getParser('p4ignore'), '!readme.html\n*.html\n!readme.html');
        const counts = rules.map(rule =>
            calculator.calculateCount(matcher.findMatches(rule.pattern, files), rule.isNegation, ignored, rule.pattern)
        );
        assert.deepStrictEqual(counts.map(count => [count.actionCount, count.setSize]), [[0, 0], [2, 2], [1, 1]]);
        assert.deepStrictEqual([...ignored], ['other.html']);
    });

    test('matches an escaped hash at any depth and recursive stars within a segment', () => {
        const matcher = getMatcher('p4ignore');
        const files = ['sub/#example.html', 'test/x.txt', 'test/sub/x.txt', 'other/sub/x.txt'];
        const [hash, wildcard] = parseFile(getParser('p4ignore'), '\\#example.html\ntest/**.txt');
        assert.deepStrictEqual(matcher.findMatches(hash.pattern, files), ['sub/#example.html']);
        assert.deepStrictEqual(matcher.findMatches(wildcard.pattern, files), ['test/x.txt', 'test/sub/x.txt']);
    });
});
