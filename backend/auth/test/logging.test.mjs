import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Writable } from 'node:stream';
import test from 'node:test';

import Fastify from 'fastify';

import {
  createObservabilityOptions,
  registerObservability,
  safeErrorFields,
} from '../dist/observability.js';

const FORWARDED_REQUEST_ID = '0123456789abcdef0123456789abcdef';

async function observedApp(registerRoutes) {
  let output = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const app = Fastify({
    ...createObservabilityOptions('test', 'info', stream),
  });
  await registerObservability(app);
  await registerRoutes(app);
  await app.ready();
  return {
    app,
    rawLogs: () => output,
    records: () => output.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)),
  };
}

test('corrèle la réponse et remplace tout identifiant entrant non fiable', async (t) => {
  const { app, records } = await observedApp(async (instance) => {
    instance.get('/resource', async () => ({ ok: true }));
    instance.get('/health', async () => ({ ok: true }));
  });
  t.after(() => app.close());

  const forwarded = await app.inject({
    method: 'GET',
    url: '/resource',
    headers: { 'x-request-id': FORWARDED_REQUEST_ID },
  });
  assert.equal(forwarded.headers['x-request-id'], FORWARDED_REQUEST_ID);

  for (const untrusted of [
    FORWARDED_REQUEST_ID.toUpperCase(),
    '01234567-89ab-cdef-0123-456789abcdef',
    'short',
  ]) {
    const response = await app.inject({
      method: 'GET',
      url: '/resource',
      headers: { 'x-request-id': untrusted },
    });
    assert.match(response.headers['x-request-id'], /^[0-9a-f]{32}$/);
    assert.notEqual(response.headers['x-request-id'], untrusted);
  }

  const generatedA = await app.inject({ method: 'GET', url: '/resource' });
  const generatedB = await app.inject({ method: 'GET', url: '/resource' });
  assert.match(generatedA.headers['x-request-id'], /^[0-9a-f]{32}$/);
  assert.notEqual(generatedA.headers['x-request-id'], generatedB.headers['x-request-id']);

  const beforeHealth = records().length;
  const health = await app.inject({ method: 'GET', url: '/health' });
  assert.match(health.headers['x-request-id'], /^[0-9a-f]{32}$/);
  assert.equal(records().length, beforeHealth);

  for (const record of records()) {
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.service, 'auth');
    assert.equal(record.environment, 'test');
    assert.equal(record.event, 'http_request_completed');
    assert.equal(record.method, 'GET');
    assert.equal(record.route, '/resource');
    assert.equal(record.statusCode, 200);
    assert.equal(record.outcome, 'success');
    assert.equal(typeof record.durationMs, 'number');
    assert.equal(record.req, undefined);
  }
});

test('ne journalise ni query string, ni données Auth, ni détails d erreur', async (t) => {
  const secrets = {
    query: 'query-secret-sentinel',
    authorization: 'authorization-secret-sentinel',
    cookie: 'cookie-secret-sentinel',
    proof: 'device-proof-secret-sentinel',
    email: 'private-email-sentinel@example.test',
    username: 'private-username-sentinel',
    password: 'password-secret-sentinel',
    detail: 'postgres-detail-private-email-sentinel',
    where: 'postgres-where-secret-sentinel',
    parameter: 'postgres-parameter-secret-sentinel',
    message: 'internal-error-secret-sentinel',
  };
  const { app, rawLogs, records } = await observedApp(async (instance) => {
    instance.post('/explode', async () => {
      const error = new Error(secrets.message);
      Object.assign(error, {
        code: '08006',
        detail: secrets.detail,
        where: secrets.where,
        parameters: [secrets.parameter],
      });
      throw error;
    });
  });
  t.after(() => app.close());

  const response = await app.inject({
    method: 'POST',
    url: `/explode?token=${secrets.query}`,
    headers: {
      authorization: `Bearer ${secrets.authorization}`,
      cookie: secrets.cookie,
      'x-circlehaven-device-proof': secrets.proof,
    },
    payload: {
      email: secrets.email,
      username: secrets.username,
      password: secrets.password,
    },
  });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: 'internal_server_error',
    requestId: response.headers['x-request-id'],
  });
  for (const secret of Object.values(secrets)) assert.doesNotMatch(rawLogs(), new RegExp(secret));
  assert.doesNotMatch(rawLogs(), /\?token=/);

  const failed = records().find((record) => record.event === 'http_request_error');
  assert.equal(failed.errorType, 'Error');
  assert.equal(failed.errorCode, 'database_unavailable');
  assert.equal(failed.method, 'POST');
  assert.equal(failed.route, '/explode');
  assert.equal(failed.statusCode, 500);
  const completed = records().find((record) => record.event === 'http_request_completed');
  assert.equal(completed.outcome, 'server_error');
  assert.equal(completed.requestId, response.headers['x-request-id']);
});

test('applique la redaction défensive aux formes explicitement interdites', async (t) => {
  const sentinels = [
    'top-password-sentinel',
    'header-token-sentinel',
    'body-email-sentinel@example.test',
    'response-grant-sentinel',
    'error-detail-sentinel',
    'error-message-sentinel',
  ];
  const { app, rawLogs } = await observedApp(async (instance) => {
    instance.post('/defensive-redaction', async (request) => {
      const loggedError = Object.assign(new Error(sentinels[5]), { detail: sentinels[4] });
      request.log.info({
        event: 'defensive_redaction_probe',
        outcome: 'success',
        password: sentinels[0],
        req: {
          headers: { authorization: sentinels[1] },
          body: { email: sentinels[2] },
        },
        response: { grant: sentinels[3] },
        err: loggedError,
      }, 'defensive redaction test');
      return { ok: true };
    });
  });
  t.after(() => app.close());

  await app.inject({ method: 'POST', url: '/defensive-redaction' });
  for (const sentinel of sentinels) assert.doesNotMatch(rawLogs(), new RegExp(sentinel));
  assert.doesNotMatch(rawLogs(), /password|authorization|grant|detail/);
});

test('une écoute réelle ne produit qu un événement de démarrage structuré', async (t) => {
  const { app, rawLogs, records } = await observedApp(async () => undefined);
  t.after(() => app.close());

  await app.listen({ port: 0, host: '127.0.0.1' });
  app.log.info({ event: 'service_started', outcome: 'success' }, 'ignored free text');

  assert.equal(records().length, 1);
  assert.equal(records()[0].event, 'service_started');
  assert.equal(records()[0].msg, 'service_started');
  assert.doesNotMatch(rawLogs(), /127\.0\.0\.1|Server listening|ignored free text/);
});

test('une erreur logger interne non conforme conserve un signal générique', async (t) => {
  const sentinel = 'INTERNAL-LOGGER-SECRET-SENTINEL';
  const { app, rawLogs, records } = await observedApp(async () => undefined);
  t.after(() => app.close());

  app.log.error(Object.assign(new Error(sentinel), { detail: sentinel }));

  assert.equal(records().length, 1);
  assert.equal(records()[0].event, 'runtime_internal_error');
  assert.equal(records()[0].errorType, 'Error');
  assert.doesNotMatch(rawLogs(), new RegExp(sentinel));
});

test('conserve les erreurs HTTP 4xx sans journaliser leur message', async (t) => {
  const sensitiveMessage = 'client-error-message-sentinel';
  const { app, rawLogs, records } = await observedApp(async (instance) => {
    instance.get('/rejected', async () => {
      throw Object.assign(new Error(sensitiveMessage), {
        code: 'FST_ERR_TEST_REJECTED',
        statusCode: 422,
      });
    });
  });
  t.after(() => app.close());

  const response = await app.inject({ method: 'GET', url: '/rejected' });
  assert.equal(response.statusCode, 422);
  assert.equal(response.json().message, sensitiveMessage);
  assert.doesNotMatch(rawLogs(), new RegExp(sensitiveMessage));
  const failed = records().find((record) => record.event === 'http_request_error');
  assert.equal(failed.errorType, 'Error');
  assert.equal(failed.errorCode, undefined);
  assert.equal(failed.statusCode, 422);
  assert.equal(records().at(-1).outcome, 'client_error');
});

test('safeErrorFields refuse les métadonnées libres', () => {
  const error = new Error('secret message');
  Object.assign(error, { code: 'unsafe code with spaces', statusCode: 612, detail: 'secret detail' });
  assert.deepEqual(safeErrorFields(error), { errorType: 'Error' });
  assert.deepEqual(
    safeErrorFields(Object.assign(new Error('secret'), { code: 'PASSWORD_SECRET' })),
    { errorType: 'Error' },
  );
  assert.deepEqual(safeErrorFields('not an error'), { errorType: 'Error' });
});

test('les sources runtime ne contournent pas le logger structuré avec console', async () => {
  const sourceRoot = new URL('../src/', import.meta.url);
  const runtimeFiles = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.ts')) runtimeFiles.push(path);
    }
  }
  await visit(sourceRoot);
  for (const file of runtimeFiles) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /console\.(?:debug|info|log|warn|error)\s*\(/, file.pathname);
  }
});
