import * as assert from 'assert';
import { GlobNoNegationMatcher } from '../../matcherStrategy';

suite('GlobNoNegationMatcher Test Suite', () => {
    const matcher = new GlobNoNegationMatcher();
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
        'node_modules/lodash/index.js',
        '!important.txt',
        '#readme.txt'
    ];
    const cases: Array<{ pattern: string; expected: string[] }> = [
        { pattern: '!important.txt', expected: ['!important.txt'] },
        { pattern: '!dist/**', expected: [] },
        { pattern: '!*', expected: ['!important.txt'] },
        { pattern: '#readme.txt', expected: ['#readme.txt'] },
        { pattern: '#*', expected: ['#readme.txt'] },
        { pattern: '*.log', expected: ['debug.log'] },
        { pattern: '**/*.log', expected: ['debug.log', 'src/debug.log', 'src/utils/debug.log'] },
        { pattern: 'folder/', expected: ['folder/file.txt', 'folder/sub/file.txt'] },
        { pattern: 'node_modules/', expected: ['node_modules/lodash/index.js'] },
        { pattern: '.*', expected: ['.hidden'] },
        { pattern: '**/.*', expected: ['.hidden', 'src/.hidden'] }
    ];

    for (const matchCase of cases) {
        test(matchCase.pattern, () => {
            assert.deepStrictEqual(matcher.findMatches(matchCase.pattern, files), matchCase.expected);
        });
    }
});
