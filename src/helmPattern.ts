import { sep } from 'node:path';

const separator = sep.charCodeAt(0);
type CharacterMatch = number | ((codePoint: number) => boolean);

/** Compiles the syntax used by Go's filepath.Match, which Helm uses for ignore rules. */
export function compileHelmPattern(pattern: string): ((path: string) => boolean) | undefined {
    const characters = Array.from(pattern);
    const escapes = sep !== '\\';
    const chunks: CharacterMatch[][] = [[]];
    let tokens = chunks[0];
    let index = 0;

    const readClassMember = () => {
        let character = characters[index++];
        if (character === '-' || character === ']') return undefined;
        if (escapes && character === '\\') character = characters[index++];
        return character?.codePointAt(0);
    };

    while (index < characters.length) {
        let character = characters[index++];
        if (character === '*') {
            tokens = [];
            chunks.push(tokens);
        } else if (character === '?') {
            tokens.push(code => code !== separator);
        } else if (character === '[') {
            const inverted = characters[index] === '^';
            if (inverted) index++;
            const ranges: [number, number][] = [];
            do {
                const first = readClassMember();
                if (first === undefined) return undefined;
                let last = first;
                if (characters[index] === '-') {
                    index++;
                    const end = readClassMember();
                    if (end === undefined) return undefined;
                    last = end;
                }
                ranges.push([first, last]);
            } while (characters[index] !== ']');
            index++;
            tokens.push(code => ranges.some(([first, last]) => first <= code && code <= last) !== inverted);
        } else {
            if (escapes && character === '\\') {
                character = characters[index++];
                if (character === undefined) return undefined;
            }
            for (const byte of Buffer.from(character)) tokens.push(byte);
        }
    }

    return path => {
        const value = Buffer.from(path);
        let offset = 0;
        // Like filepath.Match, commit to the first matching chunk after each star.
        for (const [chunkIndex, chunk] of chunks.entries()) {
            const last = chunkIndex === chunks.length - 1;
            while (true) {
                const end = matchChunk(chunk, value, offset);
                if (end !== -1 && (!last || end === value.length)) {
                    offset = end;
                    break;
                }
                if (chunkIndex === 0 || offset === value.length || value[offset] === separator) return false;
                offset++;
            }
        }
        return true;
    };
}

function matchChunk(chunk: CharacterMatch[], value: Buffer, offset: number): number {
    for (const token of chunk) {
        if (offset === value.length) return -1;
        const byte = value[offset];
        if (typeof token === 'number') {
            if (byte !== token) return -1;
            offset++;
        } else {
            // A star can stop on a UTF-8 continuation byte. Go reads it as U+FFFD.
            const width = byte < 0xc0 ? 1 : byte < 0xe0 ? 2 : byte < 0xf0 ? 3 : 4;
            const code = byte < 0x80 ? byte : value.toString('utf8', offset, offset + width).codePointAt(0)!;
            if (!token(code)) return -1;
            offset += width;
        }
    }
    return offset;
}
