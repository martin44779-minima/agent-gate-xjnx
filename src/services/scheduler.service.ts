import { taskMainModel } from '../models/task-main.model';
import { agentService } from './agent.service';
import { storageService } from './storage.service';
import { callbackService } from './callback.service';
import eventBus from './event-bus';
import config from '../config';
import { TASK_STATUS } from '../config/constants';
import { AgentError } from '../utils/errors';
import { nowDatetime, calcCostMs } from '../utils/helpers';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('scheduler');

export const schedulerService = {
  init(): void {
    eventBus.on('task:created', ({ taskId }: { taskId: string }) => {
      logger.info('收到新任务事件', { taskId });
      schedulerService.processTask(taskId).catch((err) => {
        logger.error('任务处理异常', { taskId, error: (err as Error).message });
      });
    });
    logger.info('调度服务已初始化');
  },

  async processTask(taskId: string): Promise<void> {
    const task = await taskMainModel.findByTaskId(taskId);
    if (!task) {
      logger.error('任务不存在', { taskId });
      return;
    }

    // 校验状态: 仅待处理(0)或重试中(3)可开始
    if (task.task_status !== TASK_STATUS.PENDING && task.task_status !== TASK_STATUS.RETRYING) {
      logger.warn('任务状态不允许处理', { taskId, status: task.task_status });
      return;
    }

    // 更新为处理中
    const startTime = task.start_time || nowDatetime();
    await taskMainModel.updateStatus(taskId, {
      taskStatus: TASK_STATUS.PROCESSING,
      startTime,
    });

    logger.info('任务开始处理', { taskId, retryCount: task.retry_count });

    try {
      // 读取原始入参 form 数据
      const formData = await storageService.getRawData(taskId);
      if (!formData) {
        throw new Error('原始入参数据不存在');
      }

      // 调用 AW 智能体
      const result = await agentService.invoke(taskId, formData);

      // 保存处理结果
      await storageService.saveResult(
        taskId,
        'aw-agent',
        result.rawResponse,
        result.report
      );

      // 更新为已完成
      const endTime = nowDatetime();
      await taskMainModel.updateStatus(taskId, {
        taskStatus: TASK_STATUS.COMPLETED,
        endTime,
        totalCostMs: calcCostMs(startTime, endTime),
        nextRetryTime: null,
      });

      logger.info('任务处理完成', { taskId, requestId: task.request_id });

      // 回调上游 — 成功
      if (task.callback_path && task.request_id) {
        await callbackService.notifyDownstream(
          task.callback_path,
          task.request_id,
          task.system_id || '',
          task.request_type,
          result.report,
          null,
          task.esb_sys_head,
          task.cnsmr_sys_no
        );
      }
    } catch (err) {
      await handleProcessError(taskId, task, startTime, err as Error);
    }
  },
};

async function handleProcessError(
  taskId: string,
  task: { retry_count: number; callback_url: string | null; callback_path: string | null; request_id: string | null; system_id: string | null; request_type: string; esb_sys_head?: Record<string, unknown> | null; cnsmr_sys_no?: string | null },
  startTime: Date,
  err: Error
): Promise<void> {
  const isRetryable = err instanceof AgentError && err.retryable;
  const errorCode = err instanceof AgentError ? err.errorCode : 'ERR_UNKNOWN';
  const newRetryCount = task.retry_count + 1;

  if (isRetryable && newRetryCount < config.retry.maxRetries) {
    const nextRetryTime = new Date(Date.now() + config.retry.intervalMs);
    await taskMainModel.updateStatus(taskId, {
      taskStatus: TASK_STATUS.RETRYING,
      retryCount: newRetryCount,
      nextRetryTime,
      lastErrorCode: errorCode,
      remark: `第${newRetryCount}次重试: ${err.message}`,
    });

    logger.info('任务进入重试', {
      taskId,
      retryCount: newRetryCount,
      maxRetries: config.retry.maxRetries,
      nextRetryMs: config.retry.intervalMs,
      nextRetryTime: nextRetryTime.toISOString(),
    });

    setTimeout(() => {
      schedulerService.processTask(taskId).catch((retryErr) => {
        logger.error('重试处理异常', { taskId, error: (retryErr as Error).message });
      });
    }, config.retry.intervalMs);
  } else {
    const endTime = nowDatetime();
    await taskMainModel.updateStatus(taskId, {
      taskStatus: TASK_STATUS.FAILED,
      endTime,
      totalCostMs: calcCostMs(startTime, endTime),
      retryCount: newRetryCount,
      nextRetryTime: null,
      lastErrorCode: errorCode,
      remark: `最终失败: ${err.message}`,
    });

    logger.error('任务最终失败', { taskId, errorCode, retryCount: newRetryCount });

    // 回调上游 — 失败
    if (task.callback_path && task.request_id) {
      await callbackService.notifyDownstream(
        task.callback_path,
        task.request_id,
        task.system_id || '',
        task.request_type,
        null,
        err.message,
        task.esb_sys_head,
        task.cnsmr_sys_no
      );
    }
  }
}
