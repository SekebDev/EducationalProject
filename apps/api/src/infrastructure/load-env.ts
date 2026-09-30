import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootEnvFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../.env',
);

export function loadLocalEnv(): void {
  if (process.env.NODE_ENV !== 'production' && existsSync(rootEnvFile)) {
    process.loadEnvFile(rootEnvFile);
  }
}
