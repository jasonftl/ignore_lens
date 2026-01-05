// Date: 05/01/2026
// Unit tests for the GitignoreParser class

import * as assert from 'assert';
import { GitignoreParser } from '../../parserStrategy';

suite('GitignoreParser Test Suite', () => {
    let parser: GitignoreParser;

    setup(() => {
        parser = new GitignoreParser();
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

        test('should preserve single escaped trailing space', () => {
            // "file\ " should become "file " (backslash removed, space kept)
            const result = parser.parseLine('file\\ ');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'file ');
        });

        test('should preserve multiple escaped trailing spaces', () => {
            // "file\ \ \ " should become "file   " (3 spaces preserved)
            const result = parser.parseLine('file\\ \\ \\ ');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'file   ');
        });

        test('should preserve escaped trailing tab', () => {
            // "file\<tab>" should become "file<tab>"
            const result = parser.parseLine('file\\\t');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'file\t');
        });

        test('should preserve mixed escaped trailing whitespace', () => {
            // "file\ \<tab>\ " should become "file <tab> " (space, tab, space)
            const result = parser.parseLine('file\\ \\\t\\ ');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'file \t ');
        });

        test('should preserve unescaped trailing tabs (gitignore spec)', () => {
            // Gitignore only trims trailing spaces, not tabs
            // "file\t" should remain "file\t"
            const result = parser.parseLine('file\t');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'file\t');
        });

        test('should trim trailing spaces but not tabs', () => {
            // "file\t   " should become "file\t" (spaces trimmed, tab kept)
            const result = parser.parseLine('file\t   ');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, 'file\t');
        });

        test('should preserve escaped ! for literal filename (not negation)', () => {
            // "\!important.txt" should match a file named "!important.txt"
            // The pattern should NOT be treated as negation
            const result = parser.parseLine('\\!important.txt');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '\\!important.txt');
            assert.strictEqual(result.isNegation, false, 'escaped ! should not be negation');
        });

        test('should preserve escaped # for literal filename (not comment)', () => {
            // "\#file.txt" should match a file named "#file.txt"
            // The pattern should NOT be treated as comment
            const result = parser.parseLine('\\#file.txt');
            assert.strictEqual(result.type, 'pattern');
            assert.strictEqual(result.pattern, '\\#file.txt');
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

        test('should strip UTF-8 BOM from first line', () => {
            // Bug fix ISSUE-M008: BOM should be stripped before parsing
            // UTF-8 BOM is \uFEFF (byte order mark)
            const content = '\uFEFF*.log\nnode_modules/';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 2);
            // First pattern should NOT include BOM
            assert.strictEqual(results[0].type, 'pattern');
            assert.strictEqual(results[0].pattern, '*.log');
            assert.ok(!results[0].pattern.startsWith('\uFEFF'), 'BOM should be stripped');
        });

        test('should correctly parse comment with BOM prefix', () => {
            // Bug fix ISSUE-M008: BOM before # should still be detected as comment
            const content = '\uFEFF# This is a comment\n*.js';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 2);
            // First line should be a comment (not pattern with BOM prefix)
            assert.strictEqual(results[0].type, 'comment');
            assert.strictEqual(results[1].type, 'pattern');
            assert.strictEqual(results[1].pattern, '*.js');
        });

        test('should handle file without BOM normally', () => {
            // Ensure non-BOM files still work correctly
            const content = '*.log\nnode_modules/';
            const results = parser.parseFile(content);

            assert.strictEqual(results.length, 2);
            assert.strictEqual(results[0].pattern, '*.log');
            assert.strictEqual(results[1].pattern, 'node_modules/');
        });
    });
});
