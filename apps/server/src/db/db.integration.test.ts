/**
 * Integration tests against the local SQL Server container
 * (docker compose -f docker-compose.dev.yml up -d --wait).
 *
 * Strategy: drop + recreate a dedicated `webbasket_test` database, run the
 * real migrations, then exercise the repositories against it.
 */
import { basketAddressSchema, requestRecordSchema } from '@web-basket/shared';
import sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateBasketAddress } from '../address';
import {
  createBasket,
  deleteBasket,
  deleteExpiredBaskets,
  findBasketByAddress,
} from './baskets-repo';
import { runMigrations } from './migrate';
import { connectPool, devDbConfig } from './pool';
import { insertRequest, listRequests, toRequestRecord } from './requests-repo';

const TEST_DB = 'webbasket_test';
const MIGRATIONS_DIR = new URL('../../migrations', import.meta.url).pathname;

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
  const applied = await runMigrations(pool, MIGRATIONS_DIR);
  expect(applied).toEqual(['001_init.sql']);
}, 60_000);

afterAll(async () => {
  await pool?.close();
});

describe('runMigrations', () => {
  it('is idempotent — a second run applies nothing', async () => {
    expect(await runMigrations(pool, MIGRATIONS_DIR)).toEqual([]);
  });
});

describe('baskets repository', () => {
  it('creates a basket with a valid address and finds it again', async () => {
    const created = await createBasket(pool);
    expect(basketAddressSchema.safeParse(created.address).success).toBe(true);

    const found = await findBasketByAddress(pool, created.address);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.createdAt).toBeInstanceOf(Date);
  });

  it('returns null for an unknown address', async () => {
    expect(await findBasketByAddress(pool, 'zzzzzzzzzzzz')).toBeNull();
  });

  it('retries on address collision', async () => {
    const existing = await createBasket(pool);
    let calls = 0;
    const stubGenerator = () => {
      calls++;
      return calls === 1 ? existing.address : generateBasketAddress();
    };
    const created = await createBasket(pool, stubGenerator);
    expect(calls).toBe(2);
    expect(created.address).not.toBe(existing.address);
  });

  it('deletes a basket (true) and reports a missing one (false)', async () => {
    const basket = await createBasket(pool);
    expect(await deleteBasket(pool, basket.address)).toBe(true);
    expect(await deleteBasket(pool, basket.address)).toBe(false);
  });
});

function sampleRequest(basketId: number, overrides: Record<string, unknown> = {}) {
  return {
    basketId,
    method: 'POST',
    path: '/whatever/hook',
    query: 'a=1',
    headers: { 'content-type': 'application/json', 'x-multi': ['a', 'b'] },
    body: Buffer.from('{"hello":"world"}'),
    bodySize: 17,
    truncated: false,
    contentType: 'application/json',
    remoteIp: '203.0.113.9',
    requestCap: 200,
    ...overrides,
  };
}

describe('requests repository', () => {
  it('inserts a request and returns a record matching the shared wire schema', async () => {
    const basket = await createBasket(pool);
    const stored = await insertRequest(pool, sampleRequest(basket.id));

    const record = toRequestRecord(stored);
    expect(requestRecordSchema.safeParse(record).success).toBe(true);
    expect(record.bodyBase64).toBe(Buffer.from('{"hello":"world"}').toString('base64'));
    expect(record.headers).toEqual({ 'content-type': 'application/json', 'x-multi': ['a', 'b'] });
  });

  it('stores a body-less request with null body', async () => {
    const basket = await createBasket(pool);
    const stored = await insertRequest(
      pool,
      sampleRequest(basket.id, { body: null, bodySize: 0, contentType: null, query: null }),
    );
    const record = toRequestRecord(stored);
    expect(record.bodyBase64).toBeNull();
    expect(record.query).toBeNull();
  });

  it('lists newest-first with a limit', async () => {
    const basket = await createBasket(pool);
    for (let i = 1; i <= 4; i++) {
      await insertRequest(pool, sampleRequest(basket.id, { path: `/n${i}` }));
    }
    const rows = await listRequests(pool, basket.id, 3);
    expect(rows.map((r) => r.path)).toEqual(['/n4', '/n3', '/n2']);
  });

  it('prunes to the per-basket cap (ring buffer)', async () => {
    const basket = await createBasket(pool);
    for (let i = 1; i <= 7; i++) {
      await insertRequest(pool, sampleRequest(basket.id, { path: `/n${i}`, requestCap: 5 }));
    }
    const rows = await listRequests(pool, basket.id, 100);
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.path)).toEqual(['/n7', '/n6', '/n5', '/n4', '/n3']);
  });

  it('bumps the basket last_activity_at on insert', async () => {
    const basket = await createBasket(pool);
    const before = (await findBasketByAddress(pool, basket.address))!.lastActivityAt;
    await new Promise((r) => setTimeout(r, 15));
    await insertRequest(pool, sampleRequest(basket.id));
    const after = (await findBasketByAddress(pool, basket.address))!.lastActivityAt;
    expect(after.getTime()).toBeGreaterThan(before.getTime());
  });

  it('cascade-deletes requests with their basket', async () => {
    const basket = await createBasket(pool);
    await insertRequest(pool, sampleRequest(basket.id));
    await deleteBasket(pool, basket.address);
    const orphanCount = await pool
      .request()
      .input('basketId', sql.BigInt, basket.id)
      .query('SELECT COUNT(*) AS n FROM requests WHERE basket_id = @basketId');
    expect(orphanCount.recordset[0].n).toBe(0);
  });
});

describe('deleteExpiredBaskets', () => {
  it('removes only baskets idle past the TTL', async () => {
    const stale = await createBasket(pool);
    const fresh = await createBasket(pool);
    await pool
      .request()
      .input('id', sql.BigInt, stale.id)
      .query(
        'UPDATE baskets SET last_activity_at = DATEADD(day, -10, SYSUTCDATETIME()) WHERE id = @id',
      );

    const deleted = await deleteExpiredBaskets(pool, 7);
    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(await findBasketByAddress(pool, stale.address)).toBeNull();
    expect(await findBasketByAddress(pool, fresh.address)).not.toBeNull();
  });
});
