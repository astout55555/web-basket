import { fileURLToPath } from 'node:url';
import { buildApp } from './app';
import { loadConfig } from './config';
import { runMigrations } from './db/migrate';
import { connectPool } from './db/pool';

const config = loadConfig();
const pool = await connectPool(config.db);

// Single instance, so migrating on boot is safe (no concurrent migrators).
const migrationsDir = fileURLToPath(new URL('../migrations', import.meta.url));
const applied = await runMigrations(pool, migrationsDir);

const app = buildApp({ config, pool }, { logger: true });
if (applied.length > 0) {
  app.log.info({ applied }, 'migrations applied');
}

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  await pool.close();
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, async () => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await pool.close();
    process.exit(0);
  });
}
