/**
 * Sink + routing precedence tests (spec §7.2/§7.3/§9). Static assets come
 * from test-fixtures/web-dist so SPA-fallback behavior is testable without a
 * real frontend build.
 */
import { listRequestsResponseSchema } from '@web-basket/shared';
import type sql from 'mssql';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import type { AppConfig } from '../config';
import { setupTestDb, testAppConfig } from '../test/db';

const TEST_DB = 'webbasket_sink_test';
const FIXTURE_DIST = fileURLToPath(new URL('../../test-fixtures/web-dist', import.meta.url));

let pool: sql.ConnectionPool;
let config: AppConfig;
let app: ReturnType<typeof buildApp>;

beforeAll(async () => {
  pool = await setupTestDb(TEST_DB);
  config = testAppConfig(TEST_DB, {
    webDistDir: FIXTURE_DIST,
    // This suite creates a basket per test; don't trip the creation limit
    // (rate limiting has its own dedicated test in the API suite).
    basketCreatePerMinute: 1000,
  });
  app = buildApp({ config, pool });
  await app.ready();
}, 60_000);

afterAll(async () => {
  await app?.close();
  await pool?.close();
});

async function createBasket(): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/baskets' });
  expect(res.statusCode).toBe(201);
  return res.json().address as string;
}

async function fetchRecords(address: string) {
  const res = await app.inject({ method: 'GET', url: `/api/baskets/${address}/requests` });
  expect(res.statusCode).toBe(200);
  return listRequestsResponseSchema.parse(res.json()).requests;
}

describe('the sink records requests', () => {
  it('captures a JSON POST: method, path, headers, body, content-type, ip', async () => {
    const address = await createBasket();
    const res = await app.inject({
      method: 'POST',
      url: `/${address}`,
      headers: { 'content-type': 'application/json', 'x-github-event': 'push' },
      payload: '{"zen":"Design for failure."}',
    });
    expect(res.statusCode).toBe(204);

    const [rec] = await fetchRecords(address);
    expect(rec).toBeDefined();
    expect(rec!.method).toBe('POST');
    expect(rec!.path).toBe(`/${address}`);
    expect(rec!.query).toBeNull();
    expect(rec!.contentType).toBe('application/json');
    expect(rec!.headers['x-github-event']).toBe('push');
    expect(rec!.remoteIp).toBe('127.0.0.1');
    expect(Buffer.from(rec!.bodyBase64!, 'base64').toString()).toBe(
      '{"zen":"Design for failure."}',
    );
    expect(rec!.truncated).toBe(false);
    expect(rec!.bodySize).toBe(29);
  });

  it('captures sub-paths and query strings', async () => {
    const address = await createBasket();
    await app.inject({ method: 'PUT', url: `/${address}/hooks/github?x=1&y=2`, payload: 'p' });
    const [rec] = await fetchRecords(address);
    expect(rec!.path).toBe(`/${address}/hooks/github`);
    expect(rec!.query).toBe('x=1&y=2');
    expect(rec!.method).toBe('PUT');
  });

  it('stores malformed JSON raw instead of rejecting it (encapsulated parser)', async () => {
    const address = await createBasket();
    const res = await app.inject({
      method: 'POST',
      url: `/${address}`,
      headers: { 'content-type': 'application/json' },
      payload: '{not json at all',
    });
    expect(res.statusCode).toBe(204);
    const [rec] = await fetchRecords(address);
    expect(Buffer.from(rec!.bodyBase64!, 'base64').toString()).toBe('{not json at all');
  });

  it('stores binary bodies byte-for-byte', async () => {
    const address = await createBasket();
    const bytes = Buffer.from([0x00, 0x01, 0xff, 0xfe, 0x7f]);
    await app.inject({
      method: 'POST',
      url: `/${address}`,
      headers: { 'content-type': 'application/octet-stream' },
      payload: bytes,
    });
    const [rec] = await fetchRecords(address);
    expect(Buffer.from(rec!.bodyBase64!, 'base64')).toEqual(bytes);
    expect(rec!.contentType).toBe('application/octet-stream');
  });

  it('truncates oversized bodies, keeping received size and setting the flag', async () => {
    const tiny = buildApp({ config: { ...config, bodyMaxBytes: 16 }, pool });
    await tiny.ready();
    try {
      const address = await createBasket();
      const res = await tiny.inject({
        method: 'POST',
        url: `/${address}`,
        headers: { 'content-type': 'text/plain' },
        payload: 'A'.repeat(100),
      });
      expect(res.statusCode).toBe(204);
      const [rec] = await fetchRecords(address);
      expect(rec!.truncated).toBe(true);
      expect(rec!.bodySize).toBe(100);
      expect(Buffer.from(rec!.bodyBase64!, 'base64').toString()).toBe('A'.repeat(16));
    } finally {
      await tiny.close();
    }
  });

  it('records a plain browser-style GET (spec: a GET to a sink URL is a real request)', async () => {
    const address = await createBasket();
    const res = await app.inject({ method: 'GET', url: `/${address}` });
    expect(res.statusCode).toBe(204);
    const [rec] = await fetchRecords(address);
    expect(rec!.method).toBe('GET');
    expect(rec!.bodyBase64).toBeNull();
    expect(rec!.bodySize).toBe(0);
  });

  it('records OPTIONS requests', async () => {
    const address = await createBasket();
    const res = await app.inject({ method: 'OPTIONS', url: `/${address}` });
    expect(res.statusCode).toBe(204);
    const [rec] = await fetchRecords(address);
    expect(rec!.method).toBe('OPTIONS');
  });
});

describe('routing precedence (spec §7.3)', () => {
  it('/api and /healthz win over the sink', async () => {
    expect((await app.inject({ method: 'GET', url: '/healthz' })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/baskets' })).statusCode).toBe(201);
  });

  it('serves real static assets', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('fixture asset');
  });

  it('serves index.html at the root', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('fixture index');
  });

  it('falls back to the SPA for browser navigations to client routes', async () => {
    const address = await createBasket();
    const res = await app.inject({
      method: 'GET',
      url: `/b/${address}`,
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('fixture index');
  });

  it('falls back to the SPA for a well-formed but deleted/unknown address in a browser', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/zzzzzzzzzzzz',
      headers: { accept: 'text/html' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('fixture index');
  });

  it('404s non-basket paths for non-browser clients', async () => {
    const jsonGet = await app.inject({
      method: 'GET',
      url: '/zzzzzzzzzzzz',
      headers: { accept: 'application/json' },
    });
    expect(jsonGet.statusCode).toBe(404);

    const post = await app.inject({ method: 'POST', url: '/zzzzzzzzzzzz', payload: 'x' });
    expect(post.statusCode).toBe(404);
  });

  it('does not record anything for unknown addresses', async () => {
    const address = await createBasket();
    await app.inject({ method: 'GET', url: '/zzzzzzzzzzzz' });
    expect(await fetchRecords(address)).toHaveLength(0);
  });
});

describe('remoteIp behind a reverse proxy', () => {
  it('uses X-Forwarded-For only when trustProxy is enabled', async () => {
    const proxied = buildApp({ config, pool }, { trustProxy: true });
    await proxied.ready();
    try {
      const address = await createBasket();

      // Untrusted (default app): the header is attacker-settable, ignore it.
      await app.inject({
        method: 'POST',
        url: `/${address}`,
        headers: { 'x-forwarded-for': '198.51.100.7' },
        payload: 'a',
      });
      // Trusted (behind Caddy): the header is what Caddy wrote — use it.
      await proxied.inject({
        method: 'POST',
        url: `/${address}`,
        headers: { 'x-forwarded-for': '198.51.100.7' },
        payload: 'b',
      });

      const [viaProxy, direct] = await fetchRecords(address);
      expect(direct!.remoteIp).toBe('127.0.0.1');
      expect(viaProxy!.remoteIp).toBe('198.51.100.7');
    } finally {
      await proxied.close();
    }
  });

  it('caps an over-length X-Forwarded-For instead of failing the insert', async () => {
    const proxied = buildApp({ config, pool }, { trustProxy: true });
    await proxied.ready();
    try {
      const address = await createBasket();
      // No comma, so @fastify/forwarded returns it verbatim as req.ip; it is
      // longer than remote_ip NVARCHAR(64).
      const res = await proxied.inject({
        method: 'POST',
        url: `/${address}`,
        headers: { 'x-forwarded-for': 'x'.repeat(200) },
        payload: 'a',
      });
      expect(res.statusCode).toBe(204);
      const [rec] = await fetchRecords(address);
      expect(rec!.remoteIp).toHaveLength(64);
    } finally {
      await proxied.close();
    }
  });
});
