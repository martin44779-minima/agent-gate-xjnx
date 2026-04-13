import { getClient } from '../database/pool';
import { taskMainModel } from '../models/task-main.model';
import { generateUUID, calcByteSize } from '../utils/helpers';
import { generateChecksum } from '../utils/crypto';
import { DATA_TYPES } from '../config/constants';
import { createModuleLogger } from '../utils/logger';
import { SubmitRequestBody } from '../schemas/submit.schema';
import eventBus from './event-bus';

const logger = createModuleLogger('gateway');

export interface SubmitResult {
  code: number;
  msg: string;
  request_id: string;
}

export const gatewayService = {
  async submit(body: SubmitRequestBody): Promise<SubmitResult> {
    const {
      form,
      request_id: requestId,
      request_type: requestType,
      system_id: systemId,
      callback_url: callbackUrl,
    } = body;

    // 防重检查：同 request_id + 同 request_type 存在活跃任务时拒绝
    const existing = await taskMainModel.findActiveByRequestIdAndType(requestId, requestType);
    if (existing) {
      logger.warn('重复提交被拒绝', { requestId, requestType, existingTaskId: existing.task_id });
      return {
        code: 1,
        msg: '重复提交：该request_id的同类型任务正在处理中',
        request_id: requestId,
      };
    }

    // 生成内部 taskId
    const taskId = generateUUID();

    // 数据库事务 — 插入主任务 + 原始数据
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 插入主任务记录
      await client.query(
        `INSERT INTO task_main (task_id, request_id, request_type, system_id, callback_url, task_status, retry_count)
         VALUES ($1, $2, $3, $4, $5, 0, 0)`,
        [taskId, requestId, requestType, systemId, callbackUrl]
      );

      // 将整体 form 数据作为原始数据存储
      const contentStr = JSON.stringify(form);
      const dataSize = calcByteSize(form);
      const checksum = generateChecksum(form);

      await client.query(
        `INSERT INTO task_raw_data (task_id, data_type, data_content, data_size, checksum)
         VALUES ($1, $2, $3, $4, $5)`,
        [taskId, DATA_TYPES.RAW_INPUT, contentStr, dataSize, checksum]
      );

      await client.query('COMMIT');
      logger.info('任务创建成功', { taskId, requestId });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('任务创建失败，事务回滚', { taskId, error: (err as Error).message });
      throw err;
    } finally {
      client.release();
    }

    // 异步触发调度
    setImmediate(() => {
      eventBus.emit('task:created', { taskId });
    });

    // 返回结果（按接口文档格式）
    return {
      code: 0,
      msg: 'success',
      request_id: requestId,
    };
  },
};
