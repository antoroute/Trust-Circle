import type { FastifyCorsOptions } from '@fastify/cors';

import type { ServiceConfig } from './config.js';

const CORS_METHODS = ['GET', 'POST', 'OPTIONS'];
const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'X-App-Secret',
  'X-Client-Version',
  'X-Circlehaven-Device-Id',
  'X-Circlehaven-Device-Key-Version',
  'X-Circlehaven-Device-Proof',
];

export function corsOptions(config: ServiceConfig): FastifyCorsOptions {
  const allowedOrigins = new Set(config.corsAllowedOrigins);
  return {
    origin(origin, callback) {
      // Native clients do not send Origin. They remain usable, without CORS headers.
      callback(null, origin !== undefined && allowedOrigins.has(origin) ? origin : false);
    },
    credentials: false,
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    maxAge: 600,
    strictPreflight: true,
  };
}
