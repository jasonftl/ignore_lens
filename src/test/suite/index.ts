// Date: 29/11/2025
// Test suite index - discovers and runs all tests

import * as path from 'path';
import Mocha from 'mocha';
import { glob } from 'glob';

/**
 * Runs the test suite.
 */
export async function run(): Promise<void> {
    // Create the mocha test
    const mocha = new Mocha({
        ui: 'tdd',
        color: true
    });

    const testsRoot = path.resolve(__dirname, '.');

    // Find all test files
    const files = await glob('**/**.test.js', { cwd: testsRoot });

    // Add files to the test suite
    for (const file of files) {
        mocha.addFile(path.resolve(testsRoot, file));
    }

    // Run the mocha tests
    return new Promise((resolve, reject) => {
        try {
            mocha.run((failures: number) => {
                if (failures > 0) {
                    reject(new Error(failures.toString() + ' tests failed.'));
                } else {
                    resolve();
                }
            });
        } catch (err) {
            console.error(err);
            reject(err);
        }
    });
}
