import { BizAdapter } from './adapter.interface';
import { buildAdapterFromRow, AdapterRegistryRow } from './dynamic.adapter';
import redis from '../database/redis';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('adapter-registry');

const REDIS_KEY_PREFIX = 'adapter:';

function redisKey(systemId: string, svcCd: string): string {
  return `${REDIS_KEY_PREFIX}${systemId}:${svcCd}`;
}

/**
 * 根据 system_id + svc_cd 从 Redis 加载适配器
 * svc_cd 为空时（直连调用）默认为 ''
 * 返回 null 表示未注册
 */
export async function getAdapter(systemId: string, svcCd: string = ''): Promise<BizAdapter | null> {
  try {
    const raw = await redis.get(redisKey(systemId, svcCd));
    if (!raw) return null;

    const row = JSON.parse(raw) as AdapterRegistryRow;
    return buildAdapterFromRow(row);
  } catch (err) {
    logger.error('适配器加载失败', { systemId, svcCd, error: (err as Error).message });
    return null;
  }
}

/**
 * 写入或更新一条适配器记录到 Redis（永久持久化，无 TTL）
 */
export async function setAdapter(row: AdapterRegistryRow): Promise<void> {
  await redis.set(redisKey(row.system_id, row.svc_cd), JSON.stringify(row));
  logger.info('适配器已写入', { systemId: row.system_id, svcCd: row.svc_cd });
}

/**
 * 删除一条适配器记录
 */
export async function deleteAdapter(systemId: string, svcCd: string = ''): Promise<void> {
  await redis.del(redisKey(systemId, svcCd));
  logger.info('适配器已删除', { systemId, svcCd });
}

/**
 * 列出所有已注册的适配器（仅返回元数据，不含 form_schema 和 response_map）
 */
export async function listAdapters(): Promise<Pick<AdapterRegistryRow, 'system_id' | 'svc_cd' | 'display_name' | 'agent_url'>[]> {
  const keys = await redis.keys(`${REDIS_KEY_PREFIX}*`);
  if (keys.length === 0) return [];

  const raws = await redis.mget(...keys);
  return raws
    .filter((r): r is string => r !== null)
    .map((r) => {
      const row = JSON.parse(r) as AdapterRegistryRow;
      return {
        system_id: row.system_id,
        svc_cd: row.svc_cd,
        display_name: row.display_name,
        agent_url: row.agent_url,
      };
    });
}
