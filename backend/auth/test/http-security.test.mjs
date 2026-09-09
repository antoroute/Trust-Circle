import assert from 'node:assert/strict';
import test from 'node:test';

import fastifyCors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';

import { corsOptions } from '../dist/httpSecurity.js';
import authRoutes from '../dist/routes/auth.js';

const securityConfig = {
  corsAllowedOrigins: ['https://app.example.test'],
};

async function corsApp() {
  const app = Fastify({ logger: false });
  await app.register(fastifyCors, corsOptions(securityConfig));
  app.get('/resource', async () => ({ ok: true }));
  await app.ready();
  return app;
}

test('CORS n’autorise que les origines exactes et laisse passer les clients natifs', async (t) => {
  const app = await corsApp();
  t.after(() => app.close());

  const allowed = await app.inject({
    method: 'GET',
    url: '/resource',
    headers: { origin: 'https://app.example.test' },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.example.test');
  assert.equal(allowed.headers['access-control-allow-credentials'], undefined);

  const refused = await app.inject({
    method: 'GET',
    url: '/resource',
    headers: { origin: 'https://evil.example.test' },
  });
  assert.equal(refused.statusCode, 200);
  assert.equal(refused.headers['access-control-allow-origin'], undefined);

  const nativeClient = await app.inject({ method: 'GET', url: '/resource' });
  assert.equal(nativeClient.statusCode, 200);
  assert.equal(nativeClient.headers['access-control-allow-origin'], undefined);
});

test('un X-Forwarded-For forgé ne modifie pas l’IP sans proxy de confiance', async (t) => {
  const app = Fastify({ logger: false, trustProxy: false });
  app.get('/ip', async (request) => ({ ip: request.ip }));
  await app.ready();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress: '198.51.100.10',
    headers: { 'x-forwarded-for': '203.0.113.77' },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().ip, '198.51.100.10');
});

test('seule la gateway configurée peut transmettre l’IP client', async (t) => {
  const app = Fastify({ logger: false, trustProxy: ['172.30.108.10/32'] });
  app.get('/ip', async (request) => ({ ip: request.ip }));
  await app.ready();
  t.after(() => app.close());

  const trusted = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress: '172.30.108.10',
    headers: { 'x-forwarded-for': '198.51.100.20' },
  });
  assert.equal(trusted.json().ip, '198.51.100.20');

  const forged = await app.inject({
    method: 'GET',
    url: '/ip',
    remoteAddress: '172.30.108.99',
    headers: { 'x-forwarded-for': '198.51.100.20' },
  });
  assert.equal(forged.json().ip, '172.30.108.99');
});

async function rateLimitedAuthApp() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    enableDraftSpec: true,
  });
  app.decorate('authenticate', async () => undefined);
  app.decorate('db', {
    one: async (query) => {
      if (query.includes('SELECT id, email, username, password FROM users')) return null;
      return { id: '11111111-1111-4111-8111-111111111111' };
    },
    any: async () => [],
    none: async () => undefined,
  });
  app.get('/health', async () => ({ ok: true }));
  await app.register(authRoutes);
  await app.ready();
  return app;
}

test('les limites globales, inscription et connexion retournent 429 avec headers standard', async (t) => {
  const app = await rateLimitedAuthApp();
  t.after(() => app.close());

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/register',
      payload: { email: `member${attempt}@example.test`, username: `Member${attempt}`, password: 'password-secure' },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  const registrationLimit = await app.inject({
    method: 'POST',
    url: '/register',
    payload: { email: 'member4@example.test', username: 'Member4', password: 'password-secure' },
  });
  assert.equal(registrationLimit.statusCode, 429);
  assert.equal(registrationLimit.headers['ratelimit-limit'], '3');
  assert.ok(registrationLimit.headers['retry-after']);

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await app.inject({
      method: 'POST',
      url: '/login',
      payload: { email: 'nobody@example.test', password: 'password-secure' },
    });
    assert.equal(response.statusCode, 401);
  }
  const loginLimit = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email: 'nobody@example.test', password: 'password-secure' },
  });
  assert.equal(loginLimit.statusCode, 429);
  assert.equal(loginLimit.headers['ratelimit-limit'], '10');

  let globalLimit;
  for (let attempt = 0; attempt < 301; attempt += 1) {
    globalLimit = await app.inject({ method: 'GET', url: '/health' });
  }
  assert.equal(globalLimit.statusCode, 429);
  assert.equal(globalLimit.headers['ratelimit-limit'], '300');
});
