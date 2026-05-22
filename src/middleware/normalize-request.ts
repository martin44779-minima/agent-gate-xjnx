import { Request, Response, NextFunction } from 'express';

/**
 * ESB 包裹格式解包中间件
 *
 * ESB 转发时会将业务参数包装在 body 字段内，并附带 sysHead 系统头：
 * { "sysHead": { ... }, "body": { requestId, requestType, systemId, callbackUrl, form } }
 *
 * 此中间件检测到该格式后，自动解包并转换为内部 snake_case 格式，
 * 同时保留 sysHead 到 _esb_meta（内部字段），供后续存储到 DB 和回调使用。
 *
 * callbackUrl 支持两种格式：
 *   - 纯字符串："/aml-api/callback"（直接使用）
 *   - JSON 字符串："{\"callbackUrl\":\"/aml-api/callback\",\"svcCd\":\"012345\"}"（提取 callbackUrl，svcCd 忽略）
 */
export function normalizeRequestBody(req: Request, _res: Response, next: NextFunction): void {
  // 仅当存在 sysHead + body 且没有直连字段时才解包
  if (req.body && req.body.sysHead && req.body.body && !req.body.request_id) {
    const inner = req.body.body;

    let callbackUrl: string = inner.callbackUrl || '';
    try {
      const parsed = JSON.parse(inner.callbackUrl);
      if (parsed && typeof parsed === 'object' && parsed.callbackUrl) {
        callbackUrl = parsed.callbackUrl;
        // svcCd 不再用于适配器路由，忽略
      }
    } catch {
      // 非 JSON 格式，保持原值
    }

    req.body = {
      _esb_meta: { sysHead: req.body.sysHead },
      request_id: inner.requestId,
      request_type: inner.requestType,
      system_id: inner.systemId,
      callback_url: callbackUrl,
      form: inner.form,
    };
  }
  next();
}
