import type { FastifyCorsOptions } from '@fastify/cors';

export function corsOptions(allowedOrigins: readonly string[]): FastifyCorsOptions {
  const exactOrigins = new Set(allowedOrigins);
  return {
    origin(origin, callback) {
      callback(null, origin !== undefined && exactOrigins.has(origin) ? origin : false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'X-Client-Version',
      'X-Circlehaven-Device-Id',
      'X-Circlehaven-Device-Key-Version',
      'X-Circlehaven-Device-Proof',
    ],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    maxAge: 600,
    strictPreflight: true,
  };
}
