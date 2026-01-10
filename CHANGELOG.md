# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Support for `.npmignore` files (uses minimatch semantics like .vscodeignore)
- Support for `.p4ignore` files (Perforce - uses minimatch semantics)
- Support for `.bzrignore` files (Bazaar - glob without negation)
- Support for `.chefignore` files (Chef - glob without negation)
- Support for `.tfignore` files (Team Foundation - gitignore matching with `\` root anchor)
- Support for `.dockerignore` files (Docker - minimatch with leading/trailing `/` stripped)
- Support for `.gcloudignore` files (Google Cloud - minimatch semantics)
- Support for `.cvsignore` files (CVS - simple glob patterns, no comments, no negation)

### Changed
- Reorganised README Supported Files section:
  - Split into Gitignore-Compliant Formats (27) and Other Supported Formats (9) tables
  - Added category groupings (Version Control, Linters, Cloud & Deployment, etc.)
  - Added descriptive docs links for all 36 formats
  - Converted gitignore rules description to bullet list
  - Shortened verbose notes in Other Formats table
- Improved README readability:
  - Converted symbol table from 3-column-pair to clean 2-column format
  - Added inline comments to colour customisation JSON
  - Fixed minor wording issues

## [0.8.1] - 09/01/2026

### Added
- Support for 25 additional gitignore-style ignore files (28 total):
  - Linters: `.eslintignore`, `.stylelintignore`, `.markdownlintignore`, `.jshintignore`, `.alexignore`, `.solhintignore`, `.stylintignore`
  - Build tools: `.bazelignore`, `.helmignore`, `.swagger-codegen-ignore`
  - Cloud platforms: `.cfignore`, `.ebignore`, `.slugignore`, `.vercelignore`, `.terraformignore`, `.upignore`
  - Package managers: `.yarnignore`
  - Frameworks: `.nuxtignore`, `.eleventyignore`, `.nodemonignore`
  - Other: `.deployignore`, `.distignore`, `.flooignore`, `.jpmignore`, `.tokeignore`
- Centralised supported file list in `src/supportedFiles.ts`

### Changed
- Simplified `IgnoreFileType` to 2 semantic types: `'gitignore'` and `'vscodeignore'`

## [0.8.0] - 08/01/2026

### Changed
- Refactored `updateDecorations` into focused helper methods:
  - `collectLineData()` - first pass collecting pattern data and counts
  - `buildDecorationsFromLineData()` - builds decorations from line data
- Consolidated duplicate decoration construction logic between `updateDecorations` and `applyDecorationsFromData`
- Centralised supported ignore-file detection (single `isSupportedIgnoreFile` method)
- Use `LineDecorationData` interface instead of inline type definition

### Fixed
- Potential RangeError in padding calculation when document grows after cache creation

### Removed
- Unused `getAllFiles` method and associated cache fields from WorkspaceScanner

## [0.7.1] - 07/01/2026

### Fixed
- Stale colours no longer appear black on extension update (uses inline hex defaults, respects user customisations)

## [0.7.0] - 06/01/2026

### Added
- Instant cached decorations on tab switch with stale indicator
  - When switching to an ignore file, cached data displays immediately in darker colours
  - Background refresh runs and swaps to normal colours when complete
  - Eliminates perceived delay on tab switch for large workspaces
- New theme colours for stale/cached state:
  - `ignorelens.staleMatchCountForeground` (darker green)
  - `ignorelens.staleNoMatchForeground` (darker red)
  - `ignorelens.staleNoMatchBackground` (darker red background)
  - `ignorelens.staleNegationForeground` (darker yellow)

### Fixed
- Stale decorations now cleared when disabling IgnoreLens via settings (ISSUE-M013)
- Decorations now cleared for ignore files outside a workspace folder (ISSUE-L010)
- Escaped wildcards no longer bypass minimatch fallback for character class patterns (ISSUE-L013)
- Cache now only updated after confirming update is current, preventing stale data overwrites (ISSUE-M014)

## [0.6.1] - 05/01/2026

### Fixed
- Documentation: `**/*.log` pattern now correctly shown as matching root-level files for .vscodeignore (ISSUE-L009)

## [0.6.0] - 05/01/2026

### Added
- Support for `.prettierignore` files (uses same semantics as .gitignore)

### Changed
- Consolidated duplicate parser, matcher, and count calculator modules (ISSUE-M010)
  - Removed legacy `ignoreParser.ts`, `patternMatcher.ts`, `countCalculator.ts`
  - Tests now directly cover production strategy classes
  - Renamed test files for consistency (`gitignoreParser.test.ts`, etc.)

### Fixed
- Anchored character class patterns with subpaths now match correctly (ISSUE-M012)
  - `/[ab]/file.txt` now matches `a/file.txt` and `b/file.txt`
  - Simple anchored patterns like `/[ab].txt` still match root-level only
- Negated character classes with wildcards now match correctly (ISSUE-M013)
  - `[^a]*.ts` now correctly matches files not starting with `a`
  - `**/[!a].ts` now works as expected
  - Previously these patterns produced inverted results due to upstream `ignore` library bug

## [0.5.0] - 05/01/2026

### Added
- Support for `.vscodeignore` files with accurate vsce semantics
  - Uses minimatch pattern matching (no recursive basename matching)
  - `*.log` only matches root level; use `**/*.log` for recursive
  - Auto-expands `folder/` to `folder/**`
  - Trims all leading and trailing whitespace (unlike gitignore)
  - No directory blocking for negations (negations always work)
- Strategy pattern architecture for extensible ignore file support
- 40 new tests for vscodeignore parsing, matching, counting, and bug fixes

### Fixed
- Character class directory patterns (`[ab]/`) now treated as wildcards (ISSUE-M007)
  - Previously stored as literal prefix, blocking negations incorrectly
  - Now correctly skipped so negations for `a/` or `b/` files work
- UTF-8 BOM is now stripped from ignore files (ISSUE-M008)
  - Files saved with BOM on Windows would have first pattern fail to match
  - BOM is now detected and removed before parsing in all parsers
- Anchored character class patterns (`/[ab].txt`) now match correctly (ISSUE-M009)
  - Previously leading `/` was passed to minimatch literally, failing to match
  - Now stripped and only root-level files are matched

## [0.4.7] - 04/01/2026

### Fixed
- Fixed missing minimatch dependency in published extension
  - Added minimatch and its dependencies to .vscodeignore whitelist

## [0.4.6] - 04/01/2026

### Added
- Character class patterns without wildcards now match correctly
  - e.g., `[a].ts` now matches `a.ts` (uses minimatch fallback)
  - Supports ranges like `[a-z].txt` and sets like `[abc].js`

### Fixed
- Escaped `\!` and `\#` patterns now work correctly
  - `\!important.txt` matches literal `!important.txt` (not treated as negation)
  - `\#readme.txt` matches literal `#readme.txt` (not treated as comment)

## [0.4.5] - 04/01/2026

### Fixed
- Trailing tabs are now preserved in patterns (gitignore spec compliance)
  - Previously `file\t` was incorrectly trimmed to `file`
  - gitignore only trims trailing spaces, not tabs
- Nested directory patterns now correctly block only their subtree
  - Previously `src/vendor/` stored `src/` blocking all of `src/`
  - Now correctly stores `src/vendor/` blocking only `src/vendor/*`
- Anchored directory patterns (`/dist/`) now work correctly with negations
  - Leading `/` is now normalised when storing and deleting from ignoredDirs
  - `!/dist/` now correctly clears the block set by `/dist/`
- Escaped directory patterns (`\[temp\]/`) now correctly block negations
  - Backslash escapes are stripped when storing in ignoredDirs
  - `\[temp\]/` blocks `!\[temp\]/*.tmp` as expected
- Escaped wildcards (`dir\*/`) now treated as literal characters
  - Previously detected as glob patterns and didn't block negations
  - Now correctly recognised as directory pattern for literal `dir*` folder
- Escaped directories in `/**` and `/*` negations now work correctly
  - `!\[temp\]/**` now clears `[temp]/` from blocked directories
- Fixed `showMatchCount` setting description (said "before" but renders after)

## [0.4.4] - 16/12/2025

### Added
- Documented hidden files limitation in README

## [0.4.3] - 04/12/2025

### Fixed
- `dir/**/` patterns with trailing slash no longer block negations
  - e.g., `node_modules/**/` then `!node_modules/ignore/` now works correctly

## [0.4.2] - 02/12/2025

### Changed
- Match counts now use compact three-column display with Unicode symbols:
  - `+N` added, `−N` removed, `(N)` set size, `≡N` already in set, `∅N` not in set, `✗N` blocked
  - Columns are justified for alignment across all lines
  - Zero counts are hidden for cleaner display
- Shadowed patterns (`+0` with files already in set) now display in yellow instead of red
- Shadowed patterns no longer have red line decoration (only truly redundant patterns)
- Debug output timing format changed from "X in Yms" to "X (Yms)"

### Fixed
- Debug output now shows accurate counts matching the overlay (removed ~ approximation)
- Debug summary includes total files, ignored count, shadowed, not in set, and blocked counts
- `dir/*` and `dir/**` patterns no longer block negations (only explicit `dir/` should block)
  - Per Git docs: `dir/` ignores the directory itself (blocks negations)
  - `dir/*` and `dir/**` only ignore contents (Git still traverses, negations work)
- Negation patterns now work with directory names containing glob metacharacters (`*`, `?`, `[`, `]`)
  - e.g., `[tmp]/` then `![tmp]/**` now correctly clears the blocked directory

### Removed
- Removed `ignorelens.countMode` setting - cumulative set tracking is now the only mode
- Removed dead code: `calculateBasicCount` function and `BasicCountResult` interface

## [0.4.0] - 02/12/2025

### Added
- New theme colour `ignorelens.negationForeground` for negation pattern counts (yellow)
- Git-like directory traversal: negations cannot un-ignore files under ignored directories
- Directory blocking applies only to explicit `dir/` patterns (per Git documentation)
- Negation directory patterns (`!dir/`, `!dir/**`, `!dir/*`) remove directories from the blocked list
- Blocked negation tracking: shows `✗N` when negations are blocked by parent directories

### Changed
- Cumulative set tracking where normal patterns add and negation patterns remove files
- Negation patterns always display in yellow, never marked redundant
- Normal patterns marked redundant when actionCount is 0 (matches nothing or all already in set)
- Workspace scanner now returns only files, not synthetic directory entries
- Extracted counting logic into separate module for testability

### Fixed
- Directory entries no longer inflate match counts
- Shadowed/duplicate patterns now correctly marked as redundant (red)
- Trailing whitespace parsing now handles multiple escaped spaces correctly
- Negating an empty directory now correctly removes it from ignoredDirs
- Negation glob patterns (`!dir/**`, `!dir/*`) now correctly clear ignoredDirs

### Tests
- Added 27 new tests for counting logic, directory blocking, and trailing whitespace

## [0.3.0] - 01/12/2025

### Added
- Debug logging feature: new `ignorelens.debug` setting to enable logging to the Output panel
- Logs include workspace scan timing, pattern matching timing, cache hits/misses, and trigger events
- Debug summary showing approximate matched/unmatched path counts per ignore file
- Useful for troubleshooting performance or unexpected behaviour

### Fixed
- Workspace scanner now correctly includes `node_modules`, `.git`, and other normally-excluded folders
- Race condition where stale decoration updates could overwrite newer results
- Negation patterns now correctly reduce the matched count in debug summary

### Changed
- Documented empty directory limitation in README

## [0.2.2] - 30/11/2025

### Added
- Screenshot added to README

### Changed
- Updated extension description for clarity
- Reordered Features section to lead with Match Counts

## [0.2.1] - 29/11/2025

### Changed
- First pattern now shows descriptive label: `(5 matches)` instead of just `(5)`
- Subsequent patterns continue to show just the number for cleaner display

## [0.2.0] - 29/11/2025

### Added
- Match count display: shows the number of matched files after each pattern in italics
- Counts are colour-coded: red for 0 matches, green for 1+ matches
- New setting `ignorelens.showMatchCount` to enable/disable match count display (default: on)
- New theme colour `ignorelens.matchCountForeground` for customising match count colour

## [0.1.4] - 29/11/2025

### Fixed
- Consistent naming: changed "Ignore Lens" to "IgnoreLens" throughout codebase

## [0.1.3] - 29/11/2025

### Changed
- Updated README description to match extension

## [0.1.2] - 29/11/2025

### Changed
- Improved extension description for clarity

## [0.1.1] - 29/11/2025

### Fixed
- Bundled runtime dependency (`ignore` package) which was missing from published extension

## [0.1.0] - 29/11/2025

### Added
- Initial VS Code extension implementation
- Line decorations highlighting redundant patterns (patterns that don't match any files) in red
- Configurable decoration style (`ignorelens.decorationStyle`): none, background, text (default), or both
- Colour customisation via VS Code's `workbench.colorCustomizations`
- Support for all gitignore pattern syntax (wildcards, negations, directories)
- Real-time updates when editing or when files are added/removed from workspace
- Updates when changing a file's language mode to `ignore`
- Configuration options for enabling/disabling and debounce delay
- Automatic activation for files with the `ignore` language type
- MIT License
