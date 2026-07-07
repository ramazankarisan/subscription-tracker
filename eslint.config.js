// Secondary linter: ONE job only — enforce readable, non-abbreviated identifiers
// (unicorn/name-replacements, formerly prevent-abbreviations), which oxlint does
// not implement. oxlint owns every other lint rule; keep this file scoped to
// naming so the two never overlap.
import tseslint from 'typescript-eslint';
import unicorn from 'eslint-plugin-unicorn';

export default [
  {
    ignores: ['dist', 'dev-dist', 'supabase/**', 'scripts/**', '*.config.*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    // Ignore inline eslint-disable comments: this single-rule pass shares files
    // with oxlint, whose disable directives (e.g. react-refresh/*) would
    // otherwise error here as "rule not found". Local exceptions go in allowList.
    linterOptions: { noInlineConfig: true },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { unicorn },
    rules: {
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
    },
  },
];
