# IgnoreLens

Highlights how many files each ignore line matches and flags those hitting zero for easy identification.

![IgnoreLens screenshot](images/screenshot.png)

## Features

- **Match Counts**: Shows the number of matched files after each pattern in italics, colour-coded to match the line.
- **Line Decorations**: Redundant patterns (that don't match any files) are highlighted in red.
- **Real-time Updates**: Decorations update automatically when you edit the file or when files are added/removed from the workspace.

## How It Works

[View flow diagram](docs/flow.md)

IgnoreLens works with any file that uses VS Code's `ignore` language type. It analyses each line and checks whether the pattern matches any files in your current workspace:

- **Red**: The pattern doesn't match any files (redundant)
- **No decoration**: Patterns that match files, comments, and blank lines

## Usage

1. Open any file with the `ignore` language type in VS Code
2. Patterns will automatically be decorated based on whether they match files

To use IgnoreLens with any file, change its language mode to `ignore` by clicking the language indicator in the status bar (bottom-right) or using the command palette (Ctrl+Shift+P → "Change Language Mode").

## Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `ignorelens.enabled` | Enable or disable IgnoreLens decorations | `true` |
| `ignorelens.decorationStyle` | How to highlight redundant patterns: `none`, `background`, `text`, or `both` | `text` |
| `ignorelens.showMatchCount` | Show the number of matched files after each pattern | `true` |
| `ignorelens.countMode` | How to count matches: `basic` or `advanced` | `basic` |
| `ignorelens.scanDebounceMs` | Debounce delay in milliseconds before rescanning | `500` |
| `ignorelens.debug` | Enable debug logging to the Output panel | `false` |

### Decoration Styles

- **none** - No visual decoration
- **background** - Coloured background on the line
- **text** - Coloured text (default)
- **both** - Both background and text colour

### Count Modes

- **basic** (default) - Shows the total number of files each pattern matches, evaluated independently
- **advanced** - Tracks a cumulative set where patterns add files and negations remove them. Implements Git-like directory traversal where negations cannot un-ignore files under ignored directories (applies to `dir/`, `dir/**`, and `dir/*` patterns). Shows `(X added to set; Y already in set; set = Z)` for normal patterns and `(X removed from set; Y not in set; set = Z)` for negations, or includes blocked count when applicable. Patterns that add nothing new (all matches already in set) are marked redundant

### Customising Colours

You can customise the colours in your `settings.json`:

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

Colours use hex format: `#RRGGBB` or `#RRGGBBAA` (with alpha for transparency). For example, `#4a1a1a40` is dark red at 25% opacity.

## Supported Patterns

IgnoreLens supports standard ignore file pattern syntax:

- `*` - Matches anything except path separators
- `**` - Matches any path including separators
- `?` - Matches any single character
- `!` - Negation patterns
- `/` - Directory anchoring
- `#` - Comments

## Troubleshooting

If match counts aren't showing, settings are missing, or the extension behaves unexpectedly, try uninstalling and reinstalling. VS Code can sometimes get into a state where an updated extension doesn't fully load. A clean reinstall usually fixes it.

## Limitations

**Empty directories are not detected.** Directories are discovered by scanning files, so patterns targeting empty directories (e.g., `empty-folder/`) will always show zero matches even if the directory exists.

**Basic mode evaluates patterns independently.** In the default `basic` count mode, each pattern is evaluated against all workspace files without considering rule order. Use `advanced` mode for cumulative tracking where you can see new matches versus previously matched files.

## Acknowledgements

This project was developed with assistance from:
- [Claude Code](https://claude.ai/code) (Opus 4.5)
- [OpenAI Codex](https://openai.com/index/openai-codex/) (GPT-5.1-Codex-Max)

## Licence

MIT License - Copyright (c) 2025 Jason Gordon

Free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
