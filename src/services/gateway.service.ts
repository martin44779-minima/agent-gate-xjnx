import { getClient } from '../database/pool';
import { taskMainModel } from '../models/task-main.model';
import { generateUUID, calcByteSize } from '../utils/helpers';
import { generateChecksum } from '../utils/crypto';
import { DATA_TYPES } from '../config/constants';
import config from '../config';
import { createModuleLogger } from '../utils/logger';
import { SubmitRequestBody } from '../schemas/submit.schema';
import eventBus from './event-bus';

const logger = createModuleLogger('gateway');

export interface SubmitResult {
  code: number;
  msg: string;
  case_id: string;
}

export const gatewayService = {
  async submit(body: SubmitRequestBody): Promise<SubmitResult> {
    const { form, case_id: caseId, callback_url: callbackUrl } = body;

    // case_id 去重检查（时间窗口内不允许重复提交）
    const existing = await taskMainModel.findByCaseIdWithin(caseId, config.dedup.windowHours);
    if (existing) {
      logger.warn('重复提交被拒绝', { caseId, existingTaskId: existing.task_id });
      return {
        code: 1,
        msg: `重复提交：该case_id在${config.dedup.windowHours}小时内已提交`,
        case_id: caseId,
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
        `INSERT INTO task_main (task_id, case_id, callback_url, task_status, retry_count)
         VALUES ($1, $2, $3, 0, 0)`,
        [taskId, caseId, callbackUrl]
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
      logger.info('任务创建成功', { taskId, caseId });
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
      case_id: caseId,
    };
  },
};
