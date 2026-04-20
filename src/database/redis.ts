import Redis from 'ioredis';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('redis');

const redis = new Redis({
  sentinels: [
    { host: process.env.REDIS_SENTINEL_HOST_1 || '10.1.159.180', port: parseInt(process.env.REDIS_SENTINEL_PORT || '6380') },
    { host: process.env.REDIS_SENTINEL_HOST_2 || '10.1.159.181', port: parseInt(process.env.REDIS_SENTINEL_PORT || '6380') },
    { host: process.env.REDIS_SENTINEL_HOST_3 || '10.1.159.182', port: parseInt(process.env.REDIS_SENTINEL_PORT || '6380') },
  ],
  name: process.env.REDIS_SENTINEL_NAME || 'redis6379',
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || 'IgGUL5edBPYPIA+o',
  password: process.env.REDIS_PASSWORD || 'IgGUL5edBPYPIA+o',
  ...(process.env.REDIS_TLS === 'true' ? { tls: { rejectUnauthorized: false }, sentinelTLS: { rejectUnauthorized: false } } : {}),
  retryStrategy: (times) => Math.min(times * 500, 5000),
  enableReadyCheck: true,
});

redis.on('connect', () => logger.info('Redis 连接成功'));
redis.on('error', (err) => logger.error('Redis 连接异常', { error: err.message }));

export default redis;
