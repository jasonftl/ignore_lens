# IgnoreLens Flow

How the extension components connect.

```mermaid
flowchart TD
    A[VS Code] -->|activates| B[extension.ts]
    B --> C

    subgraph " "
        C[WorkspaceScanner] --> D[DecorationProvider]
        N["Triggers on:<br>• file load<br>• workspace file change<br>• 'ignore' file edit"]
    end

    D -->|1. parses lines| E["IgnoreParser.parseLine()"]
    D -->|2. matches patterns| F["PatternMatcher.findMatches()"]
    D -->|3. applies| G["editor.setDecorations()"]
```

## Components

- **extension.ts** - Entry point, registers event handlers
- **WorkspaceScanner** - Scans workspace for files
- **DecorationProvider** - Manages line decorations and match counts
- **IgnoreParser** - Parses ignore file lines (patterns, comments, blanks)
- **PatternMatcher** - Checks patterns against workspace files
