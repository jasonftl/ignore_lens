// Date: 24/04/2026
// Strategy pattern for pattern matching in different ignore file types
// Git ignore patterns match basenames. VSCE matches paths from the package root.

import ignore from 'ignore';
import { Minimatch } from 'minimatch';
import { posix, sep } from 'node:path';
import { createGitignoreRules, IgnoreRules } from './gitignoreRules';
import { compileHelmPattern } from './helmPattern';
import { IgnoreFileType } from './types';

const MAX_PATTERN_CACHE_SIZE = 200;

function getCompiledPattern<T>(cache: Map<string, T>, pattern: string, compile: () => T): T {
    const cached = cache.get(pattern);
    if (cached) {
        return cached;
    }

    if (cache.size >= MAX_PATTERN_CACHE_SIZE) {
        cache.clear();
    }

    const compiled = compile();
    cache.set(pattern, compiled);
    return compiled;
}

/**
 * Interface for pattern matchers.
 */
export interface IPatternMatcher {
    findMatches(pattern: string, files: string[]): string[];
}

/** Git uses the same rules to match files and their parent directories. */
export class GitignoreMatcher implements IPatternMatcher {
    constructor(private readonly createRules: () => IgnoreRules = createGitignoreRules) {}

    public findMatches(pattern: string, files: string[]): string[] {
        const positive = pattern.startsWith('!') ? pattern.slice(1).replace(/^[!#]/, '\\$&') : pattern;
        const rules = this.createRules();
        rules.add(positive);
        return files.filter(file => rules.ignores(file));
    }
}

/**
 * Matcher for .vscodeignore patterns.
 * Uses pure minimatch with { dot: true }.
 * NO recursive basename matching - *.log only matches root level.
 * Tests possible folder names with a recursive suffix as VSCE does.
 */
export class VscodeignoreMatcher implements IPatternMatcher {
    private readonly patternCache = new Map<string, Minimatch>();

    public findMatches(pattern: string, files: string[]): string[] {
        const positive = pattern.startsWith('!') ? pattern.slice(1) : pattern;
        const raw = this.compile(positive);
        const folder = /(^|\/)[^/]*\*[^/]*$/.test(positive)
            ? undefined
            : this.compile(positive.endsWith('/') ? positive + '**' : positive + '/**');
        return files.filter(file => raw.match(file) || folder?.match(file));
    }

    private compile(pattern: string): Minimatch {
        return getCompiledPattern(this.patternCache, pattern, () => new Minimatch(pattern, { dot: true, nonegate: true }));
    }

}

/**
 * Matcher for files that never treat ! as negation (bzrignore, chefignore, cvsignore).
 * Uses pure minimatch with { dot: true, nonegate: true, nocomment: true }.
 * The ! character at the start of a pattern matches a literal ! in filenames.
 * The # character at the start of a pattern matches a literal # in filenames (cvsignore).
 */
export class GlobNoNegationMatcher implements IPatternMatcher {
    private readonly patternCache = new Map<string, Minimatch>();

    /**
     * Expands a folder pattern to include all contents.
     * folder/ becomes folder/**
     *
     * @param pattern - The original pattern
     * @returns Expanded pattern or original if no expansion needed
     */
    private expandFolderPattern(pattern: string): string {
        if (pattern.endsWith('/')) {
            return pattern + '**';
        }
        return pattern;
    }

    /**
     * Finds all files that match the given pattern.
     * Never treats ! as negation - it's always a literal character.
     *
     * ISSUE-M025 optimisation: compile the pattern into a Minimatch instance once
     * and reuse it across every file in the workspace.
     *
     * @param pattern - The pattern to match against
     * @param files - Array of file paths (relative, with forward slashes)
     * @returns Matching file paths
     */
    public findMatches(pattern: string, files: string[]): string[] {
        let cleanPattern = pattern;

        // Auto-expand folder patterns: folder/ becomes folder/**
        cleanPattern = this.expandFolderPattern(cleanPattern);

        const matchingFiles: string[] = [];

        // Compile once, reuse for every file (ISSUE-M025)
        // NO matchBase option - *.log only matches root level
        // Use { dot: true } to match dotfiles
        // Use { nonegate: true } so ! in patterns is treated as literal
        // Use { nocomment: true } so # in patterns is treated as literal (cvsignore)
        const matcher = getCompiledPattern(
            this.patternCache,
            cleanPattern,
            () => new Minimatch(cleanPattern, { dot: true, nonegate: true, nocomment: true })
        );

        for (const file of files) {
            if (matcher.match(file)) {
                matchingFiles.push(file);
            }
        }

        return matchingFiles;
    }

}

/** Docker matches a rule against the path and each parent directory. */
class DockerignoreMatcher implements IPatternMatcher {
    private readonly patternCache = new Map<string, Minimatch>();

    public findMatches(pattern: string, files: string[]): string[] {
        const positive = pattern.startsWith('!') ? pattern.slice(1) : pattern;
        const matcher = getCompiledPattern(this.patternCache, positive,
            () => new Minimatch(positive, { dot: true, nonegate: true, nocomment: true, nobrace: true, noext: true }));
        return files.filter(file => matchesPathOrParent(file, candidate => matcher.match(candidate)));
    }
}

export function matchesPathOrParent(file: string, matches: (candidate: string) => boolean): boolean {
    let candidate = file;
    while (candidate) {
        if (matches(candidate)) return true;
        const slash = candidate.lastIndexOf('/');
        if (slash === -1) return false;
        candidate = candidate.slice(0, slash);
    }
    return false;
}

class HelmignoreMatcher implements IPatternMatcher {
    private readonly patternCache = new Map<string, (file: string) => boolean>();

    public findMatches(pattern: string, files: string[]): string[] {
        const excludes = getCompiledPattern(this.patternCache, pattern, () => {
            const inverted = pattern.startsWith('!');
            const positive = inverted ? pattern.slice(1) : pattern;
            const directoryOnly = positive.endsWith('/');
            const body = positive.replace(/\/$/, '').replace(/^\//, '');
            const matchPath = positive.startsWith('/') || body.includes('/');
            const matches = compileHelmPattern(body);
            return file => matchesPathOrParent(file, candidate => {
                const name = matchPath ? candidate : posix.basename(candidate);
                const matched = (!directoryOnly || candidate !== file) && matches?.(name) === true;
                return matched !== inverted;
            });
        });
        return files.filter(excludes);
    }
}

class P4ignoreMatcher extends GitignoreMatcher {
    private readonly recursivePatterns = new Map<string, { tokens: string[]; anchored: boolean; directory: boolean }>();

    public findMatches(pattern: string, files: string[]): string[] {
        if (!pattern.includes('**')) return super.findMatches(pattern, files);

        const rule = getCompiledPattern(this.recursivePatterns, pattern, () => {
            const positive = pattern.replace(/^!/, '').toLowerCase();
            const body = positive.replace(/^\//, '').replace(/\/$/, '').replace(/^\\#/, '#');
            return {
                tokens: body.match(/\*{2,}\/|\*{2,}|\*|[^*]/g) ?? [],
                anchored: positive.startsWith('/') || body.includes('/'),
                directory: positive.endsWith('/')
            };
        });
        return files.filter(file => this.matchesRecursive(file.toLowerCase(), rule));
    }

    private matchesRecursive(file: string, rule: { tokens: string[]; anchored: boolean; directory: boolean }): boolean {
        let positions = new Uint8Array(file.length + 1);
        let next = new Uint8Array(file.length + 1);
        positions[0] = 1;
        if (!rule.anchored) {
            for (let i = 0; i < file.length; i++) {
                if (file[i] === '/') positions[i + 1] = 1;
            }
        }

        // Track reachable offsets so several recursive stars cannot cause backtracking.
        for (const token of rule.tokens) {
            if (token.startsWith('**') && token.endsWith('/')) {
                let reachable = 0;
                for (let i = 0; i <= file.length; i++) {
                    next[i] = positions[i] || (file[i - 1] === '/' ? reachable : 0);
                    reachable ||= positions[i];
                }
            } else if (token.startsWith('*')) {
                next[0] = positions[0];
                for (let i = 1; i <= file.length; i++) {
                    next[i] = positions[i] || (token !== '*' || file[i - 1] !== '/' ? next[i - 1] : 0);
                }
            } else {
                next[0] = 0;
                for (let i = 1; i <= file.length; i++) {
                    next[i] = token === file[i - 1] ? positions[i - 1] : 0;
                }
            }
            [positions, next] = [next, positions];
        }

        if (!rule.directory && positions[file.length]) return true;
        for (let i = 0; i < file.length; i++) {
            if (positions[i] && file[i] === '/') return true;
        }
        return false;
    }
}

class BazelignoreMatcher implements IPatternMatcher {
    public findMatches(pattern: string, files: string[]): string[] {
        const directory = posix.normalize(pattern.split(sep).join('/')).replace(/\/$/, '');
        if (directory === '.') return files.slice();
        const prefix = directory + '/';
        return files.filter(file => file.startsWith(prefix));
    }
}

export class NpmignoreRule {
    private readonly matcher: Minimatch;
    private readonly matchDirectoryBasename: boolean;
    public readonly isNegation: boolean;

    constructor(pattern: string) {
        this.matcher = new Minimatch(pattern, { dot: true, matchBase: true, nocase: true, flipNegate: true });
        this.isNegation = this.matcher.negate;
        this.matchDirectoryBasename = this.matcher.globParts.some(parts => parts.length <= (parts[parts.length - 1] ? 1 : 2));
    }

    public matchesPath(path: string, partial = false): boolean {
        return this.matcher.match(path, partial) || this.matcher.match('/' + path, partial);
    }

    public matchesDirectory(directory: string, includePartial = true): boolean {
        const partial = includePartial && this.isNegation;
        if (this.matchesPath(directory) || this.matchesDirectoryEntry(directory, partial)) return true;
        const slash = directory.lastIndexOf('/');
        return this.matchDirectoryBasename && slash !== -1 && this.matchesDirectoryEntry(directory.slice(slash + 1), partial);
    }

    private matchesDirectoryEntry(path: string, partial: boolean): boolean {
        return this.matchesPath(path + '/') || (partial && this.matchesPath(path, true));
    }
}

class NpmignoreMatcher implements IPatternMatcher {
    private readonly patternCache = new Map<string, NpmignoreRule>();

    public findMatches(pattern: string, files: string[]): string[] {
        const rule = getCompiledPattern(this.patternCache, pattern, () => new NpmignoreRule(pattern));
        return files.filter(file => matchesPathOrParent(file, candidate =>
            candidate === file ? rule.matchesPath(candidate) : rule.matchesDirectory(candidate)));
    }
}

export function getMatcher(fileType: IgnoreFileType, ignoreCase = false): IPatternMatcher {
    switch (fileType) {
        case 'glob-no-negation':
        case 'cvsignore': return new GlobNoNegationMatcher();
        case 'vscodeignore': return new VscodeignoreMatcher();
        case 'dockerignore': return new DockerignoreMatcher();
        case 'helmignore': return new HelmignoreMatcher();
        case 'p4ignore': return new P4ignoreMatcher(ignore);
        case 'npmignore': return new NpmignoreMatcher();
        case 'bazelignore': return new BazelignoreMatcher();
        case 'tfignore': return new GitignoreMatcher(ignore);
        case 'gitignore': return new GitignoreMatcher(() => createGitignoreRules(ignoreCase));
        default: return new GitignoreMatcher(() => ignore({ ignoreCase: false }));
    }
}
