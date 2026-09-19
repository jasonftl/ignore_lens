import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

function isDebugEnabled(): boolean {
    return vscode.workspace.getConfiguration('ignorelens').get<boolean>('debug', false);
}

function getOutputChannel(): vscode.OutputChannel {
    if (!outputChannel) {
        outputChannel = vscode.window.createOutputChannel('IgnoreLens');
    }
    return outputChannel;
}

function getTimestamp(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const millis = String(now.getMilliseconds()).padStart(3, '0');
    return '[' + hours + ':' + minutes + ':' + seconds + '.' + millis + ']';
}

export function log(message: string): void {
    if (isDebugEnabled()) {
        getOutputChannel().appendLine(getTimestamp() + ' ' + message);
    }
}

export function logTiming(label: string, ms: number): void {
    log(label + ' (' + ms + 'ms)');
}

export function disposeLogger(): void {
    outputChannel?.dispose();
    outputChannel = undefined;
}
