import * as assert from 'assert';
import { VscodeignoreMatcher } from '../../matcherStrategy';

suite('VscodeignoreMatcher Test Suite', () => {
    const matcher = new VscodeignoreMatcher();
    const files = [
        'debug.log',
        'src/debug.log',
        'src/utils/debug.log',
        '.hidden',
        'src/.hidden',
        'folder/file.txt',
        'folder/sub/file.txt',
        'dist/bundle.js',
        'dist/assets/logo.png',
        'node_modules/lodash/index.js'
    ];
    const cases: Array<{ pattern: string; expected: string[] }> = [
        { pattern: '*.log', expected: ['debug.log'] },
        { pattern: '**/*.log', expected: ['debug.log', 'src/debug.log', 'src/utils/debug.log'] },
        { pattern: '*.js', expected: [] },
        { pattern: '.*', expected: ['.hidden'] },
        { pattern: '**/.*', expected: ['.hidden', 'src/.hidden'] },
        { pattern: 'folder/', expected: ['folder/file.txt', 'folder/sub/file.txt'] },
        { pattern: 'folder/**', expected: ['folder/file.txt', 'folder/sub/file.txt'] },
        { pattern: 'node_modules/', expected: ['node_modules/lodash/index.js'] },
        { pattern: '!dist/**', expected: ['dist/bundle.js', 'dist/assets/logo.png'] },
        { pattern: '!dist/bundle.js', expected: ['dist/bundle.js'] }
    ];

    for (const matchCase of cases) {
        test(matchCase.pattern, () => {
            assert.deepStrictEqual(matcher.findMatches(matchCase.pattern, files), matchCase.expected);
        });
    }
});
