import { cp, mkdir, chown } from 'node:fs/promises';
import process from 'node:process';

// Runs only in a disposable container. Its Linux dependencies remain in /app.
if (process.cwd() !== '/app') {
  throw new Error(
    'Execute em container descartável com working directory /app.',
  );
}
for (const path of [
  'apps/api/src',
  'apps/api/test',
  'apps/api/migrations',
  'apps/api/tsconfig.json',
  'apps/api/tsconfig.build.json',
  'apps/web/src',
  'apps/web/public',
  'apps/web/tsconfig.json',
  'apps/web/next.config.ts',
  'packages/contracts/src',
  'packages/contracts/package.json',
  'packages/contracts/tsconfig.json',
  'tests',
  'scripts',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  '.npmrc',
  'tsconfig.base.json',
  'vitest.config.ts',
  'eslint.config.mjs',
  '.prettierrc.json',
  '.prettierignore',
]) {
  await mkdir(`/app/${path.substring(0, path.lastIndexOf('/')) || '.'}`, {
    recursive: true,
  });
  await cp(`/workspace/${path}`, `/app/${path}`, {
    recursive: true,
    force: true,
  });
}
await mkdir('/app/test-results', { recursive: true });
await chown('/app/test-results', 1000, 1000);
process.stdout.write(`Fontes atuais copiadas; runtime ${process.version}.\n`);
