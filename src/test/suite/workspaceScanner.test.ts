import * as assert from 'assert';
import * as vscode from 'vscode';
import { mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { WorkspaceScanner } from '../../workspaceScanner';

suite('WorkspaceScanner Test Suite', () => {
    test('a late create failure cannot remove a recreated file', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const uri = vscode.Uri.joinPath(folder.uri, 'recreated.ts');
        let failFirst!: (error: Error) => void;
        let first = true;
        const scanner = new WorkspaceScanner(async () => [], () => {
            if (!first) return Promise.resolve({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 });
            first = false;
            return new Promise((_resolve, reject) => { failFirst = reject; });
        });
        try {
            await scanner.getFilesInFolder(folder);
            const pending = scanner.addPath(uri);
            assert.ok(scanner.removePath(uri));
            assert.strictEqual(await scanner.addPath(uri), 'file');
            failFirst(new Error('original file was deleted'));
            assert.strictEqual(await pending, undefined);
            assert.ok((await scanner.getFilesInFolder(folder)).files.has('recreated.ts'));
        } finally {
            scanner.dispose();
        }
    });

    test('removes a cached link warning on deletion and deletes known files directly', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const link = vscode.Uri.joinPath(folder.uri, 'gone-link');
        const file = vscode.Uri.joinPath(folder.uri, 'ordinary.txt');
        const scanner = new WorkspaceScanner(async () => [file]);
        try {
            const cached = await scanner.getFilesInFolder(folder);
            cached.warnings.push({ path: 'gone-link', message: 'Target unavailable' });
            assert.ok(scanner.removePath(link));
            assert.deepStrictEqual(cached.warnings, []);
            cached.files[Symbol.iterator] = () => assert.fail('A known file can be deleted without scanning the set.');
            assert.ok(scanner.removePath(file));
            assert.strictEqual(cached.files.size, 0);
        } finally {
            scanner.dispose();
        }
    });

    test('falls back when the symlink time budget expires at the root', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const scanner = new WorkspaceScanner(async () => assert.fail('Budget exhaustion must skip VS Code search.'));
        const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
        let time = 0;
        Object.defineProperty(performance, 'now', { configurable: true, value: () => time += 300 });
        try {
            const scan = await scanner.getFilesInFolder(folder);
            assert.strictEqual(scan.fallback, 'Symlink check did not finish');
            assert.ok(scan.files.has('ignored/file.txt'));
        } finally {
            if (descriptor) Object.defineProperty(performance, 'now', descriptor);
            else Reflect.deleteProperty(performance, 'now');
            scanner.dispose();
        }
    });

    test('detects a symlink loop before searching and skips linked targets', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const alias = vscode.Uri.joinPath(folder.uri, 'alias');
        const target = vscode.Uri.joinPath(folder.uri, 'ignored');
        const loop = vscode.Uri.joinPath(target, 'loop');
        const type = process.platform === 'win32' ? 'junction' : 'dir';
        const scanner = new WorkspaceScanner(async () => {
            assert.fail('A workspace with a symlink loop must use the no-follow scan.');
        });
        try {
            await symlink(target.fsPath, alias.fsPath, type);
            await symlink(folder.uri.fsPath, loop.fsPath, type);
            const result = await scanner.getFilesInFolder(folder);
            assert.strictEqual(result.fallback, 'Symlink loop');
            assert.ok(result.files.has('ignored/file.txt'));
            assert.ok(!result.files.has('alias/file.txt'));
            assert.ok(result.files.has('.git/HEAD'));
            assert.ok(result.warnings.some(warning => warning.path === 'alias'));
            assert.ok(result.warnings.some(warning => warning.path.endsWith('/loop') && warning.message === 'Symlink loop'));
        } finally {
            scanner.dispose();
            for (const uri of [loop, alias]) {
                await unlink(uri.fsPath).catch(error => {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                        throw error;
                    }
                });
            }
        }
    });

    test('cancels a shared scan and discards its late results', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const file = vscode.Uri.joinPath(folder.uri, 'late.txt');
        let searches = 0;
        let token: vscode.CancellationToken | undefined;
        let complete: ((files: vscode.Uri[]) => void) | undefined;
        let searchStarted!: () => void;
        const started = new Promise<void>(resolve => { searchStarted = resolve; });
        const scanner = new WorkspaceScanner((_include, _exclude, _maxResults, scanToken) => {
            searches++;
            if (searches > 1) {
                return Promise.resolve([]);
            }
            token = scanToken;
            searchStarted();
            return new Promise(resolve => { complete = resolve; });
        });
        try {
            const first = scanner.getFilesInFolder(folder);
            const second = scanner.getFilesInFolder(folder);
            await started;
            assert.strictEqual(searches, 1);
            const rejected = Promise.all([
                assert.rejects(first, vscode.CancellationError),
                assert.rejects(second, vscode.CancellationError)
            ]);
            scanner.cancelScans();
            assert.ok(token?.isCancellationRequested);

            const fresh = scanner.getFilesInFolder(folder);
            assert.ok(complete);
            complete([file]);
            await rejected;
            assert.strictEqual((await fresh).files.size, 0);
            assert.strictEqual((await scanner.getFilesInFolder(folder)).files.size, 0);
            assert.strictEqual(searches, 2);
        } finally {
            scanner.dispose();
        }
    });

    test('keeps using VS Code search when a small directory link is safe', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const alias = vscode.Uri.joinPath(folder.uri, 'small-alias');
        const target = vscode.Uri.joinPath(folder.uri, 'ignored');
        let searches = 0;
        const scanner = new WorkspaceScanner(async () => {
            searches++;
            return [vscode.Uri.joinPath(alias, 'file.txt')];
        });
        try {
            await symlink(target.fsPath, alias.fsPath, process.platform === 'win32' ? 'junction' : 'dir');
            const result = await scanner.getFilesInFolder(folder);
            assert.strictEqual(searches, 1);
            assert.strictEqual(result.fallback, undefined);
            assert.ok(result.files.has('small-alias/file.txt'));
        } finally {
            scanner.dispose();
            await unlink(alias.fsPath).catch(error => {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            });
        }
    });

    test('skips a linked tree that exceeds the pre-scan entry budget', async function () {
        this.timeout(10000);
        const parent = await realpath(tmpdir());
        const root = await mkdtemp(path.join(parent, 'ignorelens-link-budget-'));
        const workspace = path.join(root, 'workspace');
        const archive = path.join(root, 'archive');
        const source = path.join(root, 'source');
        const scanner = new WorkspaceScanner(async () => {
            assert.fail('A large linked tree must use the no-follow scan.');
        });
        try {
            for (const directory of [workspace, archive, source]) await mkdir(directory);
            await writeFile(path.join(workspace, 'ordinary.txt'), '');
            for (let i = 0; i < 256; i++) await writeFile(path.join(source, String(i)), '');
            const linkType = process.platform === 'win32' ? 'junction' : 'dir';
            for (let i = 0; i < 33; i++) await symlink(source, path.join(archive, 'alias-' + i), linkType);
            await symlink(archive, path.join(workspace, 'linked'), linkType);

            const result = await scanner.getFilesInFolder({ uri: vscode.Uri.file(workspace), name: 'workspace', index: 0 });
            assert.strictEqual(result.fallback, 'Linked directory exceeded the pre-scan size budget');
            assert.deepStrictEqual(Array.from(result.files), ['ordinary.txt']);
            assert.ok(result.warnings.some(warning => warning.path === 'linked'));
        } finally {
            scanner.dispose();
            const resolved = await realpath(root);
            assert.strictEqual(path.dirname(resolved), parent);
            assert.match(path.basename(resolved), /^ignorelens-link-budget-[a-zA-Z0-9]+$/);
            await rm(resolved, { recursive: true, force: true });
        }
    });

    test('includes gitignored files and VCS metadata', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);

        const scanner = new WorkspaceScanner();
        try {
            const { files, fallback } = await scanner.getFilesInFolder(folder);
            assert.strictEqual(fallback, undefined);
            assert.ok(files.has('ignored/file.txt'));
            assert.ok(files.has('.git/HEAD'));
        } finally {
            scanner.dispose();
        }
    });

    test('updates a cached file list from create and delete events', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);

        const scanner = new WorkspaceScanner();
        const file = vscode.Uri.joinPath(folder.uri, 'created-after-scan.txt');
        try {
            await scanner.getFilesInFolder(folder);
            await vscode.workspace.fs.writeFile(file, Buffer.from('test\n'));
            assert.ok(!(await scanner.getFilesInFolder(folder)).files.has('created-after-scan.txt'));

            await scanner.addPath(file);
            assert.ok((await scanner.getFilesInFolder(folder)).files.has('created-after-scan.txt'));

            await vscode.workspace.fs.delete(file);
            assert.ok((await scanner.getFilesInFolder(folder)).files.has('created-after-scan.txt'));

            scanner.removePath(file);
            assert.ok(!(await scanner.getFilesInFolder(folder)).files.has('created-after-scan.txt'));
        } finally {
            scanner.dispose();
            try {
                await vscode.workspace.fs.delete(file);
            } catch {
                // The test normally deletes the file before cleanup.
            }
        }
    });

    test('rescans files when a directory is created', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);

        const scanner = new WorkspaceScanner();
        const directory = vscode.Uri.joinPath(folder.uri, 'created-directory');
        const file = vscode.Uri.joinPath(directory, 'child.txt');
        try {
            await scanner.getFilesInFolder(folder);
            await vscode.workspace.fs.createDirectory(directory);
            await vscode.workspace.fs.writeFile(file, Buffer.from('test\n'));
            await scanner.addPath(directory);

            const { files } = await scanner.getFilesInFolder(folder);
            assert.ok(files.has('created-directory/child.txt'));
            assert.ok(!files.has('created-directory'));
        } finally {
            scanner.dispose();
            try {
                await vscode.workspace.fs.delete(directory, { recursive: true });
            } catch {
                // The directory might not exist if setup failed.
            }
        }
    });
});
