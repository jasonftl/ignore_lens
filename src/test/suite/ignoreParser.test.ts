// Date: 29/11/2025
// Unit tests for the IgnoreParser class

import * as assert from 'assert';
import { IgnoreParser } from '../../ignoreParser';

suite('IgnoreParser Test Suite', () => {
    let parser: IgnoreParser;

    setup(() => {
        parser = new IgnoreParser();
    });

    suite('parseLine', () => {
        test('should identify blank lines', () => {
            const result = parser.parseLine('');
            assert.strictEqual(result.type, 'blank');
            assert.strictEqual(result.pattern, '');
        });

        test('should identify whitespace-only lines as blank', () => {
            const result = parser.parseLine('   ');
            assert.strictEqual(result.type, 'blank');
            assert.strictEqual(result.pattern, '');
        });

        test('should identify comment lines starting with #', () => {
            const result = parser.parseLine('# This is a comment');
            assert.strictEqual(result.type, 'comment');
            assert.strictEqual(result.pattern, '');
        });

        test('should treat indented hash as pattern (gitignore spec)', () => {
            // Per gitignore spec, only # at position 0 is a comment
            // "  # text" is a pattern matching a file named "  # text"
            const result = parser.parseLine('  # Indented comment');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '  # Indented comment');
        });

        test('should identify simple patterns', () => {
            const result = parser.parseLine('*.js');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '*.js');
            assert.strictEqual(result.isNegation, false);
            assert.strictEqual(result.isDirectory, false);
        });

        test('should identify directory patterns', () => {
            const result = parser.parseLine('node_modules/');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'node_modules/');
            assert.strictEqual(result.isDirectory, true);
        });

        test('should identify negation patterns', () => {
            const result = parser.parseLine('!important.log');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '!important.log');
            assert.strictEqual(result.isNegation, true);
        });

        test('should identify negation directory patterns', () => {
            const result = parser.parseLine('!dist/');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.isNegation, true);
            assert.strictEqual(result.isDirectory, true);
        });

        test('should preserve raw text', () => {
            const originalLine = '  *.log  ';
            const result = parser.parseLine(originalLine);
            assert.strictEqual(result.rawText, originalLine);
        });

        test('should handle double asterisk patterns', () => {
            const result = parser.parseLine('**/*.js');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '**/*.js');
        });
    });

    suite('parseFile', () => {
        test('should parse multiple lines', () => {
            const content = '# Comment\n*.js\n\nnode_modules/';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 4);
            assert.strictEqual(results[0].type, 'comment');
            assert.strictEqual(results[1].type, 'pattern');
            assert.strictEqual(results[2].type, 'blank');
            assert.strictEqual(results[3].type, 'pattern');
        });

        test('should handle Windows line endings', () => {
            const content = '*.js\r\n*.ts';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].pattern, '*.js');
            assert.strictEqual(results[1].pattern, '*.ts');
        });

        test('should handle empty file', () => {
            const content = '';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].type, 'blank');
        });
    });
});
