import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const toolkit = {
  group: ['@wearables-ui-toolkit/*'],
  message: 'Only apps/web/src/hud/<display>/ may depend on a display toolkit: keep the rest HUD-agnostic.',
};
const react = {
  group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
  message: 'packages/shared stays framework-free.',
};

export default defineConfig([
  globalIgnores(['**/node_modules/**', '**/dist/**', 'docs/**']),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    // node:test's describe/it return promises the runner awaits itself.
    files: ['**/test/**/*.ts'],
    rules: { '@typescript-eslint/no-floating-promises': 'off' },
  },
  // Architecture boundaries.
  {
    files: ['packages/shared/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { patterns: [toolkit, react] }] },
  },
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/hud/**'],
    rules: { 'no-restricted-imports': ['error', { patterns: [toolkit] }] },
  },
]);
