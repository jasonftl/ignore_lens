import * as assert from 'assert';
import { CachedDecorations, decorationCache } from '../../decorationCache';

suite('DecorationCache Test Suite', () => {
    test('removes a closed document entry', () => {
        const uri = 'test://decoration-cache/' + Date.now();
        const data: CachedDecorations = {
            lineData: [],
            maxLineLength: 0,
            maxCol1Width: 0,
            maxCol3Width: 0
        };
        const initialSize = decorationCache.size;

        decorationCache.set(uri, data);
        assert.strictEqual(decorationCache.size, initialSize + 1);

        decorationCache.delete(uri);
        assert.strictEqual(decorationCache.size, initialSize);
    });
});
