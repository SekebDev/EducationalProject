import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['apps/**/*.spec.ts'],
          exclude: ['**/*.integration.spec.ts', '**/*.contract.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['apps/**/*.integration.spec.ts'],
        },
      },
      {
        test: {
          name: 'contract',
          include: [
            'tests/contract/**/*.spec.ts',
            'apps/**/*.contract.spec.ts',
          ],
        },
      },
    ],
  },
});
