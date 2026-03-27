import { query, getClient } from '../database/pool';
import { TaskStatusValue } from '../config/constants';

export interface TaskMainRow {
  id: number;
  task_id: string;
  upstream_id: string;
  case_id: string | null;
  task_status: TaskStatusValue;
  create_time: Date;
  start_time: Date | null;
  end_time: Date | null;
  total_cost_ms: number;
  retry_count: number;
  last_error_code: string | null;
  callback_url: string | null;
  remark: string | null;
}

export interface CreateTaskParams {
  taskId: string;
  upstreamId: string;
  caseId?: string;
  callbackUrl?: string;
}

export interface UpdateStatusParams {
  taskStatus: TaskStatusValue;
  startTime?: Date;
  endTime?: Date;
  totalCostMs?: number;
  retryCount?: number;
  lastErrorCode?: string;
  remark?: string;
}

export const taskMainModel = {
  async create(params: CreateTaskParams): Promise<TaskMainRow> {
    const { rows } = await query<TaskMainRow>(
      `INSERT INTO task_main (task_id, upstream_id, case_id, task_status, retry_count, callback_url)
       VALUES ($1, $2, $3, 0, 0, $4)
       RETURNING *`,
      [params.taskId, params.upstreamId, params.caseId || null, params.callbackUrl || null]
    );
    return rows[0];
  },

  async findByTaskId(taskId: string): Promise<TaskMainRow | null> {
    const { rows } = await query<TaskMainRow>(
      'SELECT * FROM task_main WHERE task_id = $1',
      [taskId]
    );
    return rows[0] || null;
  },

  async findByUpstreamIdAndCaseId(upstreamId: string, caseId?: string): Promise<TaskMainRow | null> {
    if (caseId) {
      const { rows } = await query<TaskMainRow>(
        'SELECT * FROM task_main WHERE upstream_id = $1 AND case_id = $2',
        [upstreamId, caseId]
      );
      return rows[0] || null;
    }
    const { rows } = await query<TaskMainRow>(
      'SELECT * FROM task_main WHERE upstream_id = $1 AND case_id IS NULL',
      [upstreamId]
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
