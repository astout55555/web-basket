import type sql from 'mssql';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createBasket, findBasketByAddress } from './db/baskets-repo';
import { runMigrations } from './db/migrate';
import { connectPool, devDbConfig } from './db/pool';
import { startRetentionSweep } from './retention';

const TEST_DB = 'webbasket_retention_test';
const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations', import.meta.url));

let pool: sql.ConnectionPool;

beforeAll(async () => {
  const master = await connectPool({ ...devDbConfig(), database: 'master' });
  await master
    .request()
    .batch(
      `IF DB_ID('${TEST_DB}') IS NOT NULL BEGIN ALTER DATABASE [${TEST_DB}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [${TEST_DB}]; END; CREATE DATABASE [${TEST_DB}];`,
    );
  await master.close();
  pool = await connectPool({ ...devDbConfig(), database: TEST_DB });
  await runMigrations(pool, MIGRATIONS_DIR);
}, 60_000);

afterAll(async () => {
  await pool?.close();
});

const fakeLog = () => ({ info: vi.fn(), error: vi.fn() });

async function backdate(basketId: number, days: number) {
  await pool
    .request()
    .input('id', basketId)
    .input('days', days)
    .query(
      'UPDATE baskets SET last_activity_at = DATEADD(day, -@days, SYSUTCDATETIME()) WHERE id = @id',
    );
}

async function waitUntil(cond: () => Promise<boolean>, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error('condition not met in time');
}

describe('startRetentionSweep', () => {
  it('sweeps immediately on start and spares fresh baskets', async () => {
    const stale = await createBasket(pool);
    const fresh = await createBasket(pool);
    await backdate(stale.id, 10);

    const log = fakeLog();
    const stop = startRetentionSweep({ pool, ttlDays: 7, intervalMs: 3_600_000, log });
    try {
      await waitUntil(async () => (await findBasketByAddress(pool, stale.address)) === null);
      expect(await findBasketByAddress(pool, fresh.address)).not.toBeNull();
      expect(log.error).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('keeps sweeping on its interval', async () => {
    const log = fakeLog();
    const stop = startRetentionSweep({ pool, ttlDays: 7, intervalMs: 40, log });
    try {
      // Created (and backdated) AFTER the immediate boot sweep ran.
      await new Promise((r) => setTimeout(r, 60));
      const stale = await createBasket(pool);
      await backdate(stale.id, 10);
      await waitUntil(async () => (await findBasketByAddress(pool, stale.address)) === null);
    } finally {
      stop();
    }
  });

  it('stops sweeping after stop()', async () => {
    const log = fakeLog();
    const stop = startRetentionSweep({ pool, ttlDays: 7, intervalMs: 40, log });
    stop();

    const stale = await createBasket(pool);
    await backdate(stale.id, 10);
    await new Promise((r) => setTimeout(r, 150));
    expect(await findBasketByAddress(pool, stale.address)).not.toBeNull();
    // Clean up so later runs start from a consistent state.
    await pool.request().input('id', stale.id).query('DELETE FROM baskets WHERE id = @id');
  });

  it('logs sweep failures and keeps running instead of crashing', async () => {
    const doomed = await connectPool({ ...devDbConfig(), database: TEST_DB });
    await doomed.close();

    const log = fakeLog();
    const stop = startRetentionSweep({ pool: doomed, ttlDays: 7, intervalMs: 40, log });
    try {
      await waitUntil(async () => log.error.mock.calls.length >= 2);
    } finally {
      stop();
    }
  });
});
