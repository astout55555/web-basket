/**
 * API tests: real Fastify app (via inject — no network port) against a real
 * SQL Server database, dedicated to this file so it can run in parallel with
 * the repo tests.
 */
import {
  basketAddressSchema,
  createBasketResponseSchema,
  listRequestsResponseSchema,
} from '@web-basket/shared';
import sql from 'mssql';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { AppConfig } from '../config';
import { loadConfig } from '../config';
import { runMigrations } from '../db/migrate';
import { connectPool, devDbConfig } from '../db/pool';
import { insertRequest } from '../db/requests-repo';

const TEST_DB = 'webbasket_api_test';
const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url));

let pool: sql.ConnectionPool;
let config: AppConfig;
let app: ReturnType<typeof buildApp>;

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

  config = { ...loadConfig({}), db: { ...devDbConfig(), database: TEST_DB } };
  app = buildApp({ config, pool });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await pool?.close();
});

async function createBasketViaApi(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/baskets' });
  expect(res.statusCode).toBe(201);
  return res.json().address as string;
}

describe('POST /api/baskets', () => {
  it('creates a basket and returns a valid address', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/baskets' });
    expect(res.statusCode).toBe(201);
    const body = createBasketResponseSchema.parse(res.json());
    expect(basketAddressSchema.safeParse(body.address).success).toBe(true);
  });

  it('is rate limited per IP', async () => {
    const limited = buildApp({
      config: { ...config, basketCreatePerMinute: 3 },
      pool,
    });
    await limited.ready();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 4; i++) {
        const res = await limited.inject({ method: 'POST', url: '/api/baskets' });
        codes.push(res.statusCode);
      }
      expect(codes).toEqual([201, 201, 201, 429]);
    } finally {
      await limited.close();
    }
  });
});

describe('GET /api/baskets/:address/requests', () => {
  it('returns an empty list for a fresh basket', async () => {
    const address = await createBasketViaApi();
    const res = await app.inject({ method: 'GET', url: `/api/baskets/${address}/requests` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ requests: [] });
  });

  it('returns stored requests newest-first, matching the shared schema', async () => {
    const address = await createBasketViaApi();
    const basketId = Number(
      (
        await pool
          .request()
          .input('address', sql.NVarChar(32), address)
          .query('SELECT id FROM baskets WHERE address = @address')
      ).recordset[0].id,
    );
    for (const path of ['/first', '/second']) {
      await insertRequest(pool, {
        basketId,
        method: 'POST',
        path,
        query: null,
        headers: { 'content-type': 'text/plain' },
        body: Buffer.from('hi'),
        bodySize: 2,
        truncated: false,
        contentType: 'text/plain',
        remoteIp: '127.0.0.1',
        requestCap: 200,
      });
    }

    const res = await app.inject({ method: 'GET', url: `/api/baskets/${address}/requests` });
    expect(res.statusCode).toBe(200);
    const body = listRequestsResponseSchema.parse(res.json());
    expect(body.requests.map((r) => r.path)).toEqual(['/second', '/first']);
  });

  it('rejects a malformed address with 400 (schema validation)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/baskets/short/requests' });
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 for a well-formed but unknown address', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/baskets/zzzzzzzzzzzz/requests',
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /api/baskets/:address', () => {
  it('deletes a basket, then 404s on repeat', async () => {
    const address = await createBasketViaApi();
    const first = await app.inject({ method: 'DELETE', url: `/api/baskets/${address}` });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({ method: 'DELETE', url: `/api/baskets/${address}` });
    expect(second.statusCode).toBe(404);
    const gone = await app.inject({ method: 'GET', url: `/api/baskets/${address}/requests` });
    expect(gone.statusCode).toBe(404);
  });
});

describe('app basics', () => {
  it('still serves the health check', async () => {
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
