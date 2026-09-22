import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Writable } from 'node:stream';

import {
  LogController,
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyRequest,
} from 'fastify';

export const LOG_LEVELS = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

const REQUEST_ID_PATTERN = /^[0-9a-f]{32}$/;
const SAFE_ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AggregateError',
]);
const SAFE_ERROR_CODES = new Map<string, string>([
  ['08001', 'database_unavailable'],
  ['08003', 'database_unavailable'],
  ['08006', 'database_unavailable'],
  ['23503', 'database_constraint'],
  ['23505', 'database_constraint'],
  ['23514', 'database_constraint'],
  ['40001', 'database_retryable'],
  ['40P01', 'database_retryable'],
  ['53300', 'database_unavailable'],
  ['57P01', 'database_unavailable'],
  ['ECONNREFUSED', 'dependency_unavailable'],
  ['ECONNRESET', 'dependency_unavailable'],
  ['ENOTFOUND', 'dependency_unavailable'],
  ['EPIPE', 'dependency_unavailable'],
  ['ETIMEDOUT', 'dependency_unavailable'],
]);
const CONFIGURATION_FIELDS = [
  'NODE_ENV',
  'JWT_ACCESS_PUBLIC_KEY_B64',
  'DATABASE_URL',
  'PORT',
  'CORS_ALLOWED_ORIGINS',
  'TRUSTED_PROXY_CIDRS',
  'LOG_LEVEL',
] as const;

const SAFE_EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
const SAFE_LOG_FIELDS = new Set([
  'event',
  'outcome',
  'method',
  'route',
  'statusCode',
  'durationMs',
  'socketEvent',
  'count',
  'memberCount',
  'recipientCount',
  'errorType',
  'errorCode',
  'configurationField',
]);

const SENSITIVE_FIELDS = [
  'authorization',
  'cookie',
  'email',
  'username',
  'userId',
  'accountId',
  'deviceId',
  'socketId',
  'groupId',
  'convId',
  'conversationId',
  'messageId',
  'senderId',
  'approverId',
  'memberId',
  'joinRequestId',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'proof',
  'deviceProof',
  'bootstrapGrant',
  'secret',
  'privateKey',
  'publicKey',
  'identityPublicKey',
  'eph_pub',
  'pk_sig',
  'pk_kem',
  'iv',
  'nonce',
  'ciphertext',
  'plaintext',
  'decryptedText',
  'signature',
  'sig',
  'salt',
  'wrappedKeys',
  'wrapped_keys',
  'recipients',
  'body',
  'payload',
  'data',
] as const;

export const LOGGER_REDACT_PATHS: readonly string[] = Object.freeze([
    ...SENSITIVE_FIELDS,
    'req.body',
    'request.body',
    'response.body',
    'req.headers.authorization',
    'req.headers.cookie',
    'request.headers.authorization',
    'request.headers.cookie',
    'headers.authorization',
    'headers.cookie',
    "req.headers['x-circlehaven-device-proof']",
    "request.headers['x-circlehaven-device-proof']",
    "headers['x-circlehaven-device-proof']",
    'response.access',
    'response.refresh',
    'response.grant',
    'err.message',
    'err.stack',
    'err.detail',
    'err.where',
    'err.query',
    'err.parameters',
  ]);

export function parseLogLevel(value: string | undefined): LogLevel {
  if (value === undefined) return 'info';
  if (value !== value.trim() || !(LOG_LEVELS as readonly string[]).includes(value)) {
    throw new Error('Invalid configuration: LOG_LEVEL is not supported');
  }
  return value as LogLevel;
}

export function generateRequestId(request: IncomingMessage): string {
  const header = request.headers['x-request-id'];
  return typeof header === 'string' && REQUEST_ID_PATTERN.test(header)
    ? header
    : randomUUID().replaceAll('-', '');
}

export function safeError(error: unknown): Readonly<{
  errorType: string;
  errorCode?: string;
}> {
  const candidate = error as { name?: unknown; code?: unknown } | null;
  const name = typeof candidate?.name === 'string' && SAFE_ERROR_TYPES.has(candidate.name)
    ? candidate.name
    : 'Error';
  const code = typeof candidate?.code === 'string'
    ? SAFE_ERROR_CODES.get(candidate.code)
    : undefined;
  return Object.freeze({
    errorType: name,
    ...(code === undefined ? {} : { errorCode: code }),
  });
}

export function createObservabilityOptions(
  environment: string,
  level: LogLevel,
  stream?: Writable,
) {
  return {
    logger: {
      level,
      base: {
        schemaVersion: 1,
        service: 'messaging',
        environment,
      },
      redact: {
        paths: [...LOGGER_REDACT_PATHS],
        remove: true,
      },
      serializers: {
        req: (request: FastifyRequest) => ({ method: request.method }),
        res: (reply: { statusCode?: number }) => ({ statusCode: reply.statusCode }),
        err: (error: unknown) => {
          const sanitized = safeError(error);
          return sanitized as unknown as {
            type: string;
            message: string;
            stack: string;
          };
        },
      },
      hooks: {
        logMethod(
          this: unknown,
          args: unknown[],
          method: (...values: unknown[]) => unknown,
          level: number,
        ) {
          const fields = args[0];
          if (
            typeof fields !== 'object' ||
            fields === null ||
            typeof (fields as Record<string, unknown>).event !== 'string' ||
            !SAFE_EVENT_NAME_PATTERN.test((fields as Record<string, unknown>).event as string)
          ) {
            if (level >= 40) {
              const event = level >= 50 ? 'runtime_internal_error' : 'runtime_internal_warning';
              method.apply(this, [{ event, outcome: 'failure', errorType: 'Error' }, event]);
            }
            return;
          }

          const sanitized = Object.fromEntries(
            Object.entries(fields).filter(([key]) => SAFE_LOG_FIELDS.has(key)),
          );
          method.apply(this, [sanitized, sanitized.event as string]);
        },
      },
      ...(stream === undefined ? {} : { stream }),
    },
    genReqId: generateRequestId,
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
  };
}

function isHealthRequest(request: FastifyRequest): boolean {
  return request.routeOptions?.url === '/health';
}

function routeTemplate(request: FastifyRequest): string {
  const route = request.routeOptions?.url;
  return typeof route === 'string' && route.length > 0 ? route : 'unmatched';
}

function statusOutcome(statusCode: number): 'success' | 'client_error' | 'server_error' {
  if (statusCode < 400) return 'success';
  if (statusCode < 500) return 'client_error';
  return 'server_error';
}

function errorStatusCode(error: unknown): number {
  const value = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : 500;
}

export function registerObservability(app: FastifyInstance): void {
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('x-request-id', request.id);
    done();
  });

  app.addHook('onError', (request, reply, error, done) => {
    if (!isHealthRequest(request)) {
      const httpStatusCode = errorStatusCode(error);
      const fields = {
        event: 'http_request_error',
        outcome: statusOutcome(httpStatusCode),
        method: request.method,
        route: routeTemplate(request),
        statusCode: httpStatusCode,
        ...safeError(error),
      };
      if (httpStatusCode >= 500) request.log.error(fields, 'HTTP request failed');
      else request.log.warn(fields, 'HTTP request refused');
    }
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    if (!isHealthRequest(request)) {
      request.log.info({
        event: 'http_request_completed',
        outcome: statusOutcome(reply.statusCode),
        method: request.method,
        route: routeTemplate(request),
        statusCode: reply.statusCode,
        durationMs: Number(reply.elapsedTime.toFixed(3)),
      }, 'HTTP request completed');
    }
    done();
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = errorStatusCode(error);
    if (statusCode >= 500) {
      return reply.code(500).send({
        error: 'internal_server_error',
        requestId: request.id,
      });
    }
    return reply.code(statusCode).send(error);
  });
}

export interface SocketTaskLogger {
  error(fields: Record<string, unknown>, message: string): unknown;
}

export async function observeSocketTask(
  logger: SocketTaskLogger,
  socketEvent: string,
  task: () => Promise<void>,
  onFailure: () => void,
): Promise<void> {
  try {
    await task();
  } catch (error) {
    logger.error({
      event: 'socket_event_failed',
      outcome: 'failure',
      socketEvent,
      ...safeError(error),
    }, 'Socket event failed');
    try {
      onFailure();
    } catch (responseError) {
      logger.error({
        event: 'socket_failure_response_failed',
        outcome: 'failure',
        socketEvent,
        ...safeError(responseError),
      }, 'Socket failure response failed');
    }
  }
}

export function safeStartupFailure(environment: string | undefined, error: unknown): string {
  const safeEnvironment = ['development', 'test', 'staging', 'production'].includes(environment ?? '')
    ? environment
    : 'unknown';
  return JSON.stringify({
    schemaVersion: 1,
    service: 'messaging',
    environment: safeEnvironment,
    level: 60,
    time: Date.now(),
    event: 'startup_failed',
    outcome: 'failure',
    configurationField: error instanceof Error
      ? CONFIGURATION_FIELDS.find((field) =>
        error.message.startsWith(`Invalid configuration: ${field}`))
      : undefined,
    ...safeError(error),
  });
}

export function socketLogger(
  logger: FastifyBaseLogger,
  request: IncomingMessage,
): { connectionId: string; requestId: string; log: FastifyBaseLogger } {
  const connectionId = randomUUID().replaceAll('-', '');
  const requestId = generateRequestId(request);
  return {
    connectionId,
    requestId,
    log: logger.child({ connectionId, requestId }),
  };
}

export type RequestLogger = Pick<FastifyBaseLogger, 'debug' | 'info' | 'warn' | 'error'>;
