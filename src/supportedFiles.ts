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
    '.aiderignore',
    '.aiexclude',
    '.aiignore',
    '.alexignore',
    '.augmentignore',
    '.bazelignore',
    '.cfignore',
    '.clineignore',
    '.codeiumignore',
    '.cursorignore',
    '.deployignore',
    '.distignore',
    '.ebignore',
    '.eleventyignore',
    '.eslintignore',
    '.flooignore',
    '.geminiignore',
    '.helmignore',
    '.ignore',
    '.jpmignore',
    '.jshintignore',
    '.markdownlintignore',
    '.nodemonignore',
    '.nuxtignore',
    '.rgignore',
    '.slugignore',
    '.solhintignore',
    '.stylelintignore',
    '.stylintignore',
    '.swagger-codegen-ignore',
    '.tabnineignore',
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
    '.gcloudignore',
    '.npmignore',
    '.p4ignore',
    '.vscodeignore',
];

/**
 * Glob-style files without negation support.
 * These use strict glob matching like minimatch, but do not support negation patterns.
 * Lines starting with ! are treated as literal patterns (matching files starting with !).
 * Handled by: GlobNoNegationParser, VscodeignoreMatcher, VscodeignoreCountCalculator
 */
export const GLOB_NO_NEGATION_FILES: readonly string[] = [
    '.bzrignore',
    '.chefignore',
];

/**
 * Tfignore-style files.
 * These use gitignore-style basename matching but with \ as the root anchor instead of /.
 * Patterns are recursive by default (like gitignore), but no directory blocking.
 * Handled by: TfignoreParser, GitignoreMatcher, VscodeignoreCountCalculator
 */
export const TFIGNORE_STYLE_FILES: readonly string[] = [
    '.tfignore',
];

/**
 * Dockerignore-style files.
 * These use minimatch-style matching (*.ext matches root only) but strip leading
 * and trailing slashes from patterns. Negations always work (no directory blocking).
 * Handled by: DockerignoreParser, VscodeignoreMatcher, VscodeignoreCountCalculator
 */
export const DOCKERIGNORE_STYLE_FILES: readonly string[] = [
    '.dockerignore',
];

/**
 * Cvsignore-style files.
 * These use simple glob matching (root only), no # comments, no negation.
 * The ! alone clears the list (skipped for IgnoreLens), # is literal.
 * Handled by: CvsignoreParser, VscodeignoreMatcher, VscodeignoreCountCalculator
 */
export const CVSIGNORE_STYLE_FILES: readonly string[] = [
    '.cvsignore',
];

/**
 * All supported ignore file formats.
 */
export const ALL_SUPPORTED_FILES: readonly string[] = [
    ...GITIGNORE_STYLE_FILES,
    ...MINIMATCH_STYLE_FILES,
    ...GLOB_NO_NEGATION_FILES,
    ...TFIGNORE_STYLE_FILES,
    ...DOCKERIGNORE_STYLE_FILES,
    ...CVSIGNORE_STYLE_FILES,
];
