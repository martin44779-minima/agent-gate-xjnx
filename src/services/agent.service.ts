import axios, { AxiosError } from 'axios';
import config from '../config';
import { AgentError } from '../utils/errors';
import { ERROR_CODES } from '../config/constants';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('agent');

export interface AgentInvokeResult {
  agentId: string;
  resultContent: unknown;
  report: string;
  riskLevel: string;
}

export const agentService = {
  async invoke(taskId: string, rawData: unknown): Promise<AgentInvokeResult> {
    const { baseUrl, apiKey, agentId, timeoutMs } = config.agent;

    logger.info('调用AW智能体', { taskId, agentId });

    try {
      const response = await axios.post(
        `${baseUrl}/api/run`,
        { taskId, data: rawData },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-ID': agentId,
            'X-API-Key': apiKey,
          },
          timeout: timeoutMs,
        }
      );

      const result = response.data;
      if (!result || typeof result !== 'object') {
        throw new AgentError('AW智能体返回数据格式异常', ERROR_CODES.ERR_DATA_INVALID.code, false);
      }

      logger.info('AW智能体调用成功', { taskId });

      return {
        agentId,
        resultContent: result.resultContent || result,
        report: result.report || '',
        riskLevel: result.riskLevel || 'unknown',
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

  // 业务错误
  const data = err.response?.data as Record<string, unknown> | undefined;
  if (data?.code === 'BUSINESS_CHECK_FAILED') {
    return ERROR_CODES.ERR_BUSINESS_CHECK;
  }

  // 未知错误默认可重试
  return { code: 'ERR_UNKNOWN', retryable: true };
}
