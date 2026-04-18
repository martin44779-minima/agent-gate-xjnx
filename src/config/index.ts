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
    /** AW 智能体兜底 URL，优先使用 adapter_registry 中各业务配置的 agent_url */
    baseUrl: optionalEnv('AW_AGENT_URL', ''),
    timeoutMs: parseInt(optionalEnv('AW_TIMEOUT_MS', '600000'), 10),
  },
  retry: {
    maxRetries: parseInt(optionalEnv('RETRY_MAX', '3'), 10),
    intervalMs: parseInt(optionalEnv('RETRY_INTERVAL_MS', '30000'), 10),
  },
  callback: {
    timeoutMs: parseInt(optionalEnv('CALLBACK_TIMEOUT_MS', '10000'), 10),
    retryMax: parseInt(optionalEnv('CALLBACK_RETRY_MAX', '3'), 10),
    retryIntervals: optionalEnv('CALLBACK_RETRY_INTERVALS', '10000,30000,60000').split(',').map(Number),
    esbEnabled: optionalEnv('ESB_CALLBACK_ENABLED', 'false') === 'true',
  },
  esb: {
    cnsmrSysNoInd: optionalEnv('ESB_CNSMR_SYS_NO_IND', 'LMAP'),
    orgnlCnsmrSysNo: optionalEnv('ESB_ORGNL_CNSMR_SYS_NO', 'LMAP'),
    callbackBaseUrl: optionalEnv('ESB_CALLBACK_BASE_URL', ''),
    callbackSvcCd: optionalEnv('ESB_CALLBACK_SVC_CD', '40012N0011'),
  },
  security: {
    authEnabled: optionalEnv('AUTH_ENABLED', 'false') === 'true',
    apiKeys: optionalEnv('ALLOWED_API_KEYS', '').split(',').filter(Boolean),
    ipWhitelist: optionalEnv('IP_WHITELIST', '').split(',').filter(Boolean),
    signatureSecret: optionalEnv('SIGNATURE_SECRET', ''),
  },
  rateLimit: {
    windowMs: parseInt(optionalEnv('RATE_LIMIT_WINDOW_MS', '60000'), 10),
    max: parseInt(optionalEnv('RATE_LIMIT_MAX', '60'), 10),
  },
};

export default config;
