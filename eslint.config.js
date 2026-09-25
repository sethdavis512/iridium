import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    {
        ignores: [
            'build/',
            'node_modules/',
            '.react-router/',
            'app/generated/',
            'playwright-report/',
            'test-results/',
            // Agent tooling: vendored skills, spec-kit scaffolding, and
            // nested git worktrees (full app copies on other branches).
            '.agents/',
            '.specify/',
            '.claude/worktrees/',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { 'react-hooks': reactHooks },
        rules: {
            ...reactHooks.configs.recommended.rules,
            // Relax rules that create noise in a boilerplate
            '@typescript-eslint/no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
        },
    },
    {
        // Playwright fixtures hand their value to the test via `use()`, which
        // the React hooks rule mistakes for React's `use` hook.
        files: ['tests/**'],
        rules: {
            'react-hooks/rules-of-hooks': 'off',
        },
    },
);
