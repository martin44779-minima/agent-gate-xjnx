import { query } from '../database/pool';

export interface TaskResultRow {
  id: number;
  task_id: string;
  agent_id: string;
  result_content: unknown;
  report: string | null;
  risk_level: string | null;
  risk_score: number | null;
  conclusion: string | null;
  create_time: Date;
}

export interface CreateResultParams {
  taskId: string;
  agentId: string;
  resultContent?: unknown;
  report?: string;
  riskLevel?: string;
  riskScore?: number;
  conclusion?: string;
}

export const taskResultModel = {
  async create(params: CreateResultParams): Promise<TaskResultRow> {
    const { rows } = await query<TaskResultRow>(
      `INSERT INTO task_result (task_id, agent_id, result_content, report, risk_level, risk_score, conclusion)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        params.taskId,
        params.agentId,
        params.resultContent ? JSON.stringify(params.resultContent) : null,
        params.report || null,
        params.riskLevel || null,
        params.riskScore ?? null,
        params.conclusion || null,
      ]
    );
    return rows[0];
  },

  async findByTaskId(taskId: string): Promise<TaskResultRow | null> {
    const { rows } = await query<TaskResultRow>(
      'SELECT * FROM task_result WHERE task_id = $1',
      [taskId]
    );
    return rows[0] || null;
  },
};
