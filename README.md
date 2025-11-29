# IgnoreLens

A VS Code extension that provides visual feedback for ignore file patterns - see which patterns match files in your workspace.

## Features

- **Line Decorations**: Redundant patterns (that don't match any files) are highlighted in red.
- **Real-time Updates**: Decorations update automatically when you edit the file or when files are added/removed from the workspace.

## How It Works

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
| `ignorelens.scanDebounceMs` | Debounce delay in milliseconds before rescanning | `500` |

### Decoration Styles

- **none** - No visual decoration
- **background** - Coloured background on the line
- **text** - Coloured text (default)
- **both** - Both background and text colour

### Customising Colours

You can customise the colours in your `settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "ignorelens.noMatchForeground": "#f14c4c",
    "ignorelens.noMatchBackground": "#4a1a1a40"
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

## Development

### Setup

```bash
npm install
npm run compile
```

### Running the Extension

Press `F5` in VS Code to launch the Extension Development Host.

### Running Tests

```bash
npm test
```

## Licence

MIT License - Copyright (c) 2025 Jason Gordon

Free to use, modify, and distribute. See [LICENSE](LICENSE) for details.
