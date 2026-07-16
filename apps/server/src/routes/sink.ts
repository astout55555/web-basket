import { existsSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import { basketAddressSchema, SSE_EVENT_REQUEST } from '@web-basket/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type sql from 'mssql';
import type { AppConfig } from '../config';
import { findBasketByAddress, isMissingBasketError } from '../db/baskets-repo';
import { insertRequest, toRequestRecord } from '../db/requests-repo';
import type { SseRegistry } from '../sse/registry';

export interface SinkRoutesOpts {
  pool: sql.ConnectionPool;
  config: AppConfig;
  registry: SseRegistry;
}

/** What the catch-all content-type parser hands the handler as req.body. */
interface CapturedBody {
  buffer: Buffer;
  receivedBytes: number;
  truncated: boolean;
}

/**
 * The sink plus the tail of the routing-precedence chain (spec §7.3).
 *
 * Steps 1–2 of the precedence (API, static assets) fall out of the router
 * itself: find-my-way always prefers static path segments (/api, /assets)
 * over the parametric /:address. Steps 3–5 (sink → SPA fallback → 404) are
 * decided here, because only the database knows whether :address exists.
 */
export const sinkRoutes: FastifyPluginAsync<SinkRoutesOpts> = async (
  app,
  { pool, config, registry },
) => {
  const webDistDir = path.resolve(config.webDistDir);
  const hasWebDist = existsSync(path.join(webDistDir, 'index.html'));
  if (hasWebDist) {
    // wildcard:false = register a real route per existing file at boot, so
    // static wins over the sink by router precedence, and nothing else is
    // shadowed (a wildcard /* would swallow every GET, including sink hits).
    await app.register(fastifyStatic, { root: webDistDir, wildcard: false, index: ['index.html'] });
  } else {
    app.log.warn({ webDistDir }, 'web build not found; SPA routes will 404 (fine under Vite dev)');
  }

  // Encapsulation: inside this plugin only, replace ALL body parsers with a
  // raw collector. The sink must never reject a payload (malformed JSON is
  // a perfectly good webhook to inspect) — and it truncates rather than
  // 413-ing oversized bodies, which Fastify's bodyLimit would do.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('*', (req, payload, done) => {
    const cap = config.bodyMaxBytes;
    const chunks: Buffer[] = [];
    let storedBytes = 0;
    let receivedBytes = 0;
    payload.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (storedBytes < cap) {
        const room = cap - storedBytes;
        const slice = chunk.length <= room ? chunk : chunk.subarray(0, room);
        chunks.push(slice);
        storedBytes += slice.length;
      }
    });
    payload.on('end', () => {
      const captured: CapturedBody = {
        buffer: Buffer.concat(chunks),
        receivedBytes,
        truncated: receivedBytes > cap,
      };
      done(null, captured);
    });
    payload.on('error', (err) => done(err));
  });

  // HEAD is intentionally absent: Fastify auto-generates HEAD routes from
  // GET (same handler, body stripped), so HEAD hits are recorded too.
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
  app.route({ method: methods, url: '/:address', handler: sinkHandler });
  app.route({ method: methods, url: '/:address/*', handler: sinkHandler });

  async function sinkHandler(req: FastifyRequest, reply: FastifyReply) {
    const { address } = req.params as { address: string };

    if (basketAddressSchema.safeParse(address).success) {
      const basket = await findBasketByAddress(pool, address);
      if (basket) {
        const captured = req.body as CapturedBody | undefined;

        const rawUrl = req.raw.url ?? req.url;
        const queryStart = rawUrl.indexOf('?');
        const pathOnly = (queryStart === -1 ? rawUrl : rawUrl.slice(0, queryStart)).slice(0, 2048);
        const query = queryStart === -1 ? null : rawUrl.slice(queryStart + 1) || null;

        // Node types header values as possibly-undefined; drop those.
        const headers: Record<string, string | string[]> = {};
        for (const [name, value] of Object.entries(req.headers)) {
          if (value !== undefined) headers[name] = value;
        }

        // Cap every free-form string to its column width. method and remoteIp
        // are attacker-controlled (a custom HTTP verb; a crafted
        // X-Forwarded-For when TRUST_PROXY is on), and an over-length value
        // would make the INSERT fail rather than truncate — the sink must
        // still record the hit, so we cap here like path and content-type.
        let stored;
        try {
          stored = await insertRequest(pool, {
            basketId: basket.id,
            method: req.method.slice(0, 16),
            path: pathOnly,
            query,
            headers,
            body: captured && captured.buffer.length > 0 ? captured.buffer : null,
            bodySize: captured?.receivedBytes ?? 0,
            truncated: captured?.truncated ?? false,
            contentType: req.headers['content-type']?.slice(0, 256) ?? null,
            remoteIp: req.ip?.slice(0, 64) ?? null,
            requestCap: config.basketRequestCap,
          });
        } catch (err) {
          // The basket can be deleted (owner or TTL sweep) between the lookup
          // above and this insert; the foreign key then rejects the row. The
          // basket is genuinely gone, so answer 404 like any unknown address
          // rather than 500. Any other error (deadlock, transient) is a real
          // 5xx and propagates to the sanitizing error handler.
          if (isMissingBasketError(err)) {
            return reply
              .code(404)
              .send({ statusCode: 404, error: 'Not Found', message: 'no such basket' });
          }
          throw err;
        }

        // DB write is durable; now push the record to live dashboards. Skip
        // building the (up to ~342 KB base64) record when nobody is watching.
        if (registry.connectionCount(address) > 0) {
          registry.broadcast(address, SSE_EVENT_REQUEST, toRequestRecord(stored));
        }

        return reply.code(204).send();
      }
    }

    // Not a basket: browser navigations get the SPA (client router shows its
    // own not-found state); everything else is an honest 404.
    if (req.method === 'GET' && hasWebDist && (req.headers.accept ?? '').includes('text/html')) {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'no such basket' });
  }
};
