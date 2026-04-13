import axios from 'axios';
import config from '../config';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('callback');

/**
 * 报告结构化对象（回调成功时的 msg 格式）
 * 排除案例: 只有 analysis_report 有内容
 * 风险案例: 四个字段都有内容
 */
export interface ReportMsg {
  customer_behavior_analysis: string;
  account_transaction_analysis: string;
  doubtful_point_analysis: string;
  analysis_report: string;
}

/**
 * 回调请求体（按接口文档 v1.0 格式）
 * 成功: { request_id, system_id, request_type, msg: { 4个分析字段 }, report_create_time }
 * 失败: { request_id, system_id, request_type, msg: "失败原因", report_create_time: null }
 */
export interface CallbackPayload {
  request_id: string;
  system_id: string;
  request_type: string;
  msg: ReportMsg | string;
  report_create_time: string | null;
}

/**
 * 上游回调响应格式
 * code=0 表示接收成功，code=1 表示接收失败
 */
interface CallbackResponse {
  code: number;
  msg: string;
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const callbackService = {
  /**
   * 通知上游系统（带重试机制）
   * 成功回调: msg 为结构化报告对象，report_create_time 为当前时间
   * 失败回调: msg 为失败原因字符串，report_create_time 为 null
   */
  async notifyDownstream(
    callbackUrl: string,
    requestId: string,
    systemId: string,
    requestType: string,
    report: ReportMsg | null,
    errorMsg: string | null
  ): Promise<void> {
    if (!callbackUrl) {
      logger.debug('callback_url 为空，跳过回调通知', { requestId });
      return;
    }

    const isSuccess = report !== null;
    const payload: CallbackPayload = {
      request_id: requestId,
      system_id: systemId,
      request_type: requestType,
      msg: isSuccess ? report : (errorMsg || '未知错误'),
      report_create_time: isSuccess ? formatTimestamp() : null,
    };

    const maxRetries = config.callback.retryMax;
    const retryIntervals = config.callback.retryIntervals;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post<CallbackResponse>(callbackUrl, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: config.callback.timeoutMs,
        });

        const respData = response.data;

        // 上游返回 code=0 表示接收成功
        if (respData && respData.code === 0) {
          logger.info('回调通知成功', { requestId, url: callbackUrl, attempt });
          return;
        }

        // 上游返回 code!=0，视为业务拒绝，记录后重试
        logger.warn('回调被上游拒绝', {
          requestId,
          url: callbackUrl,
          attempt,
          respCode: respData?.code,
          respMsg: respData?.msg,
        });
      } catch (err) {
        logger.warn('回调请求失败', {
          requestId,
          url: callbackUrl,
          attempt,
          error: (err as Error).message,
        });
      }

      // 最后一次不再等待
      if (attempt < maxRetries) {
        const waitMs = retryIntervals[attempt] || retryIntervals[retryIntervals.length - 1];
        logger.info('回调重试等待', { requestId, attempt: attempt + 1, waitMs });
        await sleep(waitMs);
      }
    }

    logger.error('回调最终失败，已达最大重试次数', {
      requestId,
      url: callbackUrl,
      maxRetries,
    });
  },
};
