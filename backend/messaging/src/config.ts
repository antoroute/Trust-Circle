import { createPublicKey } from 'node:crypto';
import { isIP } from 'node:net';

const SUPPORTED_ENVIRONMENTS = new Set(['development', 'test', 'staging', 'production']);
export interface ServiceConfig {
  nodeEnv: string;
  jwtAccessPublicKey: string;
  databaseUrl: string;
  port: number;
  corsAllowedOrigins: readonly string[];
  trustedProxyCidrs: readonly string[];
}

function requiredAccessPublicKey(env: NodeJS.ProcessEnv): string {
  const name = 'JWT_ACCESS_PUBLIC_KEY_B64';
  const value = requiredValue(env, name);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new Error(`Invalid configuration: ${name} must be canonical base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`Invalid configuration: ${name} must be canonical base64`);
  }
  const publicKeyValue = decoded.toString('utf8');
  try {
    const publicKey = createPublicKey(publicKeyValue);
    if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
  } catch {
    throw new Error(`Invalid configuration: ${name} must contain an Ed25519 public key`);
  }
  return publicKeyValue;
}

function requiredValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Invalid configuration: ${name} is required`);
  }
  if (value !== value.trim()) {
    throw new Error(`Invalid configuration: ${name} must not contain surrounding whitespace`);
  }
  return value;
}

function databaseUrl(env: NodeJS.ProcessEnv): string {
  const value = requiredValue(env, 'DATABASE_URL');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid configuration: DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('Invalid configuration: DATABASE_URL must use postgres or postgresql');
  }
  if (!parsed.hostname || !parsed.username || !parsed.password || parsed.pathname === '/') {
    throw new Error('Invalid configuration: DATABASE_URL must include host, database and credentials');
  }
  return value;
}

function port(env: NodeJS.ProcessEnv): number {
  const value = env.PORT;
  if (value === undefined) return 3001;
  if (!/^[0-9]+$/.test(value)) {
    throw new Error('Invalid configuration: PORT must be an integer between 1 and 65535');
  }
  const parsed = Number(value);
  if (parsed < 1 || parsed > 65535) {
    throw new Error('Invalid configuration: PORT must be an integer between 1 and 65535');
  }
  return parsed;
}

function commaSeparated(env: NodeJS.ProcessEnv, name: string): string[] {
  const rawValue = env[name];
  if (rawValue === undefined || rawValue === '') return [];
  if (rawValue !== rawValue.trim()) {
    throw new Error(`Invalid configuration: ${name} must not contain surrounding whitespace`);
  }
  const entries = rawValue.split(',');
  if (entries.some((entry) => entry.length === 0 || entry !== entry.trim())) {
    throw new Error(`Invalid configuration: ${name} must be a comma-separated list without whitespace`);
  }
  if (new Set(entries).size !== entries.length) {
    throw new Error(`Invalid configuration: ${name} must not contain duplicates`);
  }
  return entries;
}

function corsAllowedOrigins(env: NodeJS.ProcessEnv, nodeEnv: string): readonly string[] {
  return Object.freeze(commaSeparated(env, 'CORS_ALLOWED_ORIGINS').map((value) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error('Invalid configuration: CORS_ALLOWED_ORIGINS must contain absolute origins');
    }
    const localDevelopmentOrigin =
      (nodeEnv === 'development' || nodeEnv === 'test') &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      parsed.origin !== value ||
      parsed.username ||
      parsed.password ||
      !['http:', 'https:'].includes(parsed.protocol) ||
      (parsed.protocol === 'http:' && !localDevelopmentOrigin)
    ) {
      throw new Error('Invalid configuration: CORS_ALLOWED_ORIGINS must contain exact http(s) origins');
    }
    return value;
  }));
}

function trustedProxyCidrs(env: NodeJS.ProcessEnv, nodeEnv: string): readonly string[] {
  const values = commaSeparated(env, 'TRUSTED_PROXY_CIDRS');
  if ((nodeEnv === 'staging' || nodeEnv === 'production') && values.length === 0) {
    throw new Error('Invalid configuration: TRUSTED_PROXY_CIDRS is required in staging and production');
  }
  return Object.freeze(values.map((value) => {
    const slash = value.lastIndexOf('/');
    if (slash <= 0 || slash === value.length - 1) {
      throw new Error('Invalid configuration: TRUSTED_PROXY_CIDRS must contain CIDRs');
    }
    const address = value.slice(0, slash);
    const prefix = Number(value.slice(slash + 1));
    const family = isIP(address);
    if (!family || !Number.isInteger(prefix) || prefix < 0 || prefix > (family === 4 ? 32 : 128)) {
      throw new Error('Invalid configuration: TRUSTED_PROXY_CIDRS must contain valid CIDRs');
    }
    return value;
  }));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Readonly<ServiceConfig> {
  const nodeEnv = requiredValue(env, 'NODE_ENV');
  if (!SUPPORTED_ENVIRONMENTS.has(nodeEnv)) {
    throw new Error('Invalid configuration: NODE_ENV is not supported');
  }

  const jwtAccessPublicKey = requiredAccessPublicKey(env);
  return Object.freeze({
    nodeEnv,
    jwtAccessPublicKey,
    databaseUrl: databaseUrl(env),
    port: port(env),
    corsAllowedOrigins: corsAllowedOrigins(env, nodeEnv),
    trustedProxyCidrs: trustedProxyCidrs(env, nodeEnv),
  });
}
