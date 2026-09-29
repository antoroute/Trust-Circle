import type { FastifyInstance } from 'fastify';

import type { AuthMetrics } from './metrics.js';

export function registerHealthRoutes(app: FastifyInstance, metrics: AuthMetrics): void {
  app.get('/live', async () => ({ status: 'live' }));

  // Compatibility contract retained while callers migrate to /live or /ready.
  app.get('/health', async () => ({ ok: true }));

  app.get('/ready', async (_request, reply) => {
    try {
      await app.db.readiness();
      metrics.recordReadiness('ready');
      return { status: 'ready' };
    } catch {
      metrics.recordReadiness('not_ready');
      return reply.code(503).send({ status: 'not_ready' });
    }
  });
}
