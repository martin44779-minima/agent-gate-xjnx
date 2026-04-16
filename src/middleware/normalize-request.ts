import { Request, Response, NextFunction } from 'express';

/**
 * ESB 包裹格式解包中间件
 *
 * ESB 转发时会将业务参数包装在 body 字段内，并附带 sysHead 系统头：
 * { "sysHead": { ... }, "body": { requestId, requestType, systemId, callbackUrl, form } }
 *
 * 此中间件检测到该格式后，自动解包并转换为内部 snake_case 格式，
 * 使下游 controller/schema 无需感知 ESB 包装。
 */
export function normalizeRequestBody(req: Request, _res: Response, next: NextFunction): void {
  // 仅当存在 sysHead + body 且没有直连字段时才解包
  if (req.body && req.body.sysHead && req.body.body && !req.body.request_id) {
    const inner = req.body.body;
    req.body = {
      request_id: inner.requestId,
      request_type: inner.requestType,
      system_id: inner.systemId,
      callback_url: inner.callbackUrl,
      form: inner.form,
    };
  }
  next();
}
