import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { loadLocalEnv } from '../load-env.js';

const migrationDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../migrations',
);

export async function migrate(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migration (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const files = (await readdir(migrationDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    for (const file of files) {
      await client.query('BEGIN');
      try {
        await client.query('SELECT pg_advisory_xact_lock(771425801)');
        const applied = await client.query(
          'SELECT 1 FROM schema_migration WHERE name = $1',
          [file],
        );
        if (applied.rowCount === 0) {
          await client.query(
            await readFile(join(migrationDirectory, file), 'utf8'),
          );
          await client.query(
            'INSERT INTO schema_migration (name) VALUES ($1)',
            [file],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migração ${file}`, { cause: error });
      }
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  loadLocalEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL obrigatória');
  }
  await migrate(databaseUrl);
}
