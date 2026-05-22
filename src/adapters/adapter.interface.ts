/**
 * 业务适配器接口
 * 每个业务（按 system_id 区分）实现该接口，负责：
 * - 入参 form 校验
 * - 组装发给 Flowise 的请求 payload
 * - 解析 Flowise 原始响应为回调 msg
 */
export interface BizAdapter {
  /** 校验 form 字段合法性，返回错误描述字符串或 null（通过） */
  validateForm(form: unknown): string | null;

  /** 组装发给 Flowise prediction 端点的请求体 */
  buildAgentPayload(form: unknown): unknown;

  /**
   * 解析 Flowise 原始响应为回调 msg 对象
   * 字段由各业务自行约定，网关透传不感知
   */
  parseResponse(raw: unknown): Record<string, string>;

  /**
   * 该业务对应的 Flowise 智能体 URL
   * 不填则使用全局配置 AW_AGENT_URL
   */
  agentUrl?: string;

  /**
   * ESB 回调时 sysHead.svcCd 的值（即回调目标接口编码）
   * 不填则回退到全局配置 ESB_CALLBACK_SVC_CD
   */
  callbackSvcCd?: string;
}
