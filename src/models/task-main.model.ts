import { query, getClient } from '../database/pool';
import { TaskStatusValue } from '../config/constants';

export interface TaskMainRow {
  id: number;
  task_id: string;
  request_id: string | null;
  request_type: string;
  system_id: string | null;
  callback_url: string | null;
  task_status: TaskStatusValue;
  create_time: Date;
  start_time: Date | null;
  end_time: Date | null;
  total_cost_ms: number;
  retry_count: number;
  next_retry_time: Date | null;
  last_error_code: string | null;
  remark: string | null;
}

export interface UpdateStatusParams {
  taskStatus: TaskStatusValue;
  startTime?: Date;
  endTime?: Date;
  totalCostMs?: number;
  retryCount?: number;
  nextRetryTime?: Date | null;
  lastErrorCode?: string;
  remark?: string;
}

export const taskMainModel = {
  async findByTaskId(taskId: string): Promise<TaskMainRow | null> {
    const { rows } = await query<TaskMainRow>(
      'SELECT * FROM task_main WHERE task_id = $1',
      [taskId]
    );
    return rows[0] || null;
  },

  async findByRequestId(requestId: string): Promise<TaskMainRow | null> {
    const { rows } = await query<TaskMainRow>(
      'SELECT * FROM task_main WHERE request_id = $1',
      [requestId]
    );
    return rows[0] || null;
  },

  async findActiveByRequestIdAndType(requestId: string, requestType: string): Promise<TaskMainRow | null> {
    const { rows } = await query<TaskMainRow>(
      'SELECT * FROM task_main WHERE request_id = $1 AND request_type = $2 AND task_status IN (0, 1, 3) LIMIT 1',
      [requestId, requestType]
    );
    return rows[0] || null;
  },

  async findCompletedBySystemAndRequestId(systemId: string, requestId: string, requestType: string): Promise<TaskMainRow | null> {
    const { rows } = await query<TaskMainRow>(
      'SELECT * FROM task_main WHERE system_id = $1 AND request_id = $2 AND request_type = $3 AND task_status = 2 ORDER BY end_time DESC LIMIT 1',
      [systemId, requestId, requestType]
    );
    return rows[0] || null;
  },

  async updateStatus(taskId: string, params: UpdateStatusParams): Promise<TaskMainRow | null> {
    const fields: string[] = ['task_status = $2'];
    const values: unknown[] = [taskId, params.taskStatus];
    let idx = 3;

    if (params.startTime !== undefined) {
      fields.push(`start_time = $${idx}`);
      values.push(params.startTime);
      idx++;
    }
    if (params.endTime !== undefined) {
      fields.push(`end_time = $${idx}`);
      values.push(params.endTime);
      idx++;
    }
    if (params.totalCostMs !== undefined) {
      fields.push(`total_cost_ms = $${idx}`);
      values.push(params.totalCostMs);
      idx++;
    }
    if (params.retryCount !== undefined) {
      fields.push(`retry_count = $${idx}`);
      values.push(params.retryCount);
      idx++;
    }
    if (params.nextRetryTime !== undefined) {
      fields.push(`next_retry_time = $${idx}`);
      values.push(params.nextRetryTime);
      idx++;
    }
    if (params.lastErrorCode !== undefined) {
      fields.push(`last_error_code = $${idx}`);
      values.push(params.lastErrorCode);
      idx++;
    }
    if (params.remark !== undefined) {
      fields.push(`remark = $${idx}`);
      values.push(params.remark);
      idx++;
    }

    const { rows } = await query<TaskMainRow>(
      `UPDATE task_main SET ${fields.join(', ')} WHERE task_id = $1 RETURNING *`,
      values
    );
    return rows[0] || null;
  },
};

export { getClient };
