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
        version: number
    ): Promise<string[] | undefined>;
}

suite('DecorationProvider Test Suite', () => {
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
                return chunk;
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
