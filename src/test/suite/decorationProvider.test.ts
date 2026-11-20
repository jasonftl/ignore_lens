import * as assert from 'assert';
import { symlink, unlink } from 'fs/promises';
import * as vscode from 'vscode';
import { decorationCache } from '../../decorationCache';
import { DecorationProvider } from '../../decorationProvider';
import { IPatternMatcher, VscodeignoreMatcher } from '../../matcherStrategy';
import { WorkspaceScanner } from '../../workspaceScanner';

interface CooperativeProvider {
    updateVersion: number;
    findMatchesCooperatively(
        matcher: IPatternMatcher,
        pattern: string,
        files: string[],
        isCurrent: () => boolean
    ): Promise<string[] | undefined>;
}

suite('DecorationProvider Test Suite', () => {
    test('warns about unsupported Helm syntax and evaluates CVS tokens and resets', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const scanner = new WorkspaceScanner(async () => ['app.ts', 'file10.txt', 'sub/cache.tmp', 'a.txt', '-.txt']
            .map(file => vscode.Uri.joinPath(folder.uri, file)));
        const provider = new DecorationProvider(scanner);
        const editor = (name: string, lines: string[]) => ({
            document: {
                uri: vscode.Uri.joinPath(folder.uri, name), languageId: 'ignore', lineCount: lines.length,
                lineAt: (index: number) => ({ text: lines[index], range: new vscode.Range(index, 0, index, lines[index].length) })
            },
            setDecorations() { /* Read the computed decorations from the cache. */ }
        } as unknown as vscode.TextEditor);
        const helm = editor('.helmignore', ['**/*.tmp', '[a-].txt', '[a-c].txt']);
        const cvs = editor('.cvsignore', ['app.ts file10.txt', '! app.ts', '!']);
        try {
            await Promise.all([provider.updateDecorations(helm), provider.updateDecorations(cvs)]);
            const helmData = decorationCache.get(helm.document.uri.toString());
            assert.deepStrictEqual(helmData?.warnings, [
                { lineIndex: 0, message: 'Helm does not support the ** wildcard.' },
                { lineIndex: 1, message: 'Invalid Helm ignore pattern.' }
            ]);
            assert.deepStrictEqual(helmData?.lineData.map(row => [row.lineIndex, row.col1, row.setSize]), [[2, '+1', 1]]);
            assert.deepStrictEqual(decorationCache.get(cvs.document.uri.toString())?.lineData.map(row => [row.col1, row.setSize]),
                [['+2', 2], ['−1', 1], ['−1', 0]]);
        } finally {
            provider.dispose();
            scanner.dispose();
            for (const view of [helm, cvs]) decorationCache.delete(view.document.uri.toString());
        }
    });

    test('refreshes the file scan on tab return and shows a loop warning', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const loop = vscode.Uri.joinPath(folder.uri, 'ignored', 'loop');
        const document = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(folder.uri, '.gitignore'));
        const applied: vscode.DecorationOptions[] = [];
        const editor = {
            document,
            setDecorations(_type: vscode.TextEditorDecorationType, decorations: vscode.DecorationOptions[]) {
                applied.push(...decorations);
            }
        } as vscode.TextEditor;
        let searches = 0;
        const scanner = new WorkspaceScanner(async () => {
            searches++;
            return [vscode.Uri.joinPath(folder.uri, 'ignored', 'file.txt')];
        });
        const provider = new DecorationProvider(scanner);
        try {
            await provider.updateDecorations(editor);
            assert.strictEqual(searches, 1);
            assert.ok(!applied.some(decoration => decoration.hoverMessage));
            applied.length = 0;

            await symlink(folder.uri.fsPath, loop.fsPath, process.platform === 'win32' ? 'junction' : 'dir');
            await provider.updateDecorations(editor, true);
            assert.strictEqual(searches, 1);
            const marker = applied.find(decoration => decoration.renderOptions?.after?.contentText?.includes('\u26a0'));
            assert.ok(marker?.hoverMessage);
            assert.match((marker.hoverMessage as vscode.MarkdownString).value, /Symlink.*loop/);
            assert.match(decorationCache.get(document.uri.toString())?.warnings[0]?.message ?? '', /Symlink loop/);
        } finally {
            provider.dispose();
            scanner.dispose();
            decorationCache.delete(document.uri.toString());
            await unlink(loop.fsPath).catch(error => {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            });
        }
    });

    test('matches large file lists in chunks', async () => {
        const scanner = new WorkspaceScanner();
        const provider = new DecorationProvider(scanner);
        const internals = provider as unknown as CooperativeProvider;
        const files = Array.from({ length: 10001 }, (_, index) => 'file-' + String(index) + '.txt');

        try {
            const matches = await internals.findMatchesCooperatively(
                new VscodeignoreMatcher(), '*.txt', files, () => true
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
        let current = true;
        const matcher: IPatternMatcher = {
            findMatches(pattern, chunk) {
                calls = calls + 1;
                current = false;
                return chunk;
            }
        };

        try {
            const matches = await internals.findMatchesCooperatively(matcher, '*', files, () => current);
            assert.strictEqual(matches, undefined);
            assert.strictEqual(calls, 1);
        } finally {
            provider.dispose();
            scanner.dispose();
        }
    });
});
