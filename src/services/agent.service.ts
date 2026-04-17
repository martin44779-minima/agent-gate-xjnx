import axios, { AxiosError } from 'axios';
import config from '../config';
import { AgentError } from '../utils/errors';
import { ERROR_CODES } from '../config/constants';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('agent');

export const agentService = {
  /**
   * 调用 Flowise prediction 端点
   * payload 由各业务适配器的 buildAgentPayload 组装
   * agentUrl 优先使用适配器配置，不填则使用全局 AW_AGENT_URL
   */
  async invoke(taskId: string, payload: unknown, agentUrl?: string): Promise<unknown> {
    const url = agentUrl || config.agent.baseUrl;

    logger.info('调用智能体', { taskId, url });

    try {
      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: config.agent.timeoutMs,
      });

      logger.info('智能体调用成功', { taskId });
      return response.data;
    } catch (err) {
      if (err instanceof AgentError) throw err;

      const axiosErr = err as AxiosError;
      const classified = classifyError(axiosErr);
      logger.error('智能体调用失败', {
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
