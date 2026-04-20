import { BizAdapter } from './adapter.interface';
import { buildAdapterFromRow, AdapterRegistryRow } from './dynamic.adapter';
import { query } from '../database/pool';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('adapter-registry');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5分钟

interface CacheEntry {
  adapter: BizAdapter;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * 根据 system_id + svc_cd 从数据库加载适配器，结果缓存 5 分钟
 * svc_cd 为空时（直连调用）默认为 ''
 * 返回 null 表示未注册或已禁用
 */
export async function getAdapter(systemId: string, svcCd: string = ''): Promise<BizAdapter | null> {
  const cacheKey = `${systemId}:${svcCd}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.adapter;
  }

  try {
    const result = await query<AdapterRegistryRow>(
      `SELECT system_id, svc_cd, display_name, agent_url, form_schema, response_map
       FROM adapter_registry
       WHERE system_id = $1 AND svc_cd = $2 AND enabled = TRUE`,
      [systemId, svcCd]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const adapter = buildAdapterFromRow(result.rows[0]);
    cache.set(cacheKey, { adapter, expiresAt: now + CACHE_TTL_MS });
    logger.info('适配器已加载', { systemId, svcCd });
    return adapter;
  } catch (err) {
    logger.error('适配器加载失败', { systemId, svcCd, error: (err as Error).message });
    return null;
  }
}
