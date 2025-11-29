# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
