import * as assert from 'assert';
import { DecorationProvider } from '../../decorationProvider';
import { IPatternMatcher, VscodeignoreMatcher } from '../../matcherStrategy';
import { WorkspaceScanner } from '../../workspaceScanner';

interface CooperativeProvider {
    updateVersion: number;
    findMatchesCooperatively(
        matcher: IPatternMatcher,
        pattern: string,
        files: string[],
        version: number
    ): Promise<string[] | undefined>;
}

suite('DecorationProvider Test Suite', () => {
    test('matches large file lists in chunks', async () => {
        const scanner = new WorkspaceScanner();
        const provider = new DecorationProvider(scanner);
        const internals = provider as unknown as CooperativeProvider;
        const files = Array.from({ length: 10001 }, (_, index) => 'file-' + String(index) + '.txt');

        try {
            const matches = await internals.findMatchesCooperatively(
                new VscodeignoreMatcher(), '*.txt', files, internals.updateVersion
            );
            assert.strictEqual(matches?.length, files.length);
        } finally {
            provider.dispose();
            scanner.dispose();
        }
    });

    test('stops matching when a newer update supersedes it', async () => {
        const scanner = new WorkspaceScanner();
        const provider = new DecorationProvider(scanner);
        const internals = provider as unknown as CooperativeProvider;
        const files = Array.from({ length: 10001 }, (_, index) => String(index));
        let calls = 0;
        const matcher: IPatternMatcher = {
            findMatches(pattern, chunk) {
                calls = calls + 1;
                internals.updateVersion = internals.updateVersion + 1;
                return { pattern, matchingFiles: chunk, isNegation: false };
            },
            testMatch() {
                return true;
            }
        };

        try {
            const version = internals.updateVersion;
            const matches = await internals.findMatchesCooperatively(matcher, '*', files, version);
            assert.strictEqual(matches, undefined);
            assert.strictEqual(calls, 1);
        } finally {
            provider.dispose();
            scanner.dispose();
        }
    });
});
