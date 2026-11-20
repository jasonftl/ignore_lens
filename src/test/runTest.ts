// Date: 29/11/2025
// Test runner entry point for VS Code extension tests

import * as path from 'path';
import * as fs from 'fs/promises';
import { tmpdir } from 'os';
import { runTests } from '@vscode/test-electron';

/**
 * Main function to run the extension tests.
 */
async function main(): Promise<void> {
    // The folder containing the extension manifest
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    let testRoot: string | undefined;

    try {
        // The path to the extension test script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        const temp = await fs.realpath(tmpdir());
        testRoot = await fs.mkdtemp(path.join(temp, 'ignorelens-test-'));
        const workspacePath = path.join(testRoot, 'workspace');
        await fs.mkdir(path.join(workspacePath, 'ignored'), { recursive: true });
        await fs.mkdir(path.join(workspacePath, '.git'), { recursive: true });
        await fs.writeFile(path.join(workspacePath, '.gitignore'), 'ignored/\n');
        await fs.writeFile(path.join(workspacePath, 'ignored/file.txt'), 'ignored by git\n');
        await fs.writeFile(path.join(workspacePath, '.git/HEAD'), 'ref: refs/heads/main\n');

        // Download VS Code, unzip it, and run the integration tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [workspacePath, '--user-data-dir', path.join(testRoot, 'user-data'), '--extensions-dir', path.join(testRoot, 'extensions')]
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exitCode = 1;
    } finally {
        if (testRoot) {
            const resolved = await fs.realpath(testRoot);
            if (resolved === testRoot && path.basename(resolved).startsWith('ignorelens-test-')) {
                await fs.rm(resolved, { recursive: true, force: true });
            }
        }
    }
}

main();
