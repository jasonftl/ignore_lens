// Date: 09/01/2026
// Centralised list of supported ignore file formats

/**
 * Gitignore-style files.
 * These use fnmatch with basename matching, directory blocking for negations,
 * and trailing space trimming only.
 * Handled by: GitignoreParser, GitignoreMatcher, GitignoreCountCalculator
 */
export const GITIGNORE_STYLE_FILES: readonly string[] = [
    '.gitignore',
    '.prettierignore',
    '.alexignore',
    '.bazelignore',
    '.cfignore',
    '.deployignore',
    '.distignore',
    '.ebignore',
    '.eleventyignore',
    '.eslintignore',
    '.flooignore',
    '.helmignore',
    '.jpmignore',
    '.jshintignore',
    '.markdownlintignore',
    '.nodemonignore',
    '.nuxtignore',
    '.slugignore',
    '.solhintignore',
    '.stylelintignore',
    '.stylintignore',
    '.swagger-codegen-ignore',
    '.terraformignore',
    '.tokeignore',
    '.upignore',
    '.vercelignore',
    '.yarnignore',
];

/**
 * Minimatch-style files.
 * These use strict glob matching, no basename matching (*.ext matches root only),
 * negations always work (no directory blocking), and all whitespace is trimmed.
 * Handled by: VscodeignoreParser, VscodeignoreMatcher, VscodeignoreCountCalculator
 */
export const MINIMATCH_STYLE_FILES: readonly string[] = [
    '.vscodeignore',
];

/**
 * All supported ignore file formats.
 */
export const ALL_SUPPORTED_FILES: readonly string[] = [
    ...GITIGNORE_STYLE_FILES,
    ...MINIMATCH_STYLE_FILES,
];
