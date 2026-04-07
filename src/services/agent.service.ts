import axios, { AxiosError } from 'axios';
import config from '../config';
import { AgentError } from '../utils/errors';
import { ERROR_CODES } from '../config/constants';
import { createModuleLogger } from '../utils/logger';
import { FormData } from '../schemas/submit.schema';

const logger = createModuleLogger('agent');

/**
 * AW 智能体返回结果
 * flowise prediction 端点返回的是报告文本（msg 字段用于回调）
 */
export interface AgentInvokeResult {
  /** AW 智能体返回的完整原始响应 */
  rawResponse: unknown;
  /** 报告文本（回调时作为 msg 使用） */
  report: string;
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

      // flowise 返回的可能是字符串或对象，统一处理
      let report: string;
      if (typeof result === 'string') {
        report = result;
      } else if (result && typeof result === 'object') {
        report = result.text ?? result.msg ?? result.report ?? JSON.stringify(result);
      } else {
        report = String(result);
      }

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
