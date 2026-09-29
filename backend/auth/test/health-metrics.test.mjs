import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';

import Fastify from 'fastify';

import { registerHealthRoutes } from '../dist/health.js';
import { createAuthMetrics } from '../dist/metrics.js';
import dbPlugin from '../dist/plugins/db.js';

function decorateFakeDatabase(app, readiness) {
  app.decorate('db', {
    query: async () => ({ rows: [] }),
    one: async () => ({}),
    maybeOne: async () => null,
    any: async () => [],
    none: async () => undefined,
    readiness,
    poolStats: () => ({ total: 2, idle: 1, waiting: 0 }),
  });
}

test('sépare liveness, compatibilité et readiness sans divulguer les erreurs', async (t) => {
  let ready = true;
  const app = Fastify({ logger: false });
  decorateFakeDatabase(app, async () => {
    if (!ready) throw new Error('DATABASE-READINESS-SECRET-SENTINEL');
  });
  const metrics = createAuthMetrics(app);
  registerHealthRoutes(app, metrics);
  await app.ready();
  t.after(() => app.close());

  assert.deepEqual((await app.inject('/live')).json(), { status: 'live' });
  assert.deepEqual((await app.inject('/health')).json(), { ok: true });
  assert.deepEqual((await app.inject('/ready')).json(), { status: 'ready' });

  ready = false;
  const unavailable = await app.inject('/ready');
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { status: 'not_ready' });
  assert.doesNotMatch(unavailable.body, /SECRET|DATABASE/);
  assert.equal((await app.inject('/live')).statusCode, 200);

  const exposition = await metrics.registry.metrics();
  assert.match(exposition, /circlehaven_readiness_checks_total\{service="auth",outcome="ready"\} 1/);
  assert.match(exposition, /circlehaven_readiness_checks_total\{service="auth",outcome="not_ready"\} 1/);
  assert.match(exposition, /circlehaven_postgres_pool_connections\{service="auth",state="total"\} 2/);
});

test('borne une dépendance PostgreSQL qui accepte TCP sans répondre', async (t) => {
  const sockets = new Set();
  const blackhole = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise((resolve) => blackhole.listen(0, '127.0.0.1', resolve));
  const address = blackhole.address();
  assert.equal(typeof address, 'object');

  const app = Fastify({ logger: false });
  await app.register(dbPlugin, {
    connectionString: `postgresql://probe:probe@127.0.0.1:${address.port}/probe`,
  });
  const metrics = createAuthMetrics(app);
  registerHealthRoutes(app, metrics);
  await app.ready();
  t.after(async () => {
    await app.close();
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => blackhole.close(resolve));
  });

  const startedAt = performance.now();
  const response = await app.inject('/ready');
  const duration = performance.now() - startedAt;
  assert.equal(response.statusCode, 503);
  assert.ok(duration >= 800 && duration < 2_500, `readiness duration: ${duration}ms`);
  assert.equal((await app.inject('/live')).statusCode, 200);
});

test('métriques HTTP utilisent la route modèle et jamais une URL brute', async (t) => {
  const app = Fastify({ logger: false });
  decorateFakeDatabase(app, async () => undefined);
  const metrics = createAuthMetrics(app);
  app.get('/probe/:id', async () => ({ ok: true }));
  await app.ready();
  t.after(() => app.close());

  await app.inject('/probe/ACCOUNT-SECRET-SENTINEL?token=TOKEN-SECRET-SENTINEL');
  const exposition = await metrics.registry.metrics();
  assert.match(exposition, /route="\/probe\/:id"/);
  assert.doesNotMatch(exposition, /ACCOUNT-SECRET|TOKEN-SECRET|token=/);
});
