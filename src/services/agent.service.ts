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
 * 从 agentFlowExecutedData[id=directReplyAgentflow_0].data.state 中提取四字段
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
 * 从 agentFlowExecutedData 列表中找到 id=directReplyAgentflow_0 的节点，
 * 提取其 data.state 下的四个字段。
 * doubtful_point_analysis 可能拆分为 doubtful_point_analysis1/2，用换行符拼接。
 */
function parseReportMsg(result: unknown): ReportMsg {
  const empty: ReportMsg = {
    customer_behavior_analysis: '',
    account_transaction_analysis: '',
    doubtful_point_analysis: '',
    analysis_report: '',
  };

  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return { ...empty, analysis_report: String(result ?? '') };
  }

  const obj = result as Record<string, unknown>;
  const flowData = obj.agentFlowExecutedData;

  if (!Array.isArray(flowData)) {
    return { ...empty, analysis_report: JSON.stringify(result) };
  }

  const targetNode = flowData.find((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
    const node = item as Record<string, unknown>;
    const data = node.data as Record<string, unknown> | undefined;
    return data?.id === 'directReplyAgentflow_0';
  });

  if (!targetNode) {
    return { ...empty, analysis_report: JSON.stringify(result) };
  }

  const state = ((targetNode as Record<string, unknown>).data as Record<string, unknown>).state as Record<string, unknown>;

  const part1 = String(state.doubtful_point_analysis1 ?? '');
  const part2 = String(state.doubtful_point_analysis2 ?? '');
  const doubtful = [part1, part2].filter(Boolean).join('\n');

  return {
    customer_behavior_analysis: String(state.customer_behavior_analysis ?? ''),
    account_transaction_analysis: String(state.account_transaction_analysis ?? ''),
    doubtful_point_analysis: doubtful,
    analysis_report: String(state.analysis_report ?? ''),
  };
}
