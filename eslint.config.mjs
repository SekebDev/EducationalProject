import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.next-e2e/**',
      '**/.nodeterm/**',
      '**/test-results/**',
      '**/playwright-report/**',
      '**/.local-storage*/**',
      '**/coverage/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      complexity: ['error', 20],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'no-else-return': 'error',
      'no-unneeded-ternary': 'error',
    },
  },
);
