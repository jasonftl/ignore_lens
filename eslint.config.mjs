import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';

export default [
    eslint.configs.recommended,
    ...tseslint.configs['flat/recommended'],
];
