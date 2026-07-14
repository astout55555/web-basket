import { apiErrorSchema } from '@web-basket/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type sql from 'mssql';
import { findBasketByAddress } from '../db/baskets-repo';
import type { SseRegistry } from '../sse/registry';
import { addressParams } from './api';

export interface SseRoutesOpts {
  pool: sql.ConnectionPool;
  registry: SseRegistry;
}

const HEARTBEAT_MS = 15_000;

/**
 * The live stream (spec §8). The response is deliberately never ended: SSE
 * is just a regular HTTP response whose body keeps growing, one
 * "event:/data:" frame at a time.
 */
export const sseRoutes: FastifyPluginAsyncZod<SseRoutesOpts> = async (app, { pool, registry }) => {
  // Comment frames keep idle connections alive through proxies/timeouts.
  // unref(): the timer must never be what keeps the process running.
  const heartbeat = setInterval(() => registry.heartbeat(), HEARTBEAT_MS);
  heartbeat.unref();

  // Open SSE responses would block app.close() (the server waits for active
  // responses to finish — and ours never do). End them all on shutdown.
  app.addHook('onClose', async () => {
    clearInterval(heartbeat);
    registry.closeAll();
  });

  app.get(
    '/baskets/:address/stream',
    { schema: { params: addressParams, response: { 404: apiErrorSchema } } },
    async (req, reply) => {
      const { address } = req.params;
      const basket = await findBasketByAddress(pool, address);
      if (!basket) {
        return reply
          .code(404)
          .send({ statusCode: 404, error: 'Not Found', message: 'basket not found' });
      }

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      // First bytes flush the headers so EventSource fires `open` right away;
      // lines starting with ':' are comments the client ignores.
      reply.raw.write(': connected\n\n');

      const conn = {
        write: (frame: string) => void reply.raw.write(frame),
        end: () => reply.raw.end(),
      };
      registry.add(address, conn);
      req.raw.on('close', () => registry.remove(address, conn));

      // We own reply.raw from here on; tell Fastify not to touch the response.
      reply.hijack();
    },
  );
};
