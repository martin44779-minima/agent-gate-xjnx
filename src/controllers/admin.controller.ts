import { Request, Response, NextFunction } from 'express';
import { AdapterRegistryRow } from '../adapters/dynamic.adapter';
import { setAdapter, deleteAdapter, listAdapters } from '../adapters';

/**
 * GET /admin/adapters
 * 列出所有已注册的适配器（不含 schema 详情）
 */
export async function listAdaptersController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const list = await listAdapters();
    res.json({ code: 0, data: list });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/adapters
 * 新增或更新一条适配器记录
 */
export async function upsertAdapterController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { system_id, svc_cd = '', display_name, agent_url, form_schema, response_map } = req.body;

    if (!system_id || !agent_url || !form_schema || !response_map) {
      res.status(400).json({ code: 1, msg: '缺少必填字段：system_id、agent_url、form_schema、response_map' });
      return;
    }

    const row: AdapterRegistryRow = {
      system_id,
      svc_cd,
      display_name,
      agent_url,
      form_schema,
      response_map,
    };

    await setAdapter(row);
    res.json({ code: 0, msg: '适配器注册成功', data: { system_id, svc_cd } });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /admin/adapters
 * 删除一条适配器记录
 */
export async function deleteAdapterController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { system_id, svc_cd = '' } = req.body;

    if (!system_id) {
      res.status(400).json({ code: 1, msg: '缺少必填字段：system_id' });
      return;
    }

    await deleteAdapter(system_id, svc_cd);
    res.json({ code: 0, msg: '适配器已删除', data: { system_id, svc_cd } });
  } catch (err) {
    next(err);
  }
}
