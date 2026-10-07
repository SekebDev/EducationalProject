export default {
  root: '/app',
  cacheDir: '/scratch/vite',
  test: {
    include: ['apps/api/test/security-regressions.spec.ts', 'apps/api/test/materials/extract.spec.ts'],
    pool: 'forks', maxWorkers: 1, minWorkers: 1,
    testTimeout: 15_000,
  },
};
