# IgnoreLens

A VS Code extension that shows how many files each ignore pattern matches and highlights redundant patterns.

![IgnoreLens screenshot](images/screenshot.png)

## Features

### Match Counts

Each pattern displays a count showing its effect on the ignore set:

```
node_modules/    +444  (444)
*.js             +1    (445)  ≡22
!src/            −3    (442)
!dist/file.js    −0    (442)  ∅2 ✗1
```

| Symbol | Meaning |
|--------|---------|
| `+N` | Files added to ignore set |
| `−N` | Files removed from ignore set |
| `(N)` | Current set size |
| `≡N` | Already in set (shadowed) |
| `∅N` | Not in set |
| `✗N` | Blocked by parent directory |

Counts are colour-coded:
- **Green**: Pattern is adding files
- **Yellow**: Negation pattern, or shadowed pattern (files already ignored by earlier pattern)
- **Red**: Redundant pattern (matches nothing)

### Redundant Pattern Detection

Patterns that don't match any files are highlighted in red, making it easy to spot outdated or mistyped rules.

### Real-time Updates

Decorations update automatically when you edit the file or when workspace files change.

## Supported Files

IgnoreLens supports multiple ignore file formats with accurate semantics:

| File | Pattern Matching | Notes |
|------|-----------------|-------|
| `.gitignore` | fnmatch with basename matching | `*.log` matches at any depth |
| `.prettierignore` | fnmatch with basename matching | Same semantics as .gitignore |
| `.vscodeignore` | minimatch (strict) | `*.log` only matches root; use `**/*.log` for recursive |

### Pattern Matching Comparison

| Pattern | .gitignore / .prettierignore | .vscodeignore |
|---------|------------------------------|---------------|
| `*.log` | `data.log`, `logs/error.log`, `src/debug.log` | `data.log` only (root level) |
| `**/*.log` | `data.log`, `logs/error.log`, `src/debug.log` | `logs/error.log`, `src/debug.log` (not root) |
| `node_modules/` | `node_modules/**` (blocks negations) | `node_modules/**` (negations work) |
| `!node_modules/lodash/**` | Blocked (parent ignored) | Works (removes from set) |
| `dist/*.js` | `dist/bundle.js` | `dist/bundle.js` |
| `build` | `build`, `src/build`, `lib/build/` | `build` only (root level) |
| `  *.tmp  ` | `*.tmp` (trims trailing spaces) | `*.tmp` (trims all whitespace) |

### Behaviour Differences

| Behaviour | .gitignore / .prettierignore | .vscodeignore |
|-----------|------------------------------|---------------|
| Whitespace trimming | Trailing spaces only | All leading and trailing |
| Simple patterns (`*.ext`) | Match at any depth (basename) | Match root level only |
| Directory patterns (`dir/`) | Block negations for contents | Auto-expand to `dir/**`, no blocking |
| Negations after `dir/` | Blocked for files inside | Always work |
| Trailing tabs | Preserved | Trimmed |

### Quick Reference

To match files **recursively** in `.vscodeignore`:
```
# .gitignore style (won't work in .vscodeignore)
*.log

# .vscodeignore style (use **/ prefix)
**/*.log
```

To **un-ignore** files in a directory:
```
# .gitignore - negation blocked after dir/
node_modules/
!node_modules/important/    # Won't work!

# .vscodeignore - negations always work
node_modules/
!node_modules/important/    # Works!
```

## How It Works

IgnoreLens tracks a cumulative set of ignored files, processing patterns in order:

1. Normal patterns add matching files to the set
2. Negation patterns (`!`) remove matching files from the set
3. For `.gitignore`: Directory patterns (`dir/`) block negations for files within
4. For `.vscodeignore`: Negations always work (no directory blocking)

[View flow diagram](docs/flow.md)

## Usage

1. Open any file with the `ignore` language type in VS Code
2. Patterns are automatically decorated based on their effect

To use with any file, change its language mode to `ignore` via the status bar or command palette (Ctrl+Shift+P → "Change Language Mode").

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `ignorelens.enabled` | Enable or disable decorations | `true` |
| `ignorelens.decorationStyle` | How to highlight redundant patterns: `none`, `background`, `text`, or `both` | `text` |
| `ignorelens.showMatchCount` | Show match counts after each pattern | `true` |
| `ignorelens.scanDebounceMs` | Delay before rescanning after changes (ms) | `500` |
| `ignorelens.debug` | Enable debug logging to Output panel | `false` |

### Customising Colours

Add to your `settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "ignorelens.noMatchForeground": "#f14c4c",
    "ignorelens.noMatchBackground": "#4a1a1a40",
    "ignorelens.matchCountForeground": "#6A9955",
    "ignorelens.negationForeground": "#CCAA00"
  }
}
```

## Supported Patterns

Standard gitignore syntax is supported:

| Pattern | Description |
|---------|-------------|
| `*` | Matches anything except `/` |
| `**` | Matches any path including `/` |
| `?` | Matches any single character |
| `!pattern` | Negation (un-ignore) |
| `dir/` | Directory pattern |
| `#` | Comment |

## Limitations

- **Empty directories are not detected.** Directories are discovered by scanning files, so patterns targeting empty directories will show zero matches even if the directory exists.

- **Hidden files are included in counts.** Files with the hidden attribute (Windows), hidden flag (macOS), or starting with `.` (Linux/Unix) are counted like regular files.

- **Negated character classes may not work correctly.** Patterns like `[^a].ts` or `[!a].ts` (matching any character except `a`) may not match as expected due to an upstream library limitation.

## Troubleshooting

If match counts aren't showing or the extension behaves unexpectedly, try uninstalling and reinstalling. VS Code can sometimes fail to fully load an updated extension.

## Acknowledgements

Developed with assistance from:
- [Claude Code](https://claude.ai/code) (Opus 4.5)
- [OpenAI Codex](https://openai.com/index/openai-codex/) (GPT-5.1-Codex-Max & GPT-5.2-Codex-Max)

Thanks to:
- [GitSparTV](https://github.com/GitSparTV) for identifying the cumulative set tracking issue.
- [RedCMD](https://github.com/RedCMD) for identifying the [a].ts wildcard and trailing tab issues.

## Licence

MIT License - Copyright (c) 2025 Jason Gordon

Free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
