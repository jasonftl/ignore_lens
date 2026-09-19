import * as assert from 'assert';
import { GitignoreMatcher } from '../../matcherStrategy';

suite('GitignoreMatcher Test Suite', () => {
    const matcher = new GitignoreMatcher();
    const projectFiles = [
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
    const characterClassFiles = [
        'a.ts',
        'b.ts',
        'c.ts',
        'x.txt',
        'ab.ts',
        'src/a.ts',
        'src/b.js',
        '[special].ts'
    ];
    const negatedClassFiles = ['a.ts', 'b.ts', 'abc.ts', 'bcd.ts', 'src/a.ts', 'src/b.ts'];

    const cases: Array<{ name: string; pattern: string; files: string[]; expected: string[] }> = [
        { name: 'simple wildcard', pattern: '*.md', files: projectFiles, expected: ['README.md'] },
        { name: 'recursive extension', pattern: '**/*.ts', files: projectFiles, expected: ['src/app.ts', 'src/utils/helper.ts'] },
        { name: 'directory', pattern: 'node_modules/', files: projectFiles, expected: ['node_modules/lodash/index.js', 'node_modules/lodash/package.json'] },
        { name: 'specific file', pattern: '.env', files: projectFiles, expected: ['.env'] },
        { name: 'dotfile', pattern: '.git*', files: projectFiles, expected: ['.gitignore'] },
        { name: 'negation prefix', pattern: '!README.md', files: projectFiles, expected: ['README.md'] },
        { name: 'no match', pattern: '*.xyz', files: projectFiles, expected: [] },
        { name: 'build directory', pattern: 'build/', files: projectFiles, expected: ['build/output.js', 'build/styles.css'] },
        { name: 'recursive basename', pattern: '*.js', files: ['src/utils/logger.js'], expected: ['src/utils/logger.js'] },
        { name: 'single character class', pattern: '[a].ts', files: characterClassFiles, expected: ['a.ts', 'src/a.ts'] },
        { name: 'character class', pattern: '[abc].ts', files: characterClassFiles, expected: ['a.ts', 'b.ts', 'c.ts', 'src/a.ts'] },
        { name: 'character range', pattern: '[a-c].ts', files: characterClassFiles, expected: ['a.ts', 'b.ts', 'c.ts', 'src/a.ts'] },
        { name: 'escaped brackets', pattern: '\\[special\\].ts', files: characterClassFiles, expected: ['[special].ts'] },
        { name: 'root-anchored character class', pattern: '/[ab].ts', files: characterClassFiles, expected: ['a.ts', 'b.ts'] },
        {
            name: 'root-anchored character class subpath',
            pattern: '/[ab]/file.ts',
            files: ['a/file.ts', 'b/file.ts', 'c/file.ts', 'a.ts', 'file.ts'],
            expected: ['a/file.ts', 'b/file.ts']
        },
        {
            name: 'escaped exclamation mark',
            pattern: '\\!important.txt',
            files: ['!important.txt', 'important.txt'],
            expected: ['!important.txt']
        },
        {
            name: 'escaped hash',
            pattern: '\\#readme.txt',
            files: ['#readme.txt', 'readme.txt'],
            expected: ['#readme.txt']
        },
        {
            name: 'negated character class with wildcard',
            pattern: '[^a]*.ts',
            files: negatedClassFiles,
            expected: ['b.ts', 'bcd.ts', 'src/b.ts']
        },
        {
            name: 'recursive negated character class',
            pattern: '**/[^a].ts',
            files: negatedClassFiles,
            expected: ['b.ts', 'src/b.ts']
        },
        {
            name: 'alternative negated character class',
            pattern: '[!a]*.ts',
            files: negatedClassFiles,
            expected: ['b.ts', 'bcd.ts', 'src/b.ts']
        }
    ];

    for (const matchCase of cases) {
        test(matchCase.name, () => {
            assert.deepStrictEqual(
                matcher.findMatches(matchCase.pattern, matchCase.files),
                matchCase.expected
            );
        });
    }
});
