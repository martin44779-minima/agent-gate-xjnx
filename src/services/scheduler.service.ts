import { taskMainModel } from '../models/task-main.model';
import { agentService } from './agent.service';
import { storageService } from './storage.service';
import { callbackService } from './callback.service';
import eventBus from './event-bus';
import config from '../config';
import { TASK_STATUS, TASK_STATUS_TEXT } from '../config/constants';
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
      // 读取原始数据
      const rawData = await storageService.getRawData(taskId);

      // 调用AW智能体
      const result = await agentService.invoke(taskId, rawData);

      // 保存处理结果
      await storageService.saveResult(
        taskId,
        result.agentId,
        result.resultContent,
        result.report,
        result.riskLevel
      );

      // 更新为已完成
      const endTime = nowDatetime();
      await taskMainModel.updateStatus(taskId, {
        taskStatus: TASK_STATUS.COMPLETED,
        endTime,
        totalCostMs: calcCostMs(startTime, endTime),
      });

      logger.info('任务处理完成', { taskId, riskLevel: result.riskLevel });

      // 通知下游
      await callbackService.notifyDownstream({
        taskId,
        status: TASK_STATUS.COMPLETED,
        statusText: TASK_STATUS_TEXT[TASK_STATUS.COMPLETED],
        riskLevel: result.riskLevel,
        report: result.report,
        completedAt: endTime.toISOString(),
      });
    } catch (err) {
      await handleProcessError(taskId, task.retry_count, startTime, err as Error);
    }
  },
};

async function handleProcessError(
  taskId: string,
  currentRetryCount: number,
  startTime: Date,
  err: Error
): Promise<void> {
  const isRetryable = err instanceof AgentError && err.retryable;
  const errorCode = err instanceof AgentError ? err.errorCode : 'ERR_UNKNOWN';
  const newRetryCount = currentRetryCount + 1;

  if (isRetryable && newRetryCount < config.retry.maxRetries) {
    // 可重试且未达上限 → 重试中
    await taskMainModel.updateStatus(taskId, {
      taskStatus: TASK_STATUS.RETRYING,
      retryCount: newRetryCount,
      lastErrorCode: errorCode,
      remark: `第${newRetryCount}次重试: ${err.message}`,
    });

    logger.info('任务进入重试', {
      taskId,
      retryCount: newRetryCount,
      maxRetries: config.retry.maxRetries,
      nextRetryMs: config.retry.intervalMs,
    });

    // 退避后重新处理
    setTimeout(() => {
      schedulerService.processTask(taskId).catch((retryErr) => {
        logger.error('重试处理异常', { taskId, error: (retryErr as Error).message });
      });
    }, config.retry.intervalMs);
  } else {
    // 不可重试或达上限 → 失败
    const endTime = nowDatetime();
    await taskMainModel.updateStatus(taskId, {
      taskStatus: TASK_STATUS.FAILED,
      endTime,
      totalCostMs: calcCostMs(startTime, endTime),
      retryCount: newRetryCount,
      lastErrorCode: errorCode,
      remark: `最终失败: ${err.message}`,
    });

    logger.error('任务最终失败', { taskId, errorCode, retryCount: newRetryCount });

    // 通知下游失败
    await callbackService.notifyDownstream({
      taskId,
      status: TASK_STATUS.FAILED,
      statusText: TASK_STATUS_TEXT[TASK_STATUS.FAILED],
      failReason: err.message,
      completedAt: endTime.toISOString(),
    });
  }
}
