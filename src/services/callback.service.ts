import axios from 'axios';
import config from '../config';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('callback');

/**
 * 回调请求体（按接口文档格式）
 * 成功: { case_id, success: true, msg: "报告原文", timestamp }
 * 失败: { case_id, success: false, msg: "失败原因", timestamp }
 */
export interface CallbackPayload {
  case_id: string;
  success: boolean;
  msg: string;
  timestamp: string;
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const callbackService = {
  /**
   * 通知下游系统（使用任务中存储的 callback_url）
   */
  async notifyDownstream(callbackUrl: string, caseId: string, success: boolean, msg: string): Promise<void> {
    if (!callbackUrl) {
      logger.debug('callback_url 为空，跳过回调通知', { caseId });
      return;
    }

    const payload: CallbackPayload = {
      case_id: caseId,
      success,
      msg,
      timestamp: formatTimestamp(),
    };

    try {
      await axios.post(callbackUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: config.callback.timeoutMs,
      });
      logger.info('下游回调通知成功', { caseId, url: callbackUrl, success });
    } catch (err) {
      logger.warn('下游回调通知失败', {
        caseId,
        url: callbackUrl,
        error: (err as Error).message,
      });
    }
  },
};
