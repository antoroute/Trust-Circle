import type { FastifyPluginAsync } from 'fastify';

import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { loadConfig } from './config.js';
import { assertAccessClaims, registerJwt } from './security/jwt.js';
import dbPlugin from './plugins/db.js';
import enforceVersion from './middlewares/enforceVersion.js';
import authRoutes from './routes/auth.js';
import { corsOptions } from './httpSecurity.js';

const AUTH_BODY_LIMIT_BYTES = 16 * 1024;

async function build() {
  const config = loadConfig();
  const app = Fastify({
    logger: true,
    bodyLimit: AUTH_BODY_LIMIT_BYTES,
    ajv: { customOptions: { removeAdditional: false } },
    trustProxy: config.trustedProxyCidrs.length > 0 ? [...config.trustedProxyCidrs] : false,
  });

  await app.register(fastifyHelmet, { contentSecurityPolicy: false });
  await app.register(fastifyCors, corsOptions(config));
  const rateLimitPlugin = rateLimit as unknown as FastifyPluginAsync<{
    max: number;
    timeWindow: string;
    enableDraftSpec: boolean;
  }>;
  await app.register(rateLimitPlugin, {
    max: 300,
    timeWindow: '1 minute',
    enableDraftSpec: true,
  });

  await registerJwt(
    app,
    config.jwtAccessPrivateKey,
    config.jwtAccessPublicKey,
    config.jwtRefreshSecret,
  );

  app.decorate('authenticate', async (req: any, reply: any) => {
    try {
      const payload = await req.jwtVerify();
      req.user = assertAccessClaims(payload);
    } catch {
      await reply.code(401).send({ error: 'unauthorized' });
    }
  });

  await app.register(dbPlugin, { connectionString: config.databaseUrl });

  app.get('/health', async () => ({ ok: true }));

  await app.register(enforceVersion);
  await app.register(authRoutes, { prefix: '/auth' });

  await app.listen({ port: config.port, host: '0.0.0.0' });
}
build().catch((e) => { console.error(e); process.exit(1); });
