import { spawn, spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = resolve(root, 'apps/api');
const tsx = resolve(apiRoot, 'node_modules/tsx/dist/cli.mjs');
const migration = spawnSync(
  process.execPath,
  [tsx, 'src/infrastructure/db/migrate.ts'],
  {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit',
  },
);
if (migration.status !== 0) {
  process.exit(migration.status ?? 1);
}
const children = [
  spawn(process.execPath, [tsx, 'src/main.ts'], {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit',
  }),
  spawn(process.execPath, [tsx, 'src/worker.ts'], {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit',
  }),
];

function stop() {
  for (const child of children) {
    child.kill();
  }
}

for (const child of children) {
  child.once('exit', (code) => {
    stop();
    process.exitCode = code ?? 1;
  });
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
