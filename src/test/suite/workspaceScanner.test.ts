import * as assert from 'assert';
import * as vscode from 'vscode';
import { WorkspaceScanner } from '../../workspaceScanner';

suite('WorkspaceScanner Test Suite', () => {
    test('includes gitignored files and VCS metadata', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);

        const scanner = new WorkspaceScanner();
        try {
            const files = await scanner.getFilesInFolder(folder);
            assert.ok(files.includes('ignored/file.txt'));
            assert.ok(files.includes('.git/HEAD'));
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
            assert.ok(!(await scanner.getFilesInFolder(folder)).includes('created-after-scan.txt'));

            await scanner.addPath(file);
            assert.ok((await scanner.getFilesInFolder(folder)).includes('created-after-scan.txt'));

            await vscode.workspace.fs.delete(file);
            assert.ok((await scanner.getFilesInFolder(folder)).includes('created-after-scan.txt'));

            scanner.removePath(file);
            assert.ok(!(await scanner.getFilesInFolder(folder)).includes('created-after-scan.txt'));
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

            const files = await scanner.getFilesInFolder(folder);
            assert.ok(files.includes('created-directory/child.txt'));
            assert.ok(!files.includes('created-directory'));
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
