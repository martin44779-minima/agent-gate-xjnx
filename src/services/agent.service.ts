import axios, { AxiosError } from 'axios';
import config from '../config';
import { AgentError } from '../utils/errors';
import { ERROR_CODES } from '../config/constants';
import { createModuleLogger } from '../utils/logger';
import { FormData } from '../schemas/submit.schema';
import { ReportMsg } from './callback.service';

const logger = createModuleLogger('agent');

/**
 * AW 智能体返回结果
 * 智能体经过分支处理后返回结构化报告:
 * - 排除案例: 只有 analysis_report 有内容
 * - 风险案例: 四个字段都有内容
 */
export interface AgentInvokeResult {
  /** AW 智能体返回的完整原始响应 */
  rawResponse: unknown;
  /** 结构化报告对象（回调时作为 msg 使用） */
  report: ReportMsg;
}

export const agentService = {
  /**
   * 调用 AW 智能体（flowise prediction 端点）
   * 请求体按接口文档格式: { form: { ...10字段 }, streaming: false }
   */
  async invoke(taskId: string, formData: FormData): Promise<AgentInvokeResult> {
    const { baseUrl, timeoutMs } = config.agent;

    logger.info('调用AW智能体', { taskId, url: baseUrl });

    try {
      const response = await axios.post(
        baseUrl,
        {
          form: formData,
          streaming: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: timeoutMs,
        }
      );

      const result = response.data;
      logger.info('AW智能体调用成功', { taskId });

      // 解析智能体返回为结构化 ReportMsg
      const report = parseReportMsg(result);

      return {
        rawResponse: result,
        report,
      };
    } catch (err) {
      if (err instanceof AgentError) throw err;

      const axiosErr = err as AxiosError;
      const classified = classifyError(axiosErr);
      logger.error('AW智能体调用失败', {
        taskId,
        errorCode: classified.code,
        retryable: classified.retryable,
        message: axiosErr.message,
      });
      throw new AgentError(axiosErr.message, classified.code, classified.retryable);
    }
  },
};

function classifyError(err: AxiosError): { code: string; retryable: boolean } {
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return ERROR_CODES.ERR_TIMEOUT;
  }

  const status = err.response?.status;
  if (status === 503) return ERROR_CODES.ERR_SERVICE_UNAVAILABLE;
  if (status === 429) return ERROR_CODES.ERR_RATE_LIMIT;
  if (status === 400) return ERROR_CODES.ERR_DATA_INVALID;
  if (status === 401 || status === 403) return ERROR_CODES.ERR_AUTH_FAILED;

  const data = err.response?.data as Record<string, unknown> | undefined;
  if (data?.code === 'BUSINESS_CHECK_FAILED') {
    return ERROR_CODES.ERR_BUSINESS_CHECK;
  }

  return { code: 'ERR_UNKNOWN', retryable: true };
}

/**
 * 将智能体返回结果解析为结构化 ReportMsg
 * 智能体经过分支后:
 * - 排除案例: 只有 analysis_report
 * - 风险案例: 四个字段都有内容
 *
 * 兼容多种返回格式:
 * 1. 对象中直接包含 analysis_report 字段 → 提取四字段
 * 2. 嵌套在 text/msg/report 键下的 JSON 字符串 → 先解析再提取
 * 3. 纯字符串 → 尝试 JSON 解析，失败则整体作为 analysis_report
 */
function parseReportMsg(result: unknown): ReportMsg {
  const empty: ReportMsg = {
    customer_behavior_analysis: '',
    account_transaction_analysis: '',
    doubtful_point_analysis: '',
    analysis_report: '',
  };

  function extractFromObj(obj: Record<string, unknown>): ReportMsg {
    return {
      customer_behavior_analysis: String(obj.customer_behavior_analysis ?? ''),
      account_transaction_analysis: String(obj.account_transaction_analysis ?? ''),
      doubtful_point_analysis: String(obj.doubtful_point_analysis ?? ''),
      analysis_report: String(obj.analysis_report ?? ''),
    };
  }

  function tryParseJson(str: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(str);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // 非 JSON 字符串
    }
    return null;
  }

  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>;

    // 对象直接包含 analysis_report 字段，认为是结构化报告
    if ('analysis_report' in obj) {
      return extractFromObj(obj);
    }

    // 可能嵌套在 text / msg / report 键下（flowise 常见格式）
    const nested = obj.text ?? obj.msg ?? obj.report;
    if (typeof nested === 'string') {
      const parsed = tryParseJson(nested);
      if (parsed && 'analysis_report' in parsed) {
        return extractFromObj(parsed);
      }
      return { ...empty, analysis_report: nested };
    }
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedObj = nested as Record<string, unknown>;
      if ('analysis_report' in nestedObj) {
        return extractFromObj(nestedObj);
      }
    }

    return { ...empty, analysis_report: JSON.stringify(result) };
  }

  if (typeof result === 'string') {
    const parsed = tryParseJson(result);
    if (parsed && 'analysis_report' in parsed) {
      return extractFromObj(parsed);
    }
    return { ...empty, analysis_report: result };
  }

  return { ...empty, analysis_report: String(result) };
}
