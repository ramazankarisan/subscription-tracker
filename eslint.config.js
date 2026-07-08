// Linter for src/: strict TypeScript, React, and no-abbreviation naming.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import unicorn from 'eslint-plugin-unicorn';

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'supabase/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      unicorn,
    },
    rules: {
      // --- React ---
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'warn',
      'react/no-danger': 'error',
      'react/self-closing-comp': 'error',
      'react/jsx-no-useless-fragment': 'error',

      // --- TypeScript (strict best practices) ---
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/array-type': ['error', { default: 'array-simple' }],
      '@typescript-eslint/ban-ts-comment': 'error',

      // --- General best practices ---
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-else-return': 'error',
      'object-shorthand': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // --- Naming: no frequent abbreviations ---
      'unicorn/name-replacements': [
        'error',
        {
          checkFilenames: false,
          // Allowed abbreviations.
          allowList: {
            props: true,
            Props: true,
            ref: true,
            Ref: true,
            params: true,
            args: true,
            env: true,
            db: true,
            fn: true,
            ctx: true,
            src: true,
            i: true,
            e2e: true,
          },
        },
      ],
      'unicorn/catch-error-name': 'error',
      'unicorn/prefer-node-protocol': 'error',
    },
  },
  {
    // Vitest globals (globals: true) so tests don't import describe/it/expect/vi.
    files: ['src/**/*.test.ts', 'src/test/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        vi: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
);
