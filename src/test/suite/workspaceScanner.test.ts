import * as assert from 'assert';
import * as vscode from 'vscode';
import { mkdir, mkdtemp, realpath, rename, rm, rmdir, symlink, unlink, writeFile } from 'fs/promises';
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
        const scanner = new WorkspaceScanner(undefined, () => {
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

    test('cancels pending creates by exact path for known files and by subtree for directories', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const file = vscode.Uri.joinPath(folder.uri, 'ignored', 'file.txt');
        const directory = vscode.Uri.joinPath(folder.uri, 'gone-directory');
        const child = vscode.Uri.joinPath(directory, 'pending.txt');
        const sibling = vscode.Uri.joinPath(folder.uri, 'sibling.txt');
        const complete: Array<(stat: vscode.FileStat) => void> = [];
        const scanner = new WorkspaceScanner(undefined, () => new Promise(resolve => complete.push(resolve)));
        const pending = (scanner as unknown as { pendingCreates: Map<string, symbol> }).pendingCreates;
        const keys = pending.keys.bind(pending);
        let walks = 0;
        pending.keys = () => {
            walks++;
            return keys();
        };
        try {
            await scanner.getFilesInFolder(folder);
            const creates = [file, child, sibling].map(uri => scanner.addPath(uri));
            assert.strictEqual(complete.length, 3);

            assert.ok(scanner.removePath(file));
            assert.strictEqual(walks, 0);
            assert.ok(scanner.removePath(directory));
            assert.strictEqual(walks, 1);

            for (const finish of complete) finish({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 0 });
            assert.deepStrictEqual(await Promise.all(creates), [undefined, undefined, 'file']);
            const files = (await scanner.getFilesInFolder(folder)).files;
            assert.ok(files.has('sibling.txt'));
            assert.ok(!files.has('gone-directory/pending.txt'));
        } finally {
            scanner.dispose();
        }
    });

    test('deletes a known file without iterating the cached file set', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const scanner = new WorkspaceScanner();
        try {
            const cached = await scanner.getFilesInFolder(folder);
            const count = cached.files.size;
            cached.files[Symbol.iterator] = () => assert.fail('A known file can be deleted directly.');
            assert.ok(scanner.removePath(vscode.Uri.joinPath(folder.uri, 'ignored', 'file.txt')));
            assert.strictEqual(cached.files.size, count - 1);
        } finally {
            scanner.dispose();
        }
    });

    test('finishes a slow scan, reports progress, and reuses the result', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const scanner = new WorkspaceScanner();
        const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
        let time = 0;
        Object.defineProperty(performance, 'now', { configurable: true, value: () => time += 500 });
        try {
            const messages: string[] = [];
            const scan = await scanner.getFilesInFolder(folder, message => messages.push(message));
            assert.ok(messages.some(message => message.includes('folders')));
            assert.deepStrictEqual(scan.warnings, []);
            assert.ok(scan.files.has('ignored/file.txt'));
            assert.strictEqual(await scanner.getFilesInFolder(folder, () => assert.fail('Unexpected repeat scan')), scan);
        } finally {
            if (descriptor) Object.defineProperty(performance, 'now', descriptor);
            else Reflect.deleteProperty(performance, 'now');
            scanner.dispose();
        }
    });

    test('stops at each loop and keeps files reached through a working link', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const alias = vscode.Uri.joinPath(folder.uri, 'alias');
        const target = vscode.Uri.joinPath(folder.uri, 'ignored');
        const loop = vscode.Uri.joinPath(target, 'loop');
        const type = process.platform === 'win32' ? 'junction' : 'dir';
        const scanner = new WorkspaceScanner();
        try {
            await symlink(target.fsPath, alias.fsPath, type);
            await symlink(folder.uri.fsPath, loop.fsPath, type);
            const result = await scanner.getFilesInFolder(folder);
            assert.ok(result.files.has('ignored/file.txt'));
            assert.ok(result.files.has('alias/file.txt'));
            assert.ok(result.files.has('.git/HEAD'));
            assert.deepStrictEqual(result.warnings.sort((a, b) => a.path.localeCompare(b.path)), [
                { path: 'alias/loop', message: 'Symlink loop' },
                { path: 'ignored/loop', message: 'Symlink loop' }
            ]);
            assert.ok(![...result.files].some(file => file.includes('/loop/')));

            const added = vscode.Uri.joinPath(target, 'added-beside-loop.txt');
            await writeFile(added.fsPath, '');
            try {
                await scanner.addPath(added);
                const updated = await scanner.getFilesInFolder(folder);
                assert.strictEqual(updated, result);
                assert.ok(updated.files.has('alias/added-beside-loop.txt'));
            } finally {
                await unlink(added.fsPath);
            }
            scanner.removePath(added);
            assert.ok(!result.files.has('alias/added-beside-loop.txt'));
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

    test('skips links that point to each other and still counts an unrelated linked directory', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const a = vscode.Uri.joinPath(folder.uri, 'cycle-a');
        const b = vscode.Uri.joinPath(folder.uri, 'cycle-b');
        const alias = vscode.Uri.joinPath(folder.uri, 'working-alias');
        const type = process.platform === 'win32' ? 'junction' : 'dir';
        const scanner = new WorkspaceScanner();
        try {
            await symlink(b.fsPath, a.fsPath, type);
            await symlink(a.fsPath, b.fsPath, type);
            await symlink(vscode.Uri.joinPath(folder.uri, 'ignored').fsPath, alias.fsPath, type);
            const result = await scanner.getFilesInFolder(folder);
            assert.deepStrictEqual(new Set(result.warnings.map(w => w.message + ': ' + w.path)),
                new Set(['Symlink loop: cycle-a', 'Symlink loop: cycle-b']));
            assert.ok(result.files.has('working-alias/file.txt'));
        } finally {
            scanner.dispose();
            for (const uri of [a, b, alias]) {
                await unlink(uri.fsPath).catch(error => {
                    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
                });
            }
        }
    });

    test('cancels a shared scan and discards its late results', async () => {
        const folder = { uri: vscode.Uri.parse('virtual:/test'), name: 'test', index: 0 };
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

    test('counts both names of a file under a safe directory link', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const alias = vscode.Uri.joinPath(folder.uri, 'small-alias');
        const target = vscode.Uri.joinPath(folder.uri, 'ignored');
        const scanner = new WorkspaceScanner();
        try {
            await symlink(target.fsPath, alias.fsPath, process.platform === 'win32' ? 'junction' : 'dir');
            const result = await scanner.getFilesInFolder(folder);
            assert.ok(result.files.has('ignored/file.txt'));
            assert.ok(result.files.has('small-alias/file.txt'));

            const created = vscode.Uri.joinPath(target, 'through-alias.txt');
            await writeFile(created.fsPath, '');
            try {
                await scanner.addPath(created);
                const updated = await scanner.getFilesInFolder(folder);
                assert.strictEqual(updated, result);
                assert.ok(updated.files.has('ignored/through-alias.txt'));
                assert.ok(updated.files.has('small-alias/through-alias.txt'));
            } finally {
                await unlink(created.fsPath);
            }
            scanner.removePath(created);
            assert.ok(!result.files.has('small-alias/through-alias.txt'));
        } finally {
            scanner.dispose();
            await unlink(alias.fsPath).catch(error => {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            });
        }
    });

    test('checks a moved directory for loops and clears the warning when the loop goes away', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const type = process.platform === 'win32' ? 'junction' : 'dir';
        const alias = vscode.Uri.joinPath(folder.uri, 'safe-alias');
        const target = vscode.Uri.joinPath(folder.uri, 'ignored');
        const incoming = vscode.Uri.joinPath(folder.uri, 'incoming');
        const loop = vscode.Uri.joinPath(incoming, 'loop');
        const unreported = vscode.Uri.joinPath(target, 'unreported.txt');
        const staging = await mkdtemp(path.join(path.dirname(folder.uri.fsPath), 'incoming-'));
        const scanner = new WorkspaceScanner();
        try {
            await symlink(target.fsPath, alias.fsPath, type);
            await scanner.getFilesInFolder(folder);
            // No watcher event for this file yet. Its directory should not be read again.
            await writeFile(unreported.fsPath, '');
            await writeFile(path.join(staging, 'new.txt'), '');
            await symlink(folder.uri.fsPath, path.join(staging, 'loop'), type);
            await rename(staging, incoming.fsPath);

            await scanner.addPath(incoming);
            const unsafe = await scanner.getFilesInFolder(folder);
            assert.deepStrictEqual(unsafe.warnings, [{ path: 'incoming/loop', message: 'Symlink loop' }]);
            assert.ok(unsafe.files.has('incoming/new.txt'));
            assert.ok(unsafe.files.has('safe-alias/file.txt'));
            assert.ok(!unsafe.files.has('ignored/unreported.txt'));

            await unlink(loop.fsPath);
            scanner.removePath(loop);
            const safe = await scanner.getFilesInFolder(folder);
            assert.deepStrictEqual(safe.warnings, []);
            assert.ok(safe.files.has('safe-alias/file.txt'));
            await scanner.addPath(unreported);
            assert.ok((await scanner.getFilesInFolder(folder)).files.has('safe-alias/unreported.txt'));
        } finally {
            scanner.dispose();
            const ifPresent = (error: NodeJS.ErrnoException) => {
                if (error.code !== 'ENOENT') throw error;
            };
            await unlink(alias.fsPath).catch(ifPresent);
            await unlink(unreported.fsPath).catch(ifPresent);
            for (const dir of [incoming.fsPath, staging]) {
                await unlink(path.join(dir, 'loop')).catch(ifPresent);
                await unlink(path.join(dir, 'new.txt')).catch(ifPresent);
                await rmdir(dir).catch(ifPresent);
            }
        }
    });

    test('counts a large linked tree to completion', async function () {
        this.timeout(10000);
        const parent = await realpath(tmpdir());
        const root = await mkdtemp(path.join(parent, 'ignorelens-link-budget-'));
        const workspace = path.join(root, 'workspace');
        const archive = path.join(root, 'archive');
        const source = path.join(root, 'source');
        const scanner = new WorkspaceScanner();
        try {
            for (const directory of [workspace, archive, source]) await mkdir(directory);
            await writeFile(path.join(workspace, 'ordinary.txt'), '');
            for (let i = 0; i < 256; i++) await writeFile(path.join(source, String(i)), '');
            const linkType = process.platform === 'win32' ? 'junction' : 'dir';
            for (let i = 0; i < 33; i++) await symlink(source, path.join(archive, 'alias-' + i), linkType);
            await symlink(archive, path.join(workspace, 'linked'), linkType);

            const result = await scanner.getFilesInFolder({ uri: vscode.Uri.file(workspace), name: 'workspace', index: 0 });
            assert.deepStrictEqual(result.warnings, []);
            assert.strictEqual(result.files.size, 33 * 256 + 1);
            assert.ok(result.files.has('linked/alias-32/255'));
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
            const { files, warnings } = await scanner.getFilesInFolder(folder);
            assert.deepStrictEqual(warnings, []);
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
