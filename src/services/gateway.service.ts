import { getClient } from '../database/pool';
import { taskMainModel } from '../models/task-main.model';
import { generateUUID, calcByteSize } from '../utils/helpers';
import { generateChecksum } from '../utils/crypto';
import { DATA_TYPES } from '../config/constants';
import { createModuleLogger } from '../utils/logger';
import { SubmitRequestBody } from '../schemas/submit.schema';
import { getAdapter } from '../adapters';
import eventBus from './event-bus';

const logger = createModuleLogger('gateway');

export interface SubmitResult {
  code: number;
  msg: string;
  request_id: string;
}

export interface SubmitInput {
  body: SubmitRequestBody;
  esbSysHead?: Record<string, unknown>;
}

export const gatewayService = {
  async submit({ body, esbSysHead }: SubmitInput): Promise<SubmitResult> {
    const {
      form,
      request_id: requestId,
      request_type: requestType,
      system_id: systemId,
      svc_cd: svcCd = '',
      callback_url: callbackUrl,
    } = body;

    // 查找对应适配器，未注册的 system_id 直接拒绝
    const adapter = await getAdapter(systemId, svcCd);
    if (!adapter) {
      logger.warn('未找到对应适配器', { systemId });
      return {
        code: 2,
        msg: `system_id [${systemId}] 未注册，请联系网关管理员`,
        request_id: requestId,
      };
    }

    // 适配器校验 form 字段
    const formError = adapter.validateForm(form);
    if (formError) {
      logger.warn('form 字段校验失败', { systemId, requestId, error: formError });
      return {
        code: 3,
        msg: `form 字段校验失败: ${formError}`,
        request_id: requestId,
      };
    }

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

    // 生成内部 taskId 和消费者系统号
    const taskId = generateUUID();
    const cnsmrSysNo = `AI_${systemId}_${Date.now()}`;

    // 数据库事务 — 插入主任务 + 原始数据
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // 插入主任务记录
      // callback_url 列存文根路径，回调时与 ESB_CALLBACK_BASE_URL 拼接
      await client.query(
        `INSERT INTO task_main (task_id, request_id, request_type, system_id, svc_cd, callback_url, esb_sys_head, cnsmr_sys_no, callback_path, task_status, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, 0)`,
        [taskId, requestId, requestType, systemId, svcCd, callbackUrl, esbSysHead ? JSON.stringify(esbSysHead) : null, cnsmrSysNo, callbackUrl]
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
