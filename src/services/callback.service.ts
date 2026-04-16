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
 * 直连回调请求体（snake_case 平铺）
 */
export interface CallbackPayload {
  request_id: string;
  system_id: string;
  request_type: string;
  msg: ReportMsg | string;
  report_create_time: string | null;
}

/**
 * ESB 回调请求体（{ sysHead, body } 包裹，body 内驼峰）
 */
interface EsbCallbackPayload {
  sysHead: Record<string, unknown>;
  body: {
    requestId: string;
    systemId: string;
    requestType: string;
    msg: ReportMsg | string;
    reportCreateTime: string | null;
  };
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

function formatDateTimeCompact(): { date: string; time: string; full: string } {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const full = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return { date, time, full };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 构建 ESB sysHead（混合来源：配置项 + 上游传入 + 环境变量 + 动态生成）
 */
function buildEsbSysHead(
  upstreamSysHead: Record<string, unknown> | null,
  cnsmrSysNo: string | null
): Record<string, unknown> {
  const now = formatDateTimeCompact();
  const cnsmrSrlNo = `AI_${cnsmrSysNo || 'unknown'}_${now.date}${now.time}`;

  return {
    // svcCd 从配置项获取
    svcCd: config.esb.callbackSvcCd,
    scnCd: upstreamSysHead?.scnCd || '',
    chnlTp: upstreamSysHead?.chnlTp || '',
    lglPrsnCd: '',
    branchId: upstreamSysHead?.branchId || '',
    tlrNo: upstreamSysHead?.tlrNo || '',
    cnsmrSysNoInd: config.esb.cnsmrSysNoInd,
    cnsmrSysNo: upstreamSysHead?.cnsmrSysNo || '',
    orgnlCnsmrSysNo: config.esb.orgnlCnsmrSysNo,
    txnDt: now.date,
    txnTm: now.time,
    cnsmrSrlNo,
    glblSrlNo: upstreamSysHead?.glblSrlNo || '',
    tmlIdNo: upstreamSysHead?.tmlIdNo || '',
    mac: upstreamSysHead?.mac || '',
    sgntrVerfSgntr: upstreamSysHead?.sgntrVerfSgntr || '',
    stdIntfVerNo: upstreamSysHead?.stdIntfVerNo || '',
    usrLng: upstreamSysHead?.usrLng || '',
    fileFlg: upstreamSysHead?.fileFlg || '',
    filePath: upstreamSysHead?.filePath || '',
    sysPrestoreFlgStrg: upstreamSysHead?.sysPrestoreFlgStrg || '',
    sysPrestoreCharStrg: upstreamSysHead?.sysPrestoreCharStrg || '',
  };
}

/**
 * 构建完整的回调 URL
 * ESB 模式: ESB_CALLBACK_BASE_URL + callbackPath
 * 直连模式: 直接返回 callbackPath（此时应为完整 URL）
 */
function buildCallbackUrl(callbackPath: string | null): string | null {
  if (!callbackPath) return null;

  if (config.callback.esbEnabled && config.esb.callbackBaseUrl) {
    // 拼接 base URL + 文根路径
    const base = config.esb.callbackBaseUrl.replace(/\/$/, '');
    const path = callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`;
    return `${base}${path}`;
  }

  return callbackPath;
}

export const callbackService = {
  /**
   * 通知上游系统（带重试机制）
   * 成功回调: msg 为结构化报告对象，report_create_time 为当前时间
   * 失败回调: msg 为失败原因字符串，report_create_time 为 null
   */
  async notifyDownstream(
    callbackPath: string,
    requestId: string,
    systemId: string,
    requestType: string,
    report: ReportMsg | null,
    errorMsg: string | null,
    esbSysHead?: Record<string, unknown> | null,
    cnsmrSysNo?: string | null
  ): Promise<void> {
    // 构建完整回调 URL
    const callbackUrl = buildCallbackUrl(callbackPath);
    if (!callbackUrl) {
      logger.debug('callback_path 为空，跳过回调通知', { requestId });
      return;
    }

    const isSuccess = report !== null;
    const reportCreateTime = isSuccess ? formatTimestamp() : null;
    const msg = isSuccess ? report : (errorMsg || '未知错误');

    // 根据配置决定输出格式
    const payload: CallbackPayload | EsbCallbackPayload = config.callback.esbEnabled
      ? {
          sysHead: buildEsbSysHead(esbSysHead || null, cnsmrSysNo || null),
          body: {
            requestId,
            systemId,
            requestType,
            msg,
            reportCreateTime,
          },
        }
      : {
          request_id: requestId,
          system_id: systemId,
          request_type: requestType,
          msg,
          report_create_time: reportCreateTime,
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
          logger.info('回调通知成功', { requestId, url: callbackUrl, attempt, esbMode: config.callback.esbEnabled });
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
