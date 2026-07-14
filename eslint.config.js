import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'docs/**',
      'coverage/**',
      // Fixture files are test *data* (fake web build output), not code.
      'apps/server/test-fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
