# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 02/12/2025

### Added
- New `ignorelens.countMode` setting with two modes:
  - `basic` (default): Shows total files matching each pattern
  - `advanced`: Tracks a cumulative set where normal patterns add and negation patterns remove
- New theme colour `ignorelens.negationForeground` for negation pattern counts (yellow)
- Git-like directory traversal in advanced mode: negations cannot un-ignore files under ignored directories
- Directory blocking now applies to `dir/`, `dir/**`, and `dir/*` style patterns
- Negation directory patterns (`!dir/`) now remove directories from the blocked list
- Blocked negation display: shows all counts `(X removed; Y not in set; Z blocked by parent dir; set = W)` when applicable

### Changed
- Advanced mode display format shows full information:
  - Normal patterns: `(X added to set; Y already in set; set = Z)`
  - Negation patterns: `(X removed from set; Y not in set; set = Z)` or includes blocked count
- Advanced mode uses single cumulative set (negations actually remove files)
- Negation patterns always display in yellow, never marked redundant
- Normal patterns marked redundant when actionCount is 0 (matches nothing or all already in set)
- Workspace scanner now returns only files, not synthetic directory entries
- Extracted counting logic into separate module for testability

### Fixed
- Directory entries no longer inflate match counts
- Shadowed/duplicate patterns now correctly marked as redundant (red) in advanced mode
- countMode fallback now correctly defaults to 'basic' instead of 'total'
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
