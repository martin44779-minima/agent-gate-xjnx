import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function requiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    console.error(`[CONFIG] 缺少必填环境变量: ${key}`);
    process.exit(1);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

const config = {
  server: {
    port: parseInt(optionalEnv('PORT', '3000'), 10),
    env: optionalEnv('NODE_ENV', 'development'),
  },
  db: {
    host: requiredEnv('DB_HOST'),
    port: parseInt(optionalEnv('DB_PORT', '8000'), 10),
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASSWORD'),
    database: requiredEnv('DB_NAME'),
    schema: optionalEnv('DB_SCHEMA', 'public'),
    max: parseInt(optionalEnv('DB_MAX_CONNECTIONS', '20'), 10),
  },
  agent: {
    /** AW 智能体完整 URL（flowise prediction 端点） */
    baseUrl: requiredEnv('AW_AGENT_URL'),
    timeoutMs: parseInt(optionalEnv('AW_TIMEOUT_MS', '120000'), 10),
  },
  retry: {
    maxRetries: parseInt(optionalEnv('RETRY_MAX', '3'), 10),
    intervalMs: parseInt(optionalEnv('RETRY_INTERVAL_MS', '30000'), 10),
  },
  callback: {
    timeoutMs: parseInt(optionalEnv('CALLBACK_TIMEOUT_MS', '10000'), 10),
  },
  security: {
    authEnabled: optionalEnv('AUTH_ENABLED', 'false') === 'true',
    apiKeys: optionalEnv('ALLOWED_API_KEYS', '').split(',').filter(Boolean),
    ipWhitelist: optionalEnv('IP_WHITELIST', '').split(',').filter(Boolean),
    signatureSecret: optionalEnv('SIGNATURE_SECRET', ''),
  },
};

export default config;
