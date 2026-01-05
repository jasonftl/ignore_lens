// Date: 05/01/2026
// Unit tests for the VscodeignoreParser class

import * as assert from 'assert';
import { VscodeignoreParser } from '../../parserStrategy';

suite('VscodeignoreParser Test Suite', () => {
    let parser: VscodeignoreParser;

    setup(() => {
        parser = new VscodeignoreParser();
    });

    suite('parseLine', () => {
        test('should trim leading whitespace (unlike gitignore)', () => {
            const result = parser.parseLine('  *.log');
            assert.strictEqual(result.pattern, '*.log');
            assert.strictEqual(result.type, 'pattern');
        });

        test('should trim trailing whitespace', () => {
            const result = parser.parseLine('file.txt   ');
            assert.strictEqual(result.pattern, 'file.txt');
        });

        test('should trim trailing tabs (unlike gitignore)', () => {
            const result = parser.parseLine('file.txt\t\t');
            assert.strictEqual(result.pattern, 'file.txt');
        });

        test('should trim both leading and trailing whitespace', () => {
            const result = parser.parseLine('  node_modules/  ');
            assert.strictEqual(result.pattern, 'node_modules/');
            assert.strictEqual(result.isDirectory, true);
        });

        test('should identify blank lines', () => {
            const result = parser.parseLine('');
            assert.strictEqual(result.type, 'blank');
        });

        test('should identify whitespace-only lines as blank', () => {
            const result = parser.parseLine('   \t  ');
            assert.strictEqual(result.type, 'blank');
        });

        test('should identify comment lines starting with #', () => {
            const result = parser.parseLine('# This is a comment');
            assert.strictEqual(result.type, 'comment');
        });

        test('should identify indented # as comment after trimming', () => {
            // Unlike gitignore, vscodeignore trims first, so indented # is a comment
            const result = parser.parseLine('  # Comment after spaces');
            assert.strictEqual(result.type, 'comment');
        });

        test('should identify negation patterns', () => {
            const result = parser.parseLine('!important.txt');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.isNegation, true);
            assert.strictEqual(result.pattern, '!important.txt');
        });

        test('should identify directory patterns', () => {
            const result = parser.parseLine('build/');
            assert.strictEqual(result.isDirectory, true);
        });

        test('should preserve raw text', () => {
            const rawLine = '  *.log  ';
            const result = parser.parseLine(rawLine);
            assert.strictEqual(result.rawText, rawLine);
        });
    });

    suite('parseFile', () => {
        test('should parse multiple lines', () => {
            const content = '*.log\n# Comment\nnode_modules/';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 3);
            assert.strictEqual(results[0].pattern, '*.log');
            assert.strictEqual(results[1].type, 'comment');
            assert.strictEqual(results[2].pattern, 'node_modules/');
        });

        test('should handle Windows line endings', () => {
            const content = '*.log\r\n*.tmp';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].pattern, '*.log');
            assert.strictEqual(results[1].pattern, '*.tmp');
        });
    });
});
