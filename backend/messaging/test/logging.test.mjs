import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Writable } from 'node:stream';
import test from 'node:test';

import Fastify from 'fastify';

import {
  createObservabilityOptions,
  generateRequestId,
  observeSocketTask,
  registerObservability,
  safeStartupFailure,
  socketLogger,
} from '../dist/observability.js';
import { createAckResponder } from '../dist/security/socketSecurity.js';

const FORWARDED_REQUEST_ID = '0123456789abcdef0123456789abcdef';

function captureStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
  return {
    stream,
    text: () => chunks.join(''),
    records: () => chunks.join('').trim().split('\n').filter(Boolean).map(JSON.parse),
  };
}

async function observableApp(capture) {
  const app = Fastify({
    ...createObservabilityOptions('test', 'debug', capture.stream),
  });
  registerObservability(app);
  return app;
}

test('request correlation accepts only strict lowercase 32-hex identifiers', () => {
  const accepted = generateRequestId({
    headers: { 'x-request-id': FORWARDED_REQUEST_ID },
  });
  assert.equal(accepted, FORWARDED_REQUEST_ID);

  for (const rejected of [
    FORWARDED_REQUEST_ID.toUpperCase(),
    `${FORWARDED_REQUEST_ID}0`,
    'not-a-request-id',
  ]) {
    const generated = generateRequestId({ headers: { 'x-request-id': rejected } });
    assert.match(generated, /^[0-9a-f]{32}$/);
    assert.notEqual(generated, rejected);
  }
});

test('HTTP logs are correlated, structured and redact defensive sentinels', async (t) => {
  const capture = captureStream();
  const app = await observableApp(capture);
  t.after(() => app.close());

  const routeIdentifier = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const querySentinel = 'QUERY-SENTINEL';
  const sensitiveSentinels = {
    authorization: 'AUTHORIZATION-SENTINEL',
    cookie: 'COOKIE-SENTINEL',
    token: 'TOKEN-SENTINEL',
    userId: 'USER-ID-SENTINEL',
    password: 'PASSWORD-SENTINEL',
    proof: 'PROOF-SENTINEL',
    ciphertext: 'CIPHERTEXT-SENTINEL',
    signature: 'SIGNATURE-SENTINEL',
    recipients: 'RECIPIENTS-SENTINEL',
  };

  app.post('/probe/:id', async (request) => {
    request.log.info({
      event: 'defensive_redaction_probe',
      outcome: 'success',
      token: sensitiveSentinels.token,
      userId: sensitiveSentinels.userId,
      password: sensitiveSentinels.password,
      req: {
        headers: { authorization: sensitiveSentinels.authorization },
        body: {
          proof: sensitiveSentinels.proof,
          ciphertext: sensitiveSentinels.ciphertext,
          signature: sensitiveSentinels.signature,
          recipients: sensitiveSentinels.recipients,
        },
      },
    }, 'redaction probe');
    return { ok: true };
  });

  const response = await app.inject({
    method: 'POST',
    url: `/probe/${routeIdentifier}?cursor=${querySentinel}`,
    headers: {
      'x-request-id': FORWARDED_REQUEST_ID,
      authorization: sensitiveSentinels.authorization,
      cookie: sensitiveSentinels.cookie,
      'x-circlehaven-device-proof': sensitiveSentinels.proof,
    },
    payload: { ciphertext: sensitiveSentinels.ciphertext },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-request-id'], FORWARDED_REQUEST_ID);
  const output = capture.text();
  assert.doesNotMatch(output, new RegExp(routeIdentifier));
  assert.doesNotMatch(output, new RegExp(querySentinel));
  for (const sentinel of Object.values(sensitiveSentinels)) {
    assert.doesNotMatch(output, new RegExp(sentinel));
  }

  const records = capture.records();
  assert.ok(records.length >= 2);
  for (const record of records) {
    assert.equal(record.schemaVersion, 1);
    assert.equal(record.service, 'messaging');
    assert.equal(record.environment, 'test');
  }
  const completed = records.filter((record) => record.event === 'http_request_completed');
  assert.equal(completed.length, 1);
  assert.equal(completed[0].requestId, FORWARDED_REQUEST_ID);
  assert.equal(completed[0].method, 'POST');
  assert.equal(completed[0].route, '/probe/:id');
  assert.equal(completed[0].statusCode, 200);
  assert.equal(completed[0].outcome, 'success');
  assert.equal(typeof completed[0].durationMs, 'number');
});

test('a real listen emits only the explicit structured startup event', async (t) => {
  const capture = captureStream();
  const app = await observableApp(capture);
  t.after(() => app.close());

  await app.listen({ port: 0, host: '127.0.0.1' });
  app.log.info({ event: 'service_started', outcome: 'success' }, 'ignored free text');

  assert.equal(capture.records().length, 1);
  assert.equal(capture.records()[0].event, 'service_started');
  assert.equal(capture.records()[0].msg, 'service_started');
  assert.doesNotMatch(capture.text(), /127\.0\.0\.1|Server listening|ignored free text/);
});

test('an unstructured internal logger error keeps only a generic signal', async (t) => {
  const sentinel = 'INTERNAL-LOGGER-SECRET-SENTINEL';
  const capture = captureStream();
  const app = await observableApp(capture);
  t.after(() => app.close());

  app.log.error(Object.assign(new Error(sentinel), { detail: sentinel }));

  assert.equal(capture.records().length, 1);
  assert.equal(capture.records()[0].event, 'runtime_internal_error');
  assert.equal(capture.records()[0].errorType, 'Error');
  assert.doesNotMatch(capture.text(), new RegExp(sentinel));
});

test('health requests are correlated in the response without lifecycle log noise', async (t) => {
  const capture = captureStream();
  const app = await observableApp(capture);
  t.after(() => app.close());
  app.get('/health', async () => ({ ok: true }));

  const response = await app.inject({ method: 'GET', url: '/health' });

  assert.equal(response.statusCode, 200);
  assert.match(response.headers['x-request-id'], /^[0-9a-f]{32}$/);
  assert.equal(capture.records().filter((record) =>
    record.event === 'http_request_completed' || record.event === 'http_request_error').length, 0);
});

test('server errors return a generic response and never log the raw error', async (t) => {
  const capture = captureStream();
  const app = await observableApp(capture);
  t.after(() => app.close());
  const secretMessage = 'DATABASE-SECRET-SENTINEL';
  app.get('/failure', async () => {
    throw Object.assign(new Error(secretMessage), { code: 'ECONNREFUSED' });
  });

  const response = await app.inject({ method: 'GET', url: '/failure' });

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.json(), {
    error: 'internal_server_error',
    requestId: response.headers['x-request-id'],
  });
  assert.doesNotMatch(capture.text(), new RegExp(secretMessage));
  const failure = capture.records().find((record) => record.event === 'http_request_error');
  assert.equal(failure.method, 'GET');
  assert.equal(failure.route, '/failure');
  assert.equal(failure.statusCode, 500);
  assert.equal(failure.errorType, 'Error');
  assert.equal(failure.errorCode, 'dependency_unavailable');
});

test('Socket task failures are sanitized and answer exactly once', async () => {
  const emitted = [];
  const acknowledged = [];
  const logged = [];
  const respond = createAckResponder(
    { emit: (event, response) => emitted.push({ event, response }) },
    'conv:subscribe',
    (response) => acknowledged.push(response),
  );

  await observeSocketTask(
    { error: (fields, message) => logged.push({ fields, message }) },
    'conv:subscribe',
    async () => {
      throw new Error('SOCKET-PAYLOAD-SENTINEL');
    },
    () => respond({ success: false, error: 'internal_error' }),
  );

  assert.deepEqual(acknowledged, [{ success: false, error: 'internal_error' }]);
  assert.deepEqual(emitted, [{
    event: 'conv:subscribe',
    response: { success: false, error: 'internal_error' },
  }]);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].fields.event, 'socket_event_failed');
  assert.equal(logged[0].fields.socketEvent, 'conv:subscribe');
  assert.doesNotMatch(JSON.stringify(logged), /SOCKET-PAYLOAD-SENTINEL/);
});

test('Socket failure response errors cannot recreate an unhandled rejection', async () => {
  const logged = [];
  await assert.doesNotReject(observeSocketTask(
    { error: (fields, message) => logged.push({ fields, message }) },
    'typing:start',
    async () => { throw new Error('TASK-SECRET-SENTINEL'); },
    () => { throw new Error('RESPONSE-SECRET-SENTINEL'); },
  ));
  assert.deepEqual(logged.map(({ fields }) => fields.event), [
    'socket_event_failed',
    'socket_failure_response_failed',
  ]);
  assert.doesNotMatch(JSON.stringify(logged), /SECRET-SENTINEL/);
});

test('Socket correlation uses a server-generated identifier without business bindings', () => {
  const childBindings = [];
  const childLogger = {};
  const logger = {
    child: (bindings) => {
      childBindings.push(bindings);
      return childLogger;
    },
  };

  const correlated = socketLogger(logger, {
    headers: { 'x-request-id': FORWARDED_REQUEST_ID },
  });

  assert.equal(correlated.log, childLogger);
  assert.match(correlated.connectionId, /^[0-9a-f]{32}$/);
  assert.equal(correlated.requestId, FORWARDED_REQUEST_ID);
  assert.deepEqual(childBindings, [{
    connectionId: correlated.connectionId,
    requestId: FORWARDED_REQUEST_ID,
  }]);
});

test('error codes are mapped through a closed allowlist', () => {
  const output = safeStartupFailure(
    'staging',
    Object.assign(new Error('secret'), { code: 'PASSWORD_SECRET' }),
  );
  assert.equal(JSON.parse(output).errorCode, undefined);
  assert.doesNotMatch(output, /PASSWORD_SECRET/);
});

test('startup failures are structured and disclose only a safe configuration field', () => {
  const sentinel = 'postgresql://user:PASSWORD-SENTINEL@example.invalid/db';
  const output = safeStartupFailure(
    'staging',
    new Error(`Invalid configuration: DATABASE_URL ${sentinel}`),
  );
  const record = JSON.parse(output);
  assert.equal(record.event, 'startup_failed');
  assert.equal(record.configurationField, 'DATABASE_URL');
  assert.equal(record.errorType, 'Error');
  assert.doesNotMatch(output, /PASSWORD-SENTINEL/);
});

test('runtime sources do not bypass structured logging with console calls', async () => {
  const sourceRoot = new URL('../src/', import.meta.url);
  const runtimeFiles = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === 'tools') continue;
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
