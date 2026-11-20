import * as assert from 'assert';
import { getCountCalculator } from '../../countStrategy';
import { getMatcher } from '../../matcherStrategy';
import { getParser, parseFile } from '../../parserStrategy';
import { SUPPORTED_FILE_TYPES } from '../../supportedFiles';

suite('Ignore format regression examples', () => {
    const cases = [
        { name: '.npmignore', rule: '*.log', files: ['debug.log', 'src/Debug.LOG', 'src/main.ts'],
            expected: ['debug.log', 'src/Debug.LOG'] },
        { name: '.npmignore', rule: '!!*.log', files: ['debug.log', 'src/Debug.LOG', 'src/main.ts'],
            expected: ['debug.log', 'src/Debug.LOG'] },
        { name: '.npmignore', rule: '/debug.log', files: ['Debug.LOG', 'src/Debug.LOG'], expected: ['Debug.LOG'] },
        { name: '.npmignore', rule: ' logs/ ', files: ['LOGS/debug.log', 'sub/Logs/debug.log', 'logs'],
            expected: ['LOGS/debug.log', 'sub/Logs/debug.log'] },
        { name: '.gcloudignore', rule: 'foo', files: ['src/foo', 'src/bar'], expected: ['src/foo'] },
        { name: '.gcloudignore', rule: '/bar', files: ['bar', 'src/bar'], expected: ['bar'] },
        ...['foo/bar', 'foo/bar/'].map(rule => ({ name: '.dockerignore', rule,
            files: ['foo/bar', 'foo/bar/index.ts', 'app/foo/bar'], expected: ['foo/bar', 'foo/bar/index.ts'] })),
        { name: '.bazelignore', rule: 'build', files: ['build/a', 'app/build/b', 'builder/c'], expected: ['build/a'] },
        { name: '.bazelignore', rule: './build', files: ['build/a', 'app/build/b', 'builder/c'], expected: ['build/a'] },
        { name: '.bazelignore', rule: ' build', files: ['build/a', 'app/build/b'], expected: [] },
        { name: '.bazelignore', rule: './ build ', files: ['build/a', ' build /b'], expected: [' build /b'] },
        { name: '.bazelignore', rule: ' #build', files: [' #build/a', 'build/b'], expected: [' #build/a'] },
        { name: '.bazelignore', rule: 'app/../build//', files: ['build/a', 'app/build/b'], expected: ['build/a'] },
        { name: '.bazelignore', rule: './build-*', files: ['build-a/a', 'build-*/b'], expected: ['build-*/b'] },
        { name: '.bazelignore', rule: 'build-*', files: ['build-a/a', 'build-*/b'], expected: ['build-*/b'] },
        { name: '.bazelignore', rule: '!build', files: ['build/a', '!build/b'], expected: ['!build/b'] }
    ];

    for (const { name, rule, files, expected } of cases) {
        test(name + ' ' + rule, () => {
            const type = SUPPORTED_FILE_TYPES[name];
            const parsed = getParser(type).parseLine(rule);
            assert.strictEqual(parsed.isNegation, false);
            assert.deepStrictEqual(getMatcher(type).findMatches(parsed.pattern, files), expected);
        });
    }

    const npmCases = [
        { name: 'a basename exception cannot reopen an excluded parent', text: 'src/\n!keep.txt',
            ignored: ['src/Debug.LOG', 'src/keep.txt', 'src/lib/keep.txt', 'src/lib/readme.txt', 'other/src/keep.txt'],
            counts: [0, 1, 3, 5] },
        { name: 'a path exception can expose siblings in its reopened directory', text: 'src/\n!src/keep.txt',
            ignored: ['other/src/keep.txt'], counts: [4, 0, 0, 1] },
        { name: 'reopening a directory keeps separately excluded files ignored', text: 'src/\n*.log\n!/src/keep.txt',
            ignored: ['debug.log', 'src/Debug.LOG', 'other/src/keep.txt'], counts: [3, 0, 0, 3] },
        { name: 'an even number of exclamation marks excludes and an odd number includes', text: '!!*.log\n!!!src/Debug.LOG',
            ignored: ['debug.log'], counts: [1, 0, 0, 1] }
    ];
    for (const { name, text, ignored, counts } of npmCases) {
        test('.npmignore ' + name, () => {
            const files = ['debug.log', 'keep.txt', 'src/Debug.LOG', 'src/keep.txt', 'src/lib/keep.txt', 'src/lib/readme.txt', 'other/src/keep.txt'];
            const matcher = getMatcher('npmignore');
            const calculator = getCountCalculator('npmignore');
            const matched = new Set<string>();
            const results = parseFile(getParser('npmignore'), text).map(rule =>
                calculator.calculateCount(matcher.findMatches(rule.pattern, files), rule.isNegation, matched, rule.pattern));
            const { actionCount, noActionCount, blockedCount, setSize } = results[results.length - 1];
            assert.deepStrictEqual([...matched].sort(), [...ignored].sort());
            assert.deepStrictEqual([actionCount, noActionCount, blockedCount, setSize], counts);
        });
    }

    test('Helm rejects malformed character classes and accepts well-formed ranges', () => {
        const parser = getParser('helmignore');
        for (const rule of ['[a-].txt', '[-a].txt', '[].txt', '[a', '[a--z]']) {
            assert.strictEqual(parser.parseLine(rule).warning, 'Invalid Helm ignore pattern.', rule);
        }
        for (const rule of ['[a-c].txt', '[^a].txt', '[a-ñ].txt', 'name].txt']) {
            assert.strictEqual(parser.parseLine(rule).warning, undefined, rule);
        }
        assert.strictEqual(parser.parseLine('file\\').warning,
            process.platform === 'win32' ? undefined : 'Invalid Helm ignore pattern.');
    });
});
