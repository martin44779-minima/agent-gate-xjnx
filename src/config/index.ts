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
    port: parseInt(optionalEnv('DB_PORT', '5432'), 10),
    user: requiredEnv('DB_USER'),
    password: requiredEnv('DB_PASSWORD'),
    database: requiredEnv('DB_NAME'),
    max: parseInt(optionalEnv('DB_MAX_CONNECTIONS', '20'), 10),
  },
  agent: {
    baseUrl: requiredEnv('AW_AGENT_BASE_URL'),
    apiKey: requiredEnv('AW_API_KEY'),
    agentId: requiredEnv('AW_AGENT_ID'),
    timeoutMs: parseInt(optionalEnv('AW_TIMEOUT_MS', '60000'), 10),
  },
  retry: {
    maxRetries: parseInt(optionalEnv('RETRY_MAX', '3'), 10),
    intervalMs: parseInt(optionalEnv('RETRY_INTERVAL_MS', '30000'), 10),
  },
  callback: {
    url: process.env.DOWNSTREAM_CALLBACK_URL || '',
    timeoutMs: parseInt(optionalEnv('CALLBACK_TIMEOUT_MS', '10000'), 10),
  },
  security: {
    apiKeys: optionalEnv('ALLOWED_API_KEYS', '').split(',').filter(Boolean),
    ipWhitelist: optionalEnv('IP_WHITELIST', '').split(',').filter(Boolean),
    signatureSecret: optionalEnv('SIGNATURE_SECRET', ''),
  },
};

export default config;
