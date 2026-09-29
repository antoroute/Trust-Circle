import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

const SERVICE = 'auth';
const SILENT_ROUTES = new Set(['/health', '/live', '/ready', '/metrics']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

function routeTemplate(request: FastifyRequest): string {
  const route = request.routeOptions?.url;
  return typeof route === 'string' && route.startsWith('/') ? route : 'unmatched';
}

function methodLabel(method: string): string {
  return HTTP_METHODS.has(method) ? method : 'OTHER';
}

function statusClass(statusCode: number): string {
  if (statusCode >= 200 && statusCode < 600) return `${Math.floor(statusCode / 100)}xx`;
  return 'other';
}

export interface AuthMetrics {
  readonly registry: Registry;
  recordReadiness(outcome: 'ready' | 'not_ready'): void;
}

export function createAuthMetrics(app: FastifyInstance): AuthMetrics {
  const registry = new Registry();
  collectDefaultMetrics({
    register: registry,
    prefix: 'circlehaven_auth_',
  });

  const requests = new Counter({
    name: 'circlehaven_http_requests_total',
    help: 'Completed HTTP requests by service, method, route template and status class.',
    labelNames: ['service', 'method', 'route', 'status_class'] as const,
    registers: [registry],
  });
  const requestDuration = new Histogram({
    name: 'circlehaven_http_request_duration_seconds',
    help: 'HTTP request duration by service, method and route template.',
    labelNames: ['service', 'method', 'route'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const readiness = new Counter({
    name: 'circlehaven_readiness_checks_total',
    help: 'Readiness checks by service and bounded outcome.',
    labelNames: ['service', 'outcome'] as const,
    registers: [registry],
  });
  new Gauge({
    name: 'circlehaven_postgres_pool_connections',
    help: 'PostgreSQL pool state by service.',
    labelNames: ['service', 'state'] as const,
    registers: [registry],
    collect() {
      const stats = app.db.poolStats();
      this.set({ service: SERVICE, state: 'total' }, stats.total);
      this.set({ service: SERVICE, state: 'idle' }, stats.idle);
      this.set({ service: SERVICE, state: 'waiting' }, stats.waiting);
    },
  });

  app.addHook('onResponse', (request, reply, done) => {
    const route = routeTemplate(request);
    if (!SILENT_ROUTES.has(route)) {
      const method = methodLabel(request.method);
      requests.inc({
        service: SERVICE,
        method,
        route,
        status_class: statusClass(reply.statusCode),
      });
      requestDuration.observe(
        { service: SERVICE, method, route },
        reply.elapsedTime / 1_000,
      );
    }
    done();
  });

  app.get('/metrics', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.type(registry.contentType);
    return reply.send(await registry.metrics());
  });

  return {
    registry,
    recordReadiness(outcome) {
      readiness.inc({ service: SERVICE, outcome });
    },
  };
}
