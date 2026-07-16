/**
 * Shared setup for the integration test suites: one place that knows how to
 * spin up an isolated test database and build a matching AppConfig. Each suite
 * passes a unique database name so vitest can run the files in parallel.
 */
import sql from 'mssql';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../config';
import { devDbConfig, loadConfig } from '../config';
import { runMigrations } from '../db/migrate';
import { connectPool } from '../db/pool';

export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

function assertSafeName(name: string): void {
  // The name is interpolated into DROP/CREATE DATABASE (which can't take a
  // parameter), so allow only a safe identifier.
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error(`unsafe test database name: ${name}`);
  }
}

/**
 * Drop and recreate `name`, run migrations, and return its pool. SINGLE_USER
 * WITH ROLLBACK IMMEDIATE forces out any lingering connection before the drop.
 * The caller closes the pool in afterAll.
 */
export async function setupTestDb(name: string): Promise<sql.ConnectionPool> {
  assertSafeName(name);
  const master = await connectPool({ ...devDbConfig(), database: 'master' });
  try {
    await master
      .request()
      .batch(
        `IF DB_ID('${name}') IS NOT NULL BEGIN ALTER DATABASE [${name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${name}]; END; CREATE DATABASE [${name}];`,
      );
  } finally {
    await master.close();
  }
  const pool = await connectPool({ ...devDbConfig(), database: name });
  await runMigrations(pool, MIGRATIONS_DIR);
  return pool;
}

/** An AppConfig pointing at the given test database, plus any overrides. */
export function testAppConfig(name: string, overrides: Partial<AppConfig> = {}): AppConfig {
  return { ...loadConfig({}), db: { ...devDbConfig(), database: name }, ...overrides };
}
