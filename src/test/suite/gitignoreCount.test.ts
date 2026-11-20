import * as assert from 'assert';
import { getCountCalculator } from '../../countStrategy';
import { getMatcher } from '../../matcherStrategy';
import { getParser, parseFile } from '../../parserStrategy';

suite('Git ignore rules through parsing, matching, and counting', () => {
    const cases = [
        { name: 'recursive exception cannot reopen a parent', patterns: 'src/\n!src/**',
            files: ['src/a.ts'], ignored: ['src/a.ts'], counts: [0, 0, 1, 1] },
        { name: 'bare parent blocks a child exception', patterns: 'src\n!src/a.ts',
            files: ['src/a.ts'], ignored: ['src/a.ts'], counts: [0, 0, 1, 1] },
        { name: 'nested basename rules block the actual directory', patterns: 'suite/\n!src/test/suite/index.ts',
            files: ['src/test/suite/index.ts'], ignored: ['src/test/suite/index.ts'], counts: [0, 0, 1, 1] },
        { name: 'nested wildcard rules leave sibling paths reachable', patterns: 'build-*/\n*.ts\n!app/keep.ts',
            files: ['app/build-a/t.ts', 'app/keep.ts'], ignored: ['app/build-a/t.ts'], counts: [1, 0, 0, 1] },
        { name: 'character classes match parent directories', patterns: '[st]rc/\n!src/a.ts',
            files: ['src/a.ts', 'other/a.ts'], ignored: ['src/a.ts'], counts: [0, 0, 1, 1] },
        { name: 'case-sensitive patterns match exact case', patterns: 'docs.md\n[D]ocs.md',
            files: ['docs.md', 'DOCS.md', 'Docs.md'], ignored: ['docs.md', 'Docs.md'], counts: [1, 0, 0, 2] },
        { name: 'case-insensitive class and parent blocking use the same policy', patterns: '[s]rc/\n!SRC/a.ts',
            files: ['SRC/a.ts'], ignored: ['SRC/a.ts'], counts: [0, 0, 1, 1], ignoreCase: true },
        { name: 'escaped trailing space matches only a spaced filename', patterns: 'log\\ ',
            files: ['log', 'log '], ignored: ['log '], counts: [1, 0, 0, 1] },
        { name: 'unescaped trailing space is ignored', patterns: 'log ',
            files: ['log', 'log '], ignored: ['log'], counts: [1, 0, 0, 1] },
        { name: 'explicitly reopening a parent permits a later child exception', patterns: 'src/\n!src/\n*.ts\n!src/a.ts',
            files: ['src/a.ts', 'src/b.ts'], ignored: ['src/b.ts'], counts: [1, 0, 0, 1] },
        { name: 'reopening a directory retains independent file exclusions', patterns: '/dist/**\n!/dist/assets/',
            files: ['dist/assets/logo.png'], ignored: ['dist/assets/logo.png'], counts: [0, 1, 0, 1] },
        { name: 'a contents rule can be negated at the same depth', patterns: 'src/*\n!src/a.ts',
            files: ['src/a.ts', 'src/b.ts'], ignored: ['src/b.ts'], counts: [1, 0, 0, 1] },
        { name: 'escaped directory names block child negations', patterns: '\\[temp\\]/\n!\\[temp\\]/data.tmp',
            files: ['[temp]/data.tmp'], ignored: ['[temp]/data.tmp'], counts: [0, 0, 1, 1] },
        { name: 'repeated rules count files as already ignored', patterns: '*.ts\n*.ts',
            files: ['a.ts', 'b.ts'], ignored: ['a.ts', 'b.ts'], counts: [0, 2, 0, 2] },
        { name: 'an unmatched rule adds nothing', patterns: '*.bak',
            files: ['a.ts'], ignored: [], counts: [0, 0, 0, 0] },
        { name: 'an exception can match a file already outside the set', patterns: '!a.ts',
            files: ['a.ts'], ignored: [], counts: [0, 1, 0, 0] }
    ];

    for (const entry of cases) {
        test(entry.name, () => {
            const matcher = getMatcher('gitignore', entry.ignoreCase);
            const calculator = getCountCalculator('gitignore', entry.ignoreCase);
            const ignored = new Set<string>();
            const results = parseFile(getParser('gitignore'), entry.patterns).map(rule =>
                calculator.calculateCount(matcher.findMatches(rule.pattern, entry.files), rule.isNegation, ignored, rule.pattern)
            );
            const { actionCount, noActionCount, blockedCount, setSize } = results[results.length - 1];
            assert.deepStrictEqual([actionCount, noActionCount, blockedCount, setSize], entry.counts);
            assert.deepStrictEqual([...ignored].sort(), [...entry.ignored].sort());
        });
    }
});
