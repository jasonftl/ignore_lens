import * as assert from 'assert';
import { getMatcher } from '../../matcherStrategy';
import { getParser } from '../../parserStrategy';
import { SUPPORTED_FILE_TYPES } from '../../supportedFiles';

suite('Ignore format regression examples', () => {
    const cases = [
        { name: '.npmignore', rule: '*.log', files: ['debug.log', 'src/debug.log', 'src/main.ts'],
            expected: ['debug.log', 'src/debug.log'] },
        { name: '.gcloudignore', rule: 'foo', files: ['src/foo', 'src/bar'], expected: ['src/foo'] },
        { name: '.gcloudignore', rule: '/bar', files: ['bar', 'src/bar'], expected: ['bar'] },
        ...['foo/bar', 'foo/bar/'].map(rule => ({ name: '.dockerignore', rule,
            files: ['foo/bar', 'foo/bar/index.ts', 'app/foo/bar'], expected: ['foo/bar', 'foo/bar/index.ts'] })),
        { name: '.bazelignore', rule: 'build', files: ['build/a', 'app/build/b', 'builder/c'], expected: ['build/a'] },
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
});
