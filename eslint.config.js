// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'docs/generated/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The wrapper crosses a boundary into untyped CLI output; narrow casts
      // are checked by tests rather than forbidden outright.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
    },
  },
  {
    // `test()` from node:test returns a promise that is meant to be ignored.
    files: ['test/**/*.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },
  {
    // Type-level tests deliberately contain expected type errors.
    files: ['test/types/**/*.ts'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off', '@typescript-eslint/no-unsafe-call': 'off' },
  },
);
