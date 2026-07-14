import Fastify from 'fastify';
import type { FastifyError, FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type sql from 'mssql';
import type { AppConfig } from './config';
import { apiRoutes } from './routes/api';
import { sinkRoutes } from './routes/sink';
import { sseRoutes } from './routes/sse';
import { SseRegistry } from './sse/registry';

declare module 'fastify' {
  interface FastifyInstance {
    /** Exposed for shutdown hooks and tests; routes receive it via opts. */
    sseRegistry: SseRegistry;
  }
}

export interface AppDeps {
  config: AppConfig;
  pool: sql.ConnectionPool;
}

export function buildApp(deps: AppDeps, fastifyOpts: FastifyServerOptions = {}) {
  const app = Fastify(fastifyOpts).withTypeProvider<ZodTypeProvider>();

  // Route schemas are zod (shared package); these compilers make Fastify use
  // zod for request validation and response serialization.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Let 4xx errors (validation, rate limit, not-found) pass through with
  // their messages; never leak internals on 5xx.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const status = err.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err }, 'request failed');
      return reply.code(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Internal Server Error',
      });
    }
    return reply.send(err);
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  const registry = new SseRegistry();
  app.decorate('sseRegistry', registry);

  app.register(apiRoutes, { prefix: '/api', pool: deps.pool, config: deps.config });
  app.register(sseRoutes, { prefix: '/api', pool: deps.pool, registry });
  app.register(sinkRoutes, { pool: deps.pool, config: deps.config, registry });

  return app;
}
