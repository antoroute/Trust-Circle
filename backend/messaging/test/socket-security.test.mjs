import assert from 'node:assert/strict';
import test from 'node:test';
import fastifyCors from '@fastify/cors';
import Fastify from 'fastify';

import {
  createAckResponder,
  hasUserDeviceSocketCapacity,
  isAllowedSocketOrigin,
  MAX_SOCKETS_PER_USER_DEVICE,
  SocketConnectionLimiter,
  SocketEventQuotas,
  socketAllowRequest,
} from '../dist/security/socketSecurity.js';
import { corsOptions } from '../dist/httpSecurity.js';

const allowedOrigins = ['https://app.example.test'];

test('HTTP CORS exposes only exact origins and bounded methods/headers', async (t) => {
  const app = Fastify({ logger: false });
  await app.register(fastifyCors, corsOptions(allowedOrigins));
  app.get('/resource', async () => ({ ok: true }));
  await app.ready();
  t.after(() => app.close());

  const allowed = await app.inject({
    method: 'OPTIONS',
    url: '/resource',
    headers: {
      origin: 'https://app.example.test',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,x-client-version',
    },
  });
  assert.equal(allowed.statusCode, 204);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://app.example.test');
  assert.equal(allowed.headers['access-control-allow-credentials'], undefined);
  assert.match(allowed.headers['access-control-allow-methods'], /PATCH/);
  assert.doesNotMatch(allowed.headers['access-control-allow-headers'], /x-app-secret/i);

  const refused = await app.inject({
    method: 'GET',
    url: '/resource',
    headers: { origin: 'https://attacker.example' },
  });
  assert.equal(refused.statusCode, 200);
  assert.equal(refused.headers['access-control-allow-origin'], undefined);
  const native = await app.inject({ method: 'GET', url: '/resource' });
  assert.equal(native.statusCode, 200);
});

test('Socket.IO Origin allowlist permits native clients without Origin and rejects other browser origins', () => {
  assert.equal(isAllowedSocketOrigin(undefined, allowedOrigins), true);
  assert.equal(isAllowedSocketOrigin('https://app.example.test', allowedOrigins), true);
  assert.equal(isAllowedSocketOrigin('https://attacker.example', allowedOrigins), false);

  const allowRequest = socketAllowRequest(allowedOrigins);
  let result;
  allowRequest({ headers: { origin: 'https://attacker.example' } }, (message, success) => {
    result = { message, success };
  });
  assert.deepEqual(result, { message: null, success: false });
});

test('per-socket quotas are soft and reset after their window', () => {
  const quotas = new SocketEventQuotas();
  for (let index = 0; index < 60; index += 1) assert.equal(quotas.allowSubscription(1, 1_000), true);
  assert.equal(quotas.allowSubscription(1, 1_000), false);
  assert.equal(quotas.allowSubscription(1, 11_000), true);

  const batchQuotas = new SocketEventQuotas();
  for (let index = 0; index < 10; index += 1) {
    assert.equal(batchQuotas.allowSubscription(100, 1_000), true);
  }
  assert.equal(batchQuotas.allowSubscription(201, 1_000), false);

  for (let index = 0; index < 12; index += 1) assert.equal(quotas.allowTyping(1_000), true);
  assert.equal(quotas.allowTyping(1_000), false);
  assert.equal(quotas.allowTyping(6_000), true);
});

test('a user-device cannot exceed five simultaneous sockets', () => {
  const userId = 'user';
  const deviceId = 'device';
  const sockets = new Map();
  for (let index = 0; index < MAX_SOCKETS_PER_USER_DEVICE; index += 1) {
    sockets.set(String(index), { auth: { userId, deviceId } });
  }
  const io = { sockets: { sockets } };
  assert.equal(hasUserDeviceSocketCapacity(io, userId, deviceId), false);
  sockets.delete('0');
  assert.equal(hasUserDeviceSocketCapacity(io, userId, deviceId), true);
});

test('pending handshakes cannot race past the per-device connection limit', () => {
  const limiter = new SocketConnectionLimiter();
  const io = { sockets: { sockets: new Map() } };
  for (let index = 0; index < MAX_SOCKETS_PER_USER_DEVICE; index += 1) {
    assert.equal(limiter.reserve(io, 'user', 'device'), true);
  }
  assert.equal(limiter.reserve(io, 'user', 'device'), false);
  limiter.release('user', 'device');
  assert.equal(limiter.reserve(io, 'user', 'device'), true);
});

test('subscribe acknowledgements and compatibility events are emitted exactly once', () => {
  const emitted = [];
  const acknowledged = [];
  const respond = createAckResponder(
    { emit: (event, response) => emitted.push({ event, response }) },
    'conv:subscribe',
    (response) => acknowledged.push(response),
  );
  respond({ success: true });
  respond({ success: false, error: 'forbidden' });
  assert.deepEqual(acknowledged, [{ success: true }]);
  assert.deepEqual(emitted, [{ event: 'conv:subscribe', response: { success: true } }]);
});
