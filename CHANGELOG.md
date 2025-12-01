# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
