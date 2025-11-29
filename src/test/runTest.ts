// Date: 29/11/2025
// Test runner entry point for VS Code extension tests

import * as path from 'path';
import { runTests } from '@vscode/test-electron';

/**
 * Main function to run the extension tests.
 */
async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // The path to the extension test script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, unzip it, and run the integration tests
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error('Failed to run tests');
        process.exit(1);
    }
}

main();
