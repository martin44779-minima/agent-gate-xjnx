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
 * sysHead.svcCd 作为接口编号单独提取为 svc_cd，与 system_id 联合定位适配器。
 *
 * 注意：callbackUrl 现在是文根路径（如 /aml-api/...），回调时需与 ESB_CALLBACK_BASE_URL 拼接
 */
export function normalizeRequestBody(req: Request, _res: Response, next: NextFunction): void {
  // 仅当存在 sysHead + body 且没有直连字段时才解包
  if (req.body && req.body.sysHead && req.body.body && !req.body.request_id) {
    const inner = req.body.body;
    req.body = {
      _esb_meta: { sysHead: req.body.sysHead },  // 内部元数据，不入库
      request_id: inner.requestId,
      request_type: inner.requestType,
      system_id: inner.systemId,
      svc_cd: req.body.sysHead.svcCd || '',
      callback_url: inner.callbackUrl,  // 文根路径，如 /aml-api/permitall/callback/ai/caseReport
      form: inner.form,
    };
  }
  next();
}
