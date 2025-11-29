# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Configurable decoration style setting (`ignorelens.decorationStyle`)
  - `none` - No visual decoration
  - `background` - Background colour only (default, existing behaviour)
  - `text` - Text colour only
  - `both` - Both background and text colour
- New theme colours for text decoration (`ignorelens.matchForeground`, `ignorelens.noMatchForeground`)
- Full colour customisation via VS Code's `workbench.colorCustomizations`

### Changed

### Deprecated

### Removed

### Fixed

### Security

## [0.1.0] - 29/11/2025

### Added
- Initial VS Code extension implementation
- Line decorations showing pattern match status (green for matches, red for no matches)
- Hover provider showing match count for each pattern
- Support for all gitignore pattern syntax (wildcards, negations, directories)
- Real-time updates when files are added or removed from workspace
- Configuration options for enabling/disabling and debounce delay
- Automatic activation for files with the `ignore` language type
- Unit tests for IgnoreParser and PatternMatcher classes
