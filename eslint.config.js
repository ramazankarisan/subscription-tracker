// Single linter for the whole project. Replaces oxlint: ESLint is the only
// linter that can enforce every rule we want in ONE pass — strict TypeScript,
// React best practices, `curly`, AND no-abbreviation naming
// (unicorn/name-replacements, which neither oxlint nor biome implements).
//
// Scoped to `src/`. The Deno `supabase/**` bundle is a separate runtime and is
// excluded (like it is from knip). Copy-paste detection is a separate tool
// (jscpd), not a lint rule.
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
          // Domain/React terms that are clearer abbreviated than expanded.
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
);
