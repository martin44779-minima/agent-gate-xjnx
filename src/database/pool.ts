import { Pool, PoolClient, QueryResult } from 'pg-opengauss';
import config from '../config';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('database');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.max,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('connect', (client) => {
  // 设置 search_path 以支持 GaussDB schema
  if (config.db.schema && config.db.schema !== 'public') {
    client.query(`SET search_path TO ${config.db.schema}, public`).catch((err) => {
      logger.error('设置search_path失败', { error: err.message });
    });
  }
});

pool.on('error', (err) => {
  logger.error('数据库连接池异常', { error: err.message });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function query<T extends Record<string, any> = Record<string, any>>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query<T>(text, params);
  const duration = Date.now() - start;
  logger.debug('SQL执行', { text: text.slice(0, 100), duration, rows: result.rowCount });
  return result;
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('数据库连接池已关闭');
}

export default pool;
