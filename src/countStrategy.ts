import ignore from 'ignore';
import { createGitignoreRules, IgnoreRules } from './gitignoreRules';
import { matchesPathOrParent, NpmignoreRule } from './matcherStrategy';
import { AdvancedCountResult, IgnoreFileType } from './types';

export interface ICountCalculator {
    calculateCount(matchingFiles: string[], isNegation: boolean, ignored: Set<string>, pattern: string): AdvancedCountResult;
}

export class GitignoreCountCalculator implements ICountCalculator {
    constructor(private readonly rules: IgnoreRules = createGitignoreRules()) {}

    public calculateCount(files: string[], isNegation: boolean, ignored: Set<string>, pattern: string): AdvancedCountResult {
        this.rules.add(pattern);
        let actionCount = 0;
        let noActionCount = 0;
        let blockedCount = 0;

        for (const file of files) {
            if (isNegation) {
                const parent = file.lastIndexOf('/');
                if (parent !== -1 && this.rules.ignores(file.slice(0, parent + 1))) {
                    blockedCount++;
                } else if (!this.rules.ignores(file) && ignored.delete(file)) {
                    actionCount++;
                } else {
                    noActionCount++;
                }
            } else if (ignored.has(file)) {
                noActionCount++;
            } else {
                ignored.add(file);
                actionCount++;
            }
        }
        return { actionCount, noActionCount, blockedCount, setSize: ignored.size };
    }
}

class SequentialCountCalculator implements ICountCalculator {
    public calculateCount(files: string[], isNegation: boolean, ignored: Set<string>): AdvancedCountResult {
        let actionCount = 0;
        for (const file of files) {
            if (isNegation) {
                if (ignored.delete(file)) actionCount++;
            } else if (!ignored.has(file)) {
                ignored.add(file);
                actionCount++;
            }
        }
        return { actionCount, noActionCount: files.length - actionCount, blockedCount: 0, setSize: ignored.size };
    }
}

class NpmignoreCountCalculator implements ICountCalculator {
    private readonly rules: NpmignoreRule[] = [];
    private readonly sequential = new SequentialCountCalculator();

    public calculateCount(files: string[], isNegation: boolean, ignored: Set<string>, pattern: string): AdvancedCountResult {
        const rule = new NpmignoreRule(pattern);
        this.rules.push(rule);
        if (!isNegation) return this.sequential.calculateCount(files, false, ignored);

        let actionCount = 0;
        let noActionCount = 0;
        let blockedCount = 0;
        const directories = new Map<string, boolean>();
        const excludedDirectory = (path: string) => {
            let excluded = directories.get(path);
            if (excluded === undefined) {
                excluded = this.isExcluded(path, true);
                directories.set(path, excluded);
            }
            return excluded;
        };

        // npm can traverse a directory after a path-specific exception opens it.
        for (const file of files) {
            const slash = file.lastIndexOf('/');
            const blocked = slash !== -1 && matchesPathOrParent(file.slice(0, slash), excludedDirectory);
            if (!blocked && ignored.has(file) && !this.isExcluded(file, false)) {
                ignored.delete(file);
                actionCount++;
            } else if (matchesPathOrParent(file, candidate =>
                candidate === file ? rule.matchesPath(candidate) : rule.matchesDirectory(candidate, false))) {
                if (blocked) blockedCount++;
                else noActionCount++;
            }
        }
        return { actionCount, noActionCount, blockedCount, setSize: ignored.size };
    }

    private isExcluded(path: string, directory: boolean): boolean {
        for (let index = this.rules.length - 1; index >= 0; index--) {
            const rule = this.rules[index];
            if (directory ? rule.matchesDirectory(path) : rule.matchesPath(path)) return !rule.isNegation;
        }
        return false;
    }
}

export class VscodeignoreCountCalculator extends SequentialCountCalculator {
    private readonly exceptions = new Set<string>();

    public calculateCount(files: string[], isNegation: boolean, ignored: Set<string>): AdvancedCountResult {
        if (isNegation) {
            for (const file of files) this.exceptions.add(file);
        } else {
            files = files.filter(file => !this.exceptions.has(file));
        }
        return super.calculateCount(files, isNegation, ignored);
    }
}

export function getCountCalculator(fileType: IgnoreFileType, ignoreCase = false): ICountCalculator {
    switch (fileType) {
        case 'vscodeignore': return new VscodeignoreCountCalculator();
        case 'gitignore': return new GitignoreCountCalculator(createGitignoreRules(ignoreCase));
        case 'gcloudignore': return new GitignoreCountCalculator(ignore({ ignoreCase: false }));
        case 'npmignore': return new NpmignoreCountCalculator();
        default: return new SequentialCountCalculator();
    }
}
