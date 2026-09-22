import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Writable } from 'node:stream';

import {
  LogController,
  type FastifyInstance,
  type FastifyLoggerOptions,
} from 'fastify';

const CORRELATION_HEADER = 'X-Request-ID';
const FORWARDED_REQUEST_ID_PATTERN = /^[0-9a-f]{32}$/;
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
const SAFE_ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'SyntaxError',
  'AggregateError',
]);
const CONFIGURATION_KEYS = [
  'NODE_ENV',
  'JWT_ACCESS_PRIVATE_KEY_B64',
  'JWT_ACCESS_PUBLIC_KEY_B64',
  'JWT_REFRESH_SECRET',
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

const REDACTION_PATHS = [
  'authorization',
  'cookie',
  'password',
  'access',
  'accessToken',
  'refresh',
  'refreshToken',
  'token',
  'grant',
  'bootstrapGrant',
  'deviceProof',
  'proof',
  'secret',
  'privateKey',
  'publicKey',
  'signature',
  'nonce',
  'iv',
  'salt',
  'ciphertext',
  'wrappedKey',
  'wrappedKeys',
  'recipients',
  'plaintext',
  'content',
  'body',
  'payload',
  'data',
  'email',
  'username',
  'userId',
  'accountId',
  'deviceId',
  'socketId',
  'groupId',
  'conversationId',
  'messageId',
  'req.headers.authorization',
  'req.headers.cookie',
  "req.headers['x-circlehaven-device-proof']",
  'req.body.email',
  'req.body.username',
  'req.body.password',
  'req.body.accessToken',
  'req.body.refreshToken',
  'req.body.grant',
  'req.body.proof',
  'req.body.signature',
  'req.body.ciphertext',
  'req.body.wrappedKeys',
  'req.body.recipients',
  'request.headers.authorization',
  'request.headers.cookie',
  "request.headers['x-circlehaven-device-proof']",
  'request.body.email',
  'request.body.username',
  'request.body.password',
  'request.body.accessToken',
  'request.body.refreshToken',
  'request.body.grant',
  'request.body.proof',
  'request.body.signature',
  'request.body.ciphertext',
  'request.body.wrappedKeys',
  'request.body.recipients',
  "res.headers['set-cookie']",
  'response.access',
  'response.refresh',
  'response.grant',
  'response.user.email',
  'response.user.username',
  'err.message',
  'err.stack',
  'err.detail',
  'err.where',
  'err.query',
  'err.parameters',
  'err.internalQuery',
];

type ErrorWithMetadata = Error & {
  code?: unknown;
  statusCode?: unknown;
};

export interface SafeErrorFields {
  errorType: string;
  errorCode?: string;
}

type StructuredLoggerOptions = FastifyLoggerOptions & {
  base: Record<string, unknown>;
  redact: {
    paths: string[];
    remove: boolean;
  };
  hooks: {
    logMethod(
      this: unknown,
      args: unknown[],
      method: (...values: unknown[]) => unknown,
      level: number,
    ): void;
  };
};

export function requestIdFromHeader(request: IncomingMessage): string {
  const forwarded = request.headers['x-request-id'];
  if (typeof forwarded === 'string' && FORWARDED_REQUEST_ID_PATTERN.test(forwarded)) {
    return forwarded;
  }
  return randomUUID().replaceAll('-', '');
}

export function loggerOptions(
  environment: string,
  level: string,
  stream?: Writable,
): StructuredLoggerOptions {
  return {
    level,
    base: {
      schemaVersion: 1,
      service: 'auth',
      environment,
    },
    redact: {
      paths: REDACTION_PATHS,
      remove: true,
    },
    serializers: {
      req: (request) => ({
        method: request.method,
      }),
      res: (reply) => ({ statusCode: reply.statusCode }),
      // Fastify's type requires the unsafe default error shape. The runtime
      // serializer deliberately returns the smaller allowlisted contract.
      err: (error) => safeErrorFields(error) as unknown as {
        type: string;
        message: string;
        stack: string;
      },
    },
    hooks: {
      logMethod(args, method, level) {
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
  };
}

export function createObservabilityOptions(
  environment: string,
  level: string,
  stream?: Writable,
) {
  return {
    logger: loggerOptions(environment, level, stream),
    logController: new LogController({
      disableRequestLogging: true,
      requestIdLogLabel: 'requestId',
    }),
    genReqId: requestIdFromHeader,
  };
}

export function safeErrorFields(error: unknown): SafeErrorFields {
  if (!(error instanceof Error)) return { errorType: 'Error' };

  const metadata = error as ErrorWithMetadata;
  const candidateType = error.name;
  const fields: SafeErrorFields = {
    errorType: SAFE_ERROR_TYPES.has(candidateType) ? candidateType : 'Error',
  };
  if (typeof metadata.code === 'string') {
    const errorCode = SAFE_ERROR_CODES.get(metadata.code);
    if (errorCode !== undefined) fields.errorCode = errorCode;
  }
  return fields;
}

function statusCode(error: unknown): number {
  const candidate = error instanceof Error
    ? (error as ErrorWithMetadata).statusCode
    : undefined;
  return typeof candidate === 'number' &&
    Number.isInteger(candidate) &&
    candidate >= 400 &&
    candidate <= 599
    ? candidate
    : 500;
}

function requestOutcome(code: number): 'success' | 'client_error' | 'server_error' {
  if (code < 400) return 'success';
  return code < 500 ? 'client_error' : 'server_error';
}

function routeTemplate(request: { routeOptions?: { url?: string } }): string {
  const route = request.routeOptions?.url;
  return typeof route === 'string' && route.length > 0 ? route : 'unmatched';
}

export async function registerObservability(app: FastifyInstance): Promise<void> {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header(CORRELATION_HEADER, request.id);
    return payload;
  });

  app.addHook('onError', async (request, reply, error) => {
    const fields = {
      event: 'http_request_error',
      outcome: requestOutcome(statusCode(error)),
      method: request.method,
      route: routeTemplate(request),
      statusCode: statusCode(error),
      ...safeErrorFields(error),
    };
    if (statusCode(error) >= 500) {
      request.log.error(fields, 'HTTP request failed');
    } else {
      request.log.warn(fields, 'HTTP request rejected');
    }
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = routeTemplate(request);
    if (route === '/health') return;

    request.log.info({
      event: 'http_request_completed',
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 1_000) / 1_000,
      outcome: requestOutcome(reply.statusCode),
    }, 'HTTP request completed');
  });

  app.setErrorHandler((error, request, reply) => {
    const code = statusCode(error);
    if (code < 500) {
      return reply.code(code).send(error);
    }

    return reply.code(500).send({
      error: 'internal_server_error',
      requestId: request.id,
    });
  });
}

function configurationKey(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;
  return CONFIGURATION_KEYS.find((key) =>
    error.message.startsWith(`Invalid configuration: ${key}`),
  );
}

export function writeStartupFailure(error: unknown): void {
  const configuredEnvironment = process.env.NODE_ENV;
  const environment = ['development', 'test', 'staging', 'production'].includes(
    configuredEnvironment ?? '',
  ) ? configuredEnvironment : 'unknown';
  process.stderr.write(`${JSON.stringify({
    level: 60,
    time: Date.now(),
    schemaVersion: 1,
    service: 'auth',
    environment,
    event: 'startup_failed',
    outcome: 'failure',
    ...safeErrorFields(error),
    configurationField: configurationKey(error),
  })}\n`);
}
