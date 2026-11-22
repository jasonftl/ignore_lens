import type { Dirent } from 'fs';
import { readdir, realpath, stat } from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ScanWarning {
    path: string;
    message: string;
}

export interface WorkspaceFiles {
    files: Set<string>;
    warnings: ScanWarning[];
}

interface Directory {
    absolute: string;
    relative: string;
    parent?: Directory;
    linked: boolean;
}

export function checkCancellation(token: vscode.CancellationToken): void {
    if (token.isCancellationRequested) throw new vscode.CancellationError();
}

function unavailableMessage(error: unknown): string | undefined {
    switch ((error as NodeJS.ErrnoException).code) {
        case 'ENOENT':
        case 'ENOTDIR': return 'Target unavailable';
        case 'ELOOP': return 'Symlink loop';
        case 'EACCES':
        case 'EPERM': return 'Permission denied';
        case 'UNKNOWN': return process.platform === 'win32' ? 'Target unavailable' : undefined;
        default: return undefined;
    }
}

function hasAncestor(directory: Directory | undefined, target: string): boolean {
    for (; directory; directory = directory.parent) {
        if (path.relative(directory.absolute, target) === '') return true;
    }
    return false;
}

/** Cache physical directory listings, including those shared by more than one link. */
export class WorkspaceTree {
    private readonly listings = new Map<string, Promise<Dirent[]>>();
    private locations = new Map<string, string>();
    public links = new Set<string>();
    private linkedParents = new Map<string, string[]>();
    private checkFileTargets = false;
    private root?: string;

    constructor(private readonly folder: string) {}

    public isDirectoryOrLink(relative: string): boolean {
        return this.locations.has(relative) || this.links.has(relative);
    }

    public changed(relative: string, subtree: boolean): void {
        let parent = path.posix.dirname(relative);
        // The watcher can report a child before its new parent directory.
        while (parent !== '.' && !this.locations.has(parent)) parent = path.posix.dirname(parent);
        const absolute = this.locations.get(parent === '.' ? '' : parent) ?? this.root ?? this.folder;
        this.listings.delete(absolute);
        const child = path.resolve(absolute, path.posix.relative(parent, relative));
        if (subtree && (this.listings.has(child) || this.locations.has(relative))) {
            for (const key of this.listings.keys()) {
                if (key === child || key.startsWith(child + path.sep)) this.listings.delete(key);
            }
        }
    }

    /** A file below a linked directory can appear under several names in the counts. */
    public filePaths(relative: string): string[] | undefined {
        if (this.checkFileTargets) return undefined;
        const parent = path.posix.dirname(relative);
        const absolute = this.locations.get(parent === '.' ? '' : parent);
        if (!absolute || !this.root) return undefined;
        if (!this.links.size) return [relative];
        const file = path.basename(relative);
        const paths = (this.linkedParents.get(absolute) ?? []).map(alias => alias + '/' + file);
        const physical = path.relative(this.root, path.join(absolute, file));
        if (!path.isAbsolute(physical) && !physical.startsWith('..' + path.sep)) {
            paths.push(physical.split(path.sep).join('/'));
        }
        return paths;
    }

    private entries(absolute: string): Promise<Dirent[]> {
        let listing = this.listings.get(absolute);
        if (!listing) {
            listing = readdir(absolute, { withFileTypes: true });
            this.listings.set(absolute, listing);
            listing.catch(() => {
                if (this.listings.get(absolute) === listing) this.listings.delete(absolute);
            });
        }
        return listing;
    }

    public async scan(token: vscode.CancellationToken, report: (message: string) => void): Promise<WorkspaceFiles> {
        const root = this.root ??= await realpath(this.folder);
        const pending: Directory[] = [{ absolute: root, relative: '', linked: false }];
        const links = new Set<string>();
        let checkFileTargets = false;
        const linkedParents = new Map<string, string[]>();
        const locations = new Map<string, string>();
        const warnings = new Map<string, string>();
        const files = new Set<string>();
        let directories = 0;
        let nextUpdate = performance.now() + 300;
        const showProgress = async () => {
            report('Checking files and links... ' + directories.toLocaleString() + ' folders');
            await new Promise<void>(resolve => setImmediate(resolve));
            checkCancellation(token);
            nextUpdate = performance.now() + 300;
        };
        report('Checking files and links...');
        while (pending.length) {
            checkCancellation(token);
            if (performance.now() >= nextUpdate) await showProgress();
            const directory = pending.pop()!;
            locations.set(directory.relative, directory.absolute);
            if (directory.linked) {
                const parents = linkedParents.get(directory.absolute) ?? [];
                parents.push(directory.relative);
                linkedParents.set(directory.absolute, parents);
            }
            let entries: Dirent[];
            try {
                entries = await this.entries(directory.absolute);
            } catch (error) {
                const message = unavailableMessage(error);
                if (!message || !directory.parent) throw error;
                warnings.set(directory.relative, message);
                continue;
            }
            directories++;
            for (const entry of entries) {
                if (performance.now() >= nextUpdate) await showProgress();
                const relative = directory.relative ? directory.relative + '/' + entry.name : entry.name;
                let absolute = path.join(directory.absolute, entry.name);
                const link = entry.isSymbolicLink();
                if (link) links.add(relative);
                const linked = directory.linked || link;
                let type: Pick<Dirent, 'isDirectory' | 'isFile'> = entry;
                if (link) {
                    try {
                        absolute = await realpath(absolute);
                        type = await stat(absolute);
                    } catch (error) {
                        const message = unavailableMessage(error);
                        if (!message) throw error;
                        warnings.set(relative, message);
                        if (message !== 'Symlink loop') checkFileTargets = true;
                        continue;
                    }
                }
                if (type.isDirectory()) {
                    if (linked && hasAncestor(directory, absolute)) {
                        warnings.set(relative, 'Symlink loop');
                    } else {
                        pending.push({ absolute, relative, parent: directory, linked });
                    }
                } else if (type.isFile()) {
                    if (link) checkFileTargets = true;
                    files.add(relative);
                }
            }
        }
        checkCancellation(token);
        this.locations = locations;
        const visited = new Set(locations.values());
        for (const key of this.listings.keys()) {
            if (!visited.has(key)) this.listings.delete(key);
        }
        this.links = links;
        this.checkFileTargets = checkFileTargets;
        this.linkedParents = linkedParents;
        return { files, warnings: Array.from(warnings, ([path, message]) => ({ path, message })) };
    }
}
