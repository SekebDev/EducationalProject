import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';
import { loadLocalEnv } from './apps/api/src/infrastructure/load-env';

loadLocalEnv();
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL obrigatório para os testes E2E');
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  // CI compiles routes on first visit and runs axe on shared runners.
  timeout: process.env.CI ? 90_000 : 30_000,
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3100',
    ...devices['Desktop Chrome'],
    channel: 'msedge',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `"${process.execPath}" "${resolve('scripts/e2e-api.mjs')}"`,
      url: 'http://127.0.0.1:3101/api/v1/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        DATABASE_URL: testDatabaseUrl,
        API_PORT: '3101',
        APP_ORIGIN: 'http://localhost:3100',
        AI_PROVIDER: 'fake',
        STORAGE_LOCAL_PATH: '.local-storage-e2e',
      },
    },
    {
      command: `"${process.execPath}" "${resolve('apps/web/node_modules/next/dist/bin/next')}" dev --hostname 127.0.0.1 --port 3100`,
      cwd: resolve('apps/web'),
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        API_INTERNAL_ORIGIN: 'http://127.0.0.1:3101',
        NEXT_DIST_DIR: '.next-e2e',
      },
    },
  ],
});
