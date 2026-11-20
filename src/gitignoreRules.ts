import ignore from 'ignore';

export interface IgnoreRules {
    add(pattern: string): void;
    ignores(path: string): boolean;
}

export function createGitignoreRules(ignoreCase = false): IgnoreRules {
    const rules = ignore({ ignoreCase: false });

    return {
        add(pattern) {
            const bytes = gitBytes(pattern);
            rules.add(ignoreCase ? foldPattern(bytes) : bytes);
        },
        ignores(path) {
            const bytes = gitBytes(path);
            return rules.ignores(ignoreCase ? bytes.replace(/[A-Z]/g, char => char.toLowerCase()) : bytes);
        }
    };
}

// Wildmatch consumes UTF-8 bytes, including inside bracket expressions.
function gitBytes(value: string): string {
    return /[\u0080-\uFFFF]/.test(value) ? Buffer.from(value, 'utf8').toString('latin1') : value;
}

function foldPattern(pattern: string): string {
    let folded = '';
    for (let index = 0; index < pattern.length;) {
        const char = pattern[index];
        if (char === '\\') {
            folded += pattern.slice(index, index + 2);
            index += 2;
        } else if (char === '[') {
            const bracket = foldBracket(pattern, index);
            if (!bracket) return folded + pattern.slice(index);
            folded += bracket.pattern;
            index = bracket.end;
        } else {
            folded += char >= 'A' && char <= 'Z' ? char.toLowerCase() : char;
            index++;
        }
    }
    return folded;
}

function foldBracket(pattern: string, start: number): { pattern: string; end: number } | undefined {
    let index = start + 1;
    if (pattern[index] === '!' || pattern[index] === '^') index++;

    let previous = '';
    let additions = '';
    // Git leaves literal class members case-sensitive and tests both cases for ranges.
    while (index < pattern.length) {
        const char = pattern[index++];
        let trailingDash = false;
        if (char === '\\') {
            previous = pattern[index++];
        } else if (char === '-' && previous && index < pattern.length && pattern[index] !== ']') {
            if (pattern[index] === '\\') index++;
            if (index >= pattern.length) return;
            const lower = Math.max(previous.charCodeAt(0), 65);
            const upper = Math.min(pattern.charCodeAt(index++), 90);
            for (let code = lower; code <= upper; code++) additions += String.fromCharCode(code + 32);
            previous = '';
        } else if (char === '[' && pattern[index] === ':') {
            const close = pattern.indexOf(']', index);
            if (close === -1) return;
            if (pattern[close - 1] === ':') {
                if (pattern.slice(index, close) === ':upper:') additions += 'a-z';
                index = close + 1;
                previous = '';
            } else {
                previous = char;
            }
        } else {
            previous = char;
            trailingDash = char === '-';
        }

        if (pattern[index] === ']') {
            const body = additions && trailingDash ? pattern.slice(start, index - 1) + '\\-' : pattern.slice(start, index);
            return { pattern: body + additions + ']', end: index + 1 };
        }
    }
}
