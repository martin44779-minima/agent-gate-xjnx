import { taskMainModel, getClient } from '../models/task-main.model';
import { taskRawModel } from '../models/task-raw.model';
import { generateUUID, calcByteSize } from '../utils/helpers';
import { generateChecksum } from '../utils/crypto';
import { deepDesensitize } from '../utils/desensitize';
import { DATA_TYPES } from '../config/constants';
import { createModuleLogger } from '../utils/logger';
import eventBus from './event-bus';

const logger = createModuleLogger('gateway');

export interface SubmitParams {
  upstreamId: string;
  caseId?: string;
  callbackUrl?: string;
  basicInfo: Record<string, unknown>;
  flowInfo: unknown;
  historyInfo?: unknown;
}

export interface SubmitResult {
  code: number;
  taskId: string | null;
  message: string;
}

export const gatewayService = {
  async submit(params: SubmitParams): Promise<SubmitResult> {
    const { upstreamId, caseId, callbackUrl, basicInfo, flowInfo, historyInfo } = params;

    // 步骤1: 去重检查
    const existing = await taskMainModel.findByUpstreamIdAndCaseId(upstreamId, caseId);
    if (existing) {
      logger.info('任务已存在，去重返回', { taskId: existing.task_id, upstreamId });
      return { code: 1, taskId: existing.task_id, message: '任务已存在' };
    }

    // 步骤2: 生成TaskID
    const taskId = generateUUID();

    // 步骤3: 脱敏处理
    const desensitizedBasic = deepDesensitize(basicInfo);
    const desensitizedFlow = deepDesensitize(flowInfo);
    const desensitizedHistory = historyInfo ? deepDesensitize(historyInfo) : null;

    // 步骤4: 数据库事务
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 插入主任务记录
      await client.query(
        `INSERT INTO task_main (task_id, upstream_id, case_id, task_status, retry_count, callback_url)
         VALUES ($1, $2, $3, 0, 0, $4)`,
        [taskId, upstreamId, caseId || null, callbackUrl || null]
      );

      // 构建原始数据记录
      const rawRecords: Array<{
        taskId: string;
        dataType: string;
        dataContent: unknown;
        dataSize: number;
        checksum: string;
      }> = [
        {
          taskId,
          dataType: DATA_TYPES.BASIC,
          dataContent: desensitizedBasic,
          dataSize: calcByteSize(desensitizedBasic),
          checksum: generateChecksum(desensitizedBasic),
        },
        {
          taskId,
          dataType: DATA_TYPES.FLOW,
          dataContent: desensitizedFlow,
          dataSize: calcByteSize(desensitizedFlow),
          checksum: generateChecksum(desensitizedFlow),
        },
      ];

      if (desensitizedHistory) {
        rawRecords.push({
          taskId,
          dataType: DATA_TYPES.HISTORY,
          dataContent: desensitizedHistory,
          dataSize: calcByteSize(desensitizedHistory),
          checksum: generateChecksum(desensitizedHistory),
        });
      }

      // 批量插入原始数据（在事务内直接执行SQL）
      for (const r of rawRecords) {
        await client.query(
          `INSERT INTO task_raw_data (task_id, data_type, data_content, data_size, checksum)
           VALUES ($1, $2, $3, $4, $5)`,
          [r.taskId, r.dataType, JSON.stringify(r.dataContent), r.dataSize, r.checksum]
        );
      }

      await client.query('COMMIT');
      logger.info('任务创建成功', { taskId, upstreamId });
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error('任务创建失败，事务回滚', { taskId, error: (err as Error).message });
      throw err;
    } finally {
      client.release();
    }

    // 步骤5: 异步触发调度
    setImmediate(() => {
      eventBus.emit('task:created', { taskId, basicInfo, flowInfo, historyInfo });
    });

    // 步骤6: 返回结果
    return { code: 1, taskId, message: '任务接收成功' };
  },
};
