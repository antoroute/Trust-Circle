import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import { registerHealthRoutes } from '../dist/health.js';
import { createMessagingMetrics } from '../dist/metrics.js';

function fakeDatabase(readiness) {
  return {
    query: async () => ({ rows: [] }),
    one: async () => ({}),
    oneOrNone: async () => null,
    any: async () => [],
    none: async () => undefined,
    transaction: async (work) => work({}),
    readiness,
    poolStats: () => ({ total: 3, idle: 2, waiting: 1 }),
  };
}

test('readiness Messaging reste générique et liveness reste indépendante', async (t) => {
  let ready = true;
  const app = Fastify({ logger: false });
  app.decorate('db', fakeDatabase(async () => {
    if (!ready) throw new Error('MESSAGING-DATABASE-SECRET-SENTINEL');
  }));
  const metrics = createMessagingMetrics(app, () => undefined);
  registerHealthRoutes(app, metrics);
  await app.ready();
  t.after(() => app.close());

  assert.equal((await app.inject('/ready')).statusCode, 200);
  ready = false;
  const unavailable = await app.inject('/ready');
  assert.equal(unavailable.statusCode, 503);
  assert.deepEqual(unavailable.json(), { status: 'not_ready' });
  assert.doesNotMatch(unavailable.body, /SECRET|DATABASE/);
  assert.deepEqual((await app.inject('/health')).json(), { ok: true });
  assert.equal((await app.inject('/live')).statusCode, 200);

  const exposition = await metrics.registry.metrics();
  assert.match(exposition, /circlehaven_postgres_pool_connections\{service="messaging",state="waiting"\} 1/);
});

test('labels HTTP et Socket.IO restent dans des ensembles finis', async (t) => {
  const app = Fastify({ logger: false });
  app.decorate('db', fakeDatabase(async () => undefined));
  const metrics = createMessagingMetrics(app, () => undefined);
  app.get('/api/probe/:id', async () => ({ ok: true }));
  await app.ready();
  t.after(() => app.close());

  await app.inject('/api/probe/CONVERSATION-SECRET-SENTINEL?token=TOKEN-SECRET-SENTINEL');
  metrics.recordSocketConnection('accepted');
  metrics.recordSocketConnection('refused');
  metrics.recordSocketTransportError();
  metrics.recordSocketBroadcast('attacker:OUTGOING-SECRET-SENTINEL');
  metrics.observeSocketEvent('attacker:USER-SECRET-SENTINEL', 'failure', 0.01);

  const exposition = await metrics.registry.metrics();
  assert.match(exposition, /route="\/api\/probe\/:id"/);
  assert.match(exposition, /event="other",outcome="failure"/);
  assert.match(exposition, /circlehaven_socket_connection_attempts_total\{service="messaging",outcome="accepted"\} 1/);
  assert.match(exposition, /circlehaven_socket_transport_errors_total\{service="messaging"\} 1/);
  assert.match(exposition, /circlehaven_socket_broadcasts_total\{service="messaging",event="other"\} 1/);
  assert.doesNotMatch(exposition, /CONVERSATION-SECRET|TOKEN-SECRET|USER-SECRET|OUTGOING-SECRET|token=/);
});
