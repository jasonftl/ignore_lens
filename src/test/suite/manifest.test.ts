import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ALL_SUPPORTED_FILES } from '../../supportedFiles';

interface Manifest {
    activationEvents: string[];
    contributes: {
        languages: Array<{ id: string; filenames: string[] }>;
    };
}

suite('Extension Manifest Test Suite', () => {
    const manifest = JSON.parse(
        fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
    ) as Manifest;

    test('associates every supported filename with the ignore language', () => {
        const ignoreLanguage = manifest.contributes.languages.find(language => language.id === 'ignore');
        assert.ok(ignoreLanguage);
        assert.deepStrictEqual([...ignoreLanguage.filenames].sort(), [...ALL_SUPPORTED_FILES].sort());
    });

    test('activates only when an ignore document opens', () => {
        assert.deepStrictEqual(manifest.activationEvents, ['onLanguage:ignore']);
    });
});
