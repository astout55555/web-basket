/**
 * SSE stream tests over a real socket (app.listen on an ephemeral port):
 * light-my-request/inject cannot model a response that never ends.
 */
import { requestRecordSchema } from '@web-basket/shared';
import type sql from 'mssql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app';
import { setupTestDb, testAppConfig } from '../test/db';

const TEST_DB = 'webbasket_sse_test';

let pool: sql.ConnectionPool;
let app: ReturnType<typeof buildApp>;
let baseUrl: string;

beforeAll(async () => {
  pool = await setupTestDb(TEST_DB);
  app = buildApp({ config: testAppConfig(TEST_DB), pool });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const addr = app.server.address();
  if (addr === null || typeof addr === 'string') throw new Error('no port');
  baseUrl = `http://127.0.0.1:${addr.port}`;
}, 60_000);

afterAll(async () => {
  await app?.close();
  await pool?.close();
});

async function createBasket(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/baskets`, { method: 'POST' });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { address: string };
  return body.address;
}

/** Open the SSE stream and return a line-buffered reader over its text. */
async function openStream(address: string, signal: AbortSignal) {
  const res = await fetch(`${baseUrl}/api/baskets/${address}/stream`, {
    headers: { accept: 'text/event-stream' },
    signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toContain('text/event-stream');
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  return {
    /** Read until the buffered text contains `needle` (with timeout). */
    async waitFor(needle: string, timeoutMs = 5000): Promise<string> {
      const deadline = Date.now() + timeoutMs;
      while (!buffer.includes(needle)) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error(`timed out waiting for ${JSON.stringify(needle)}`);
        const chunk = await Promise.race([
          reader.read(),
          new Promise<never>((_, rej) =>
            setTimeout(() => rej(new Error('read timeout')), remaining),
          ),
        ]);
        if (chunk.done) throw new Error('stream ended unexpectedly');
        buffer += decoder.decode(chunk.value, { stream: true });
      }
      return buffer;
    },
  };
}

describe('GET /api/baskets/:address/stream', () => {
  it('404s for an unknown basket', async () => {
    const res = await fetch(`${baseUrl}/api/baskets/zzzzzzzzzzzz/stream`);
    expect(res.status).toBe(404);
    await res.body?.cancel();
  });

  it('opens with a comment, then delivers a sink hit as an event: request frame', async () => {
    const address = await createBasket();
    const ac = new AbortController();
    try {
      const stream = await openStream(address, ac.signal);
      await stream.waitFor(': connected');

      await fetch(`${baseUrl}/${address}/hook`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"n":1}',
      });

      const text = await stream.waitFor('event: request');
      const dataLine = text
        .split('\n')
        .find((l) => l.startsWith('data: '))!
        .slice('data: '.length);
      const record = requestRecordSchema.parse(JSON.parse(dataLine));
      expect(record.path).toBe(`/${address}/hook`);
      expect(Buffer.from(record.bodyBase64!, 'base64').toString()).toBe('{"n":1}');
    } finally {
      ac.abort();
    }
  });

  it('fans out to all subscribers of that basket, and only that basket', async () => {
    const address = await createBasket();
    const otherAddress = await createBasket();
    const ac = new AbortController();
    try {
      const sub1 = await openStream(address, ac.signal);
      const sub2 = await openStream(address, ac.signal);
      const other = await openStream(otherAddress, ac.signal);
      await sub1.waitFor(': connected');
      await sub2.waitFor(': connected');
      await other.waitFor(': connected');

      await fetch(`${baseUrl}/${address}`, { method: 'POST', body: 'fan' });

      await sub1.waitFor('event: request');
      await sub2.waitFor('event: request');
      await expect(other.waitFor('event: request', 400)).rejects.toThrow();
    } finally {
      ac.abort();
    }
  });

  it('deregisters connections when the client disconnects', async () => {
    const address = await createBasket();
    const ac = new AbortController();
    const stream = await openStream(address, ac.signal);
    await stream.waitFor(': connected');
    expect(app.sseRegistry.connectionCount(address)).toBe(1);

    ac.abort();

    const deadline = Date.now() + 3000;
    while (app.sseRegistry.connectionCount(address) > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(app.sseRegistry.connectionCount(address)).toBe(0);
  });

  it('closes the stream when the basket is deleted', async () => {
    const address = await createBasket();
    const ac = new AbortController();
    try {
      const stream = await openStream(address, ac.signal);
      await stream.waitFor(': connected');
      expect(app.sseRegistry.connectionCount(address)).toBe(1);

      const res = await fetch(`${baseUrl}/api/baskets/${address}`, { method: 'DELETE' });
      expect(res.status).toBe(204);

      // The registry drops the connection immediately (closeAddress); the
      // client's read then ends as the server closes the socket.
      expect(app.sseRegistry.connectionCount(address)).toBe(0);
      await expect(stream.waitFor('never arrives', 1000)).rejects.toThrow(/stream ended|timed out/);
    } finally {
      ac.abort();
    }
  });
});
