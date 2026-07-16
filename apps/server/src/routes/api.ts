import {
  apiErrorSchema,
  basketAddressSchema,
  createBasketResponseSchema,
  listRequestsResponseSchema,
} from '@web-basket/shared';
import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type sql from 'mssql';
import { z } from 'zod';
import type { AppConfig } from '../config';
import { createBasket, deleteBasket, findBasketByAddress } from '../db/baskets-repo';
import { listRequests, toRequestRecord } from '../db/requests-repo';
import type { SseRegistry } from '../sse/registry';

export interface ApiRoutesOpts {
  pool: sql.ConnectionPool;
  config: AppConfig;
  registry: SseRegistry;
}

export const addressParams = z.object({ address: basketAddressSchema });

/**
 * The JSON API. Registered under the /api prefix; the rate limiter is
 * registered inside this plugin, so Fastify's encapsulation keeps it scoped
 * to these routes (the sink must never be rate limited — dropping webhooks
 * defeats the product).
 */
export const apiRoutes: FastifyPluginAsyncZod<ApiRoutesOpts> = async (
  app,
  { pool, config, registry },
) => {
  await app.register(rateLimit, { global: false });

  app.post(
    '/baskets',
    {
      config: {
        rateLimit: { max: config.basketCreatePerMinute, timeWindow: '1 minute' },
      },
      schema: {
        response: { 201: createBasketResponseSchema },
      },
    },
    async (req, reply) => {
      const basket = await createBasket(pool);
      return reply.code(201).send({ address: basket.address });
    },
  );

  app.get(
    '/baskets/:address/requests',
    {
      schema: {
        params: addressParams,
        response: { 200: listRequestsResponseSchema, 404: apiErrorSchema },
      },
    },
    async (req, reply) => {
      const basket = await findBasketByAddress(pool, req.params.address);
      if (!basket) {
        return reply
          .code(404)
          .send({ statusCode: 404, error: 'Not Found', message: 'basket not found' });
      }
      const stored = await listRequests(pool, basket.id, config.basketRequestCap);
      return reply.send({ requests: stored.map(toRequestRecord) });
    },
  );

  app.delete(
    '/baskets/:address',
    {
      schema: {
        params: addressParams,
        // 204 carries no body; Fastify skips serialization for it, but the
        // type provider still wants the status declared.
        response: { 204: z.null(), 404: apiErrorSchema },
      },
    },
    async (req, reply) => {
      const deleted = await deleteBasket(pool, req.params.address);
      if (!deleted) {
        return reply
          .code(404)
          .send({ statusCode: 404, error: 'Not Found', message: 'basket not found' });
      }
      // Close any live dashboards on this basket so they don't stay "live".
      registry.closeAddress(req.params.address);
      return reply.code(204).send(null);
    },
  );
};
