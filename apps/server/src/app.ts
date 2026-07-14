import Fastify from 'fastify';
import type { FastifyServerOptions } from 'fastify';

export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.get('/healthz', async () => ({ status: 'ok' }));

  return app;
}
