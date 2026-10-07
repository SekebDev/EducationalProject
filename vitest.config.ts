import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          setupFiles: ['apps/api/test/setup.ts'],
          include: ['apps/**/*.spec.ts'],
          exclude: ['**/*.integration.spec.ts', '**/*.contract.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          setupFiles: ['apps/api/test/setup.ts'],
          include: ['apps/**/*.integration.spec.ts'],
        },
      },
      {
        test: {
          name: 'contract',
          setupFiles: ['apps/api/test/setup.ts'],
          include: [
            'tests/contract/**/*.spec.ts',
            'apps/**/*.contract.spec.ts',
          ],
        },
      },
    ],
  },
});
