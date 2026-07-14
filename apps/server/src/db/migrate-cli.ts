/**
 * CLI entry: pnpm db:migrate [--ensure-db]
 *
 * --ensure-db creates the database first if it is missing (local dev
 * convenience; Azure SQL databases are provisioned, not created by the app).
 */
import { runMigrations } from './migrate';
import { connectPool, devDbConfig } from './pool';

const migrationsDir = new URL('../../migrations', import.meta.url).pathname;
const config = devDbConfig();

if (process.argv.includes('--ensure-db')) {
  // CREATE DATABASE cannot take a parameter, so the name is interpolated —
  // guard it even though it comes from our own config.
  if (!/^[A-Za-z0-9_]+$/.test(config.database)) {
    throw new Error(`suspicious database name: ${config.database}`);
  }
  const master = await connectPool({ ...config, database: 'master' });
  await master
    .request()
    .batch(`IF DB_ID('${config.database}') IS NULL CREATE DATABASE [${config.database}]`);
  await master.close();
}

const pool = await connectPool(config);
try {
  const applied = await runMigrations(pool, migrationsDir);
  console.log(applied.length > 0 ? `applied: ${applied.join(', ')}` : 'schema already up to date');
} finally {
  await pool.close();
}
