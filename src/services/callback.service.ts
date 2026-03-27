import axios from 'axios';
import config from '../config';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('callback');

export interface CallbackPayload {
  taskId: string;
  status: number;
  statusText: string;
  riskLevel?: string;
  report?: string;
  completedAt?: string;
  failReason?: string;
}

export const callbackService = {
  async notifyDownstream(payload: CallbackPayload): Promise<void> {
    const callbackUrl = config.callback.url;
    if (!callbackUrl) {
      logger.debug('未配置下游回调URL，跳过通知', { taskId: payload.taskId });
      return;
    }

    try {
      await axios.post(callbackUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: config.callback.timeoutMs,
      });
      logger.info('下游回调通知成功', { taskId: payload.taskId, url: callbackUrl });
    } catch (err) {
      logger.warn('下游回调通知失败', {
        taskId: payload.taskId,
        url: callbackUrl,
        error: (err as Error).message,
      });
    }
  },
};
