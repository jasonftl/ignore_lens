import ignore from 'ignore';
import { AdvancedCountResult, IgnoreFileType } from './types';

export interface ICountCalculator {
    calculateCount(matchingFiles: string[], isNegation: boolean, ignored: Set<string>, pattern: string): AdvancedCountResult;
}

export class GitignoreCountCalculator implements ICountCalculator {
    private readonly rules: ignore.Ignore;

    constructor(ignoreCase = false) {
        this.rules = ignore({ ignoreCase });
    }

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
        case 'gitignore': return new GitignoreCountCalculator(ignoreCase);
        default: return new SequentialCountCalculator();
    }
}
