// Date: 29/11/2025
// Test runner entry point for VS Code extension tests

import * as path from 'path';
import * as fs from 'fs/promises';
import { runTests } from '@vscode/test-electron';

/**
 * Main function to run the extension tests.
 */
async function main(): Promise<void> {
    // The folder containing the extension manifest
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');
    const workspacePath = path.resolve(extensionDevelopmentPath, '.vscode-test/workspace');

    try {
        // The path to the extension test script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Isolated workspace for scanner integration tests
        await fs.rm(workspacePath, { recursive: true, force: true });
        await fs.mkdir(path.join(workspacePath, 'ignored'), { recursive: true });
        await fs.mkdir(path.join(workspacePath, '.git'), { recursive: true });
        await fs.writeFile(path.join(workspacePath, '.gitignore'), 'ignored/\n');
        await fs.writeFile(path.join(workspacePath, 'ignored/file.txt'), 'ignored by git\n');
        await fs.writeFile(path.join(workspacePath, '.git/HEAD'), 'ref: refs/heads/main\n');

        // Download VS Code, unzip it, and run the integration tests
        await runTests({ extensionDevelopmentPath, extensionTestsPath, launchArgs: [workspacePath] });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exitCode = 1;
    } finally {
        await fs.rm(workspacePath, { recursive: true, force: true });
    }
}

main();
