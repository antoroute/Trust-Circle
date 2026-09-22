import assert from 'node:assert/strict';
import test from 'node:test';

import Fastify from 'fastify';

import authRoutes from '../dist/routes/auth.js';
import {
  JWT_ACCESS_AUDIENCE,
  JWT_ISSUER,
  JWT_TOKEN_VERSION,
} from '../dist/security/jwt.js';

const ACCOUNT = '11111111-1111-4111-8111-111111111111';

function claims() {
  const now = Math.floor(Date.now() / 1_000);
  return {
    sub: ACCOUNT,
    iss: JWT_ISSUER,
    aud: JWT_ACCESS_AUDIENCE,
    iat: now,
    exp: now + 900,
    jti: '22222222-2222-4222-8222-222222222222',
    typ: 'access',
    ver: JWT_TOKEN_VERSION,
  };
}

async function failingDatabaseApp() {
  const app = Fastify({ logger: false });
  app.decorate('authenticate', async (request) => {
    request.user = claims();
  });
  app.decorate('db', {
    query: async () => { throw new Error('database unavailable'); },
    one: async () => { throw new Error('database unavailable'); },
    maybeOne: async () => { throw new Error('database unavailable'); },
    any: async () => { throw new Error('database unavailable'); },
    none: async () => { throw new Error('database unavailable'); },
  });
  await app.register(authRoutes);
  await app.ready();
  return app;
}

test('une panne DB pendant le login ne devient pas un faux identifiant invalide', async (t) => {
  const app = await failingDatabaseApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/login',
    payload: { email: 'alice@example.test', password: 'password-secure' },
  });
  assert.equal(response.statusCode, 500);
  assert.notEqual(response.json().error, 'invalid_credentials');
});

test('une panne DB pendant la réautorisation appareil ne devient pas un faux 401', async (t) => {
  const app = await failingDatabaseApp();
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: '/device-bootstrap-grant',
    payload: { password: 'password-secure' },
  });
  assert.equal(response.statusCode, 500);
  assert.notEqual(response.json().error, 'invalid_credentials');
});
