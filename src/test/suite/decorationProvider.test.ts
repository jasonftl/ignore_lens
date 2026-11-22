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
        const scanner = new WorkspaceScanner();
        scanner.getFilesInFolder = async () => ({
            files: new Set(['app.ts', 'file10.txt', 'sub/cache.tmp', 'a.txt', '-.txt']), warnings: []
        });
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

    test('applies Google Cloud includes in order and refreshes when a sibling changes', async function () {
        this.timeout(10000);
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const directory = vscode.Uri.joinPath(folder.uri, 'gcloud-includes');
        const uri = vscode.Uri.joinPath(directory, '.gcloudignore');
        const write = (name: string, content: string) =>
            vscode.workspace.fs.writeFile(vscode.Uri.joinPath(directory, name), Buffer.from(content));
        await vscode.workspace.fs.createDirectory(directory);
        await Promise.all([
            write('.gcloudignore', [
                '!keep.log', '#!include:.gitignore', '!keep.log', '#!include:extra.rules',
                '#!include:../outside.rules', '#!include:missing.rules', '!notes.txt', 'log-dir/', '#!include:exceptions.rules'
            ].join('\n')),
            write('.gitignore', '*.log\n'),
            write('extra.rules', '!a.log\nnotes.txt\n#!include:nested.rules\n'),
            write('nested.rules', 'nested.rules\n'),
            write('exceptions.rules', '!log-dir/keep.txt\n'),
            ...['a.log', 'keep.log', 'notes.txt'].map(name => write(name, ''))
        ]);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(directory, 'log-dir'));
        await write('log-dir/keep.txt', '');

        await vscode.extensions.getExtension('ignore-lens.ignore-lens')!.activate();
        await vscode.window.showTextDocument(uri, { preview: true });
        const cacheKey = uri.toString();
        const rows = () => decorationCache.get(cacheKey)?.lineData.map(row => [row.lineIndex, row.col1, row.setSize]);
        const waitForCount = async (count: string) => {
            for (let attempt = 0; attempt < 120; attempt++) {
                if (rows()?.[1]?.[1] === count) return;
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            assert.fail('Expected include count ' + count + ', got ' + JSON.stringify(rows()));
        };
        try {
            await waitForCount('+2');
            assert.deepStrictEqual(rows(), [
                [0, '−0', 0], [1, '+2', 2], [2, '−1', 1], [3, '+1 −1', 1], [6, '−1', 0], [7, '+1', 1], [8, '+0', 1]
            ]);
            assert.deepStrictEqual(decorationCache.get(cacheKey)?.warnings.map(warning => warning.lineIndex), [3, 4, 5]);

            await write('.gitignore', 'a.log\n');
            await waitForCount('+1');
            assert.deepStrictEqual(rows(), [
                [0, '−0', 0], [1, '+1', 1], [2, '−0', 1], [3, '+1 −1', 1], [6, '−1', 0], [7, '+1', 1], [8, '+0', 1]
            ]);
        } finally {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            decorationCache.delete(cacheKey);
        }
    });

    test('shows a loop warning after a watcher reports a new link', async () => {
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
        const scanner = new WorkspaceScanner();
        const provider = new DecorationProvider(scanner);
        try {
            await provider.updateDecorations(editor);
            assert.ok(!applied.some(decoration => decoration.hoverMessage));
            applied.length = 0;

            await symlink(folder.uri.fsPath, loop.fsPath, process.platform === 'win32' ? 'junction' : 'dir');
            await scanner.addPath(loop);
            await provider.updateDecorations(editor);
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

    test('updates an open ignore file when VS Code reports a new junction and its removal', async function () {
        this.timeout(15000);
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const uri = vscode.Uri.joinPath(folder.uri, '.gitignore');
        const loop = vscode.Uri.joinPath(folder.uri, 'watched-loop');
        const waitForLoop = async (expected: boolean) => {
            for (let attempt = 0; attempt < 100; attempt++) {
                const data = decorationCache.get(uri.toString());
                if (data && data.warnings.some(w => w.message.includes('watched-loop')) === expected) return;
                await new Promise(resolve => setTimeout(resolve, 40));
            }
            assert.fail('The loop warning did not reach the expected state: ' + expected);
        };
        await vscode.extensions.getExtension('ignore-lens.ignore-lens')!.activate();
        await vscode.window.showTextDocument(uri, { preview: true });
        try {
            await waitForLoop(false);
            await symlink(folder.uri.fsPath, loop.fsPath, process.platform === 'win32' ? 'junction' : 'dir');
            await waitForLoop(true);
            await unlink(loop.fsPath);
            await waitForLoop(false);
        } finally {
            await unlink(loop.fsPath).catch(error => {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            });
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
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
