# IgnoreLens Flow

How the extension components connect.

```mermaid
flowchart TD
    A[VS Code] -->|activates| B[extension.ts]
    B --> C

    subgraph " "
        C[WorkspaceScanner] --> D[DecorationProvider]
        K[DecorationCache]
        N["Triggers on:<br>• file load<br>• workspace file change<br>• 'ignore' file edit"]
    end


    D -->|1. parses lines| E["getParser().parseLine()"]
    D -->|2. matches patterns| F["getMatcher().findMatches()"]
    D -->|3. calculates counts| H["getCountCalculator().calculateCount()"]
    D -->|4. applies| G["editor.setDecorations()"]
```

## Components

- **extension.ts** - Entry point, registers event handlers
- **WorkspaceScanner** - Scans workspace for files
- **DecorationProvider** - Manages line decorations and match counts
- **decorationCache.ts** - Caches decoration data for instant display on tab switch
- **parserStrategy.ts** - Strategy pattern for parsing (GitignoreParser, VscodeignoreParser; prettierignore uses GitignoreParser)
- **matcherStrategy.ts** - Strategy pattern for matching (GitignoreMatcher, VscodeignoreMatcher; prettierignore uses GitignoreMatcher)
- **countStrategy.ts** - Strategy pattern for count calculation (GitignoreCountCalculator, VscodeignoreCountCalculator; prettierignore uses GitignoreCountCalculator)
