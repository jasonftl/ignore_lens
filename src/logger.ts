// Date: 01/12/2025
// Debug logging utility for IgnoreLens

import * as vscode from 'vscode';

/**
 * Logger utility for debug output.
 * Only logs when ignorelens.debug setting is enabled.
 */
export class Logger {
    private outputChannel: vscode.OutputChannel | undefined;

    /**
     * Creates a new Logger instance.
     */
    constructor() {
        // OutputChannel created lazily on first log
    }

    /**
     * Checks if debug logging is enabled.
     *
     * @returns true if debug logging is enabled
     */
    private isDebugEnabled(): boolean {
        const config = vscode.workspace.getConfiguration('ignorelens');
        const debugEnabled = config.get<boolean>('debug', false);
        return debugEnabled;
    }

    /**
     * Gets or creates the output channel.
     *
     * @returns The output channel
     */
    private getOutputChannel(): vscode.OutputChannel {
        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('IgnoreLens');
        }
        return this.outputChannel;
    }

    /**
     * Formats current time as timestamp.
     *
     * @returns Formatted timestamp string
     */
    private getTimestamp(): string {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const millis = String(now.getMilliseconds()).padStart(3, '0');
        const timestamp = '[' + hours + ':' + minutes + ':' + seconds + '.' + millis + ']';
        return timestamp;
    }

    /**
     * Logs a message to the output channel.
     *
     * @param message - The message to log
     */
    public log(message: string): void {
        if (!this.isDebugEnabled()) {
            return;
        }

        const channel = this.getOutputChannel();
        const timestamp = this.getTimestamp();
        const logLine = timestamp + ' ' + message;
        channel.appendLine(logLine);
    }

    /**
     * Logs a timing message to the output channel.
     *
     * @param label - Description of what was timed
     * @param ms - Duration in milliseconds
     */
    public logTiming(label: string, ms: number): void {
        const message = label + ' (' + ms + 'ms)';
        this.log(message);
    }

    /**
     * Disposes of the output channel.
     */
    public dispose(): void {
        if (this.outputChannel) {
            this.outputChannel.dispose();
            this.outputChannel = undefined;
        }
    }
}

// Singleton instance for use across the extension
let loggerInstance: Logger | undefined;

/**
 * Gets the shared logger instance.
 *
 * @returns The logger instance
 */
export function getLogger(): Logger {
    if (!loggerInstance) {
        loggerInstance = new Logger();
    }
    return loggerInstance;
}

/**
 * Disposes the shared logger instance.
 */
export function disposeLogger(): void {
    if (loggerInstance) {
        loggerInstance.dispose();
        loggerInstance = undefined;
    }
}
