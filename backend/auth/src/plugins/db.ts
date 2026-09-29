// ESM + NodeNext + 'pg' (CommonJS) : utiliser l'import par défaut puis destructurer.
import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import pg from 'pg';
const { Pool } = pg;

interface DbPluginOptions {
  connectionString: string;
}

const dbPlugin: FastifyPluginAsync<DbPluginOptions> = async (app, options) => {
  const pool = new Pool({
    connectionString: options.connectionString,
  });
  const readinessPool = new Pool({
    connectionString: options.connectionString,
    max: 1,
    connectionTimeoutMillis: 1_000,
    query_timeout: 1_000,
    idleTimeoutMillis: 60_000,
  });
  const reportPoolError = () => {
    app.log.error({
      event: 'database_pool_error',
      outcome: 'failure',
    }, 'PostgreSQL pool connection failed');
  };
  pool.on('error', reportPoolError);
  readinessPool.on('error', reportPoolError);

  app.decorate('db', {
    query: (q: string, p?: any[]) => pool.query(q, p),
    one: async (q: string, p?: any[]) => {
      const r = await pool.query(q, p);
      if (!r.rows.length) throw new Error('No rows');
      return r.rows[0];
    },
    maybeOne: async (q: string, p?: any[]) => {
      const r = await pool.query(q, p);
      return r.rows[0] ?? null;
    },
    any: async (q: string, p?: any[]) => (await pool.query(q, p)).rows,
    none: async (q: string, p?: any[]) => {
      await pool.query(q, p);
    },
    readiness: async () => {
      await readinessPool.query('SELECT 1');
    },
    poolStats: () => ({
      total: pool.totalCount,
      idle: pool.idleCount,
      waiting: pool.waitingCount,
    }),
  });

  app.addHook('onClose', async () => {
    await Promise.all([pool.end(), readinessPool.end()]);
  });
};

export default fp(dbPlugin);
