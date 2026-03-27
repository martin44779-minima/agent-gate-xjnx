import { query } from '../database/pool';

export interface TaskRawDataRow {
  id: number;
  task_id: string;
  data_type: string;
  data_content: unknown;
  data_size: number;
  checksum: string;
  create_time: Date;
}

export interface CreateRawDataParams {
  taskId: string;
  dataType: string;
  dataContent: unknown;
  dataSize: number;
  checksum: string;
}

export const taskRawModel = {
  async batchCreate(records: CreateRawDataParams[]): Promise<TaskRawDataRow[]> {
    if (records.length === 0) return [];

    const valuePlaceholders: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const r of records) {
      valuePlaceholders.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
      values.push(r.taskId, r.dataType, JSON.stringify(r.dataContent), r.dataSize, r.checksum);
      idx += 5;
    }

    const { rows } = await query<TaskRawDataRow>(
      `INSERT INTO task_raw_data (task_id, data_type, data_content, data_size, checksum)
       VALUES ${valuePlaceholders.join(', ')}
       RETURNING *`,
      values
    );
    return rows;
  },

  async findByTaskId(taskId: string): Promise<TaskRawDataRow[]> {
    const { rows } = await query<TaskRawDataRow>(
      'SELECT * FROM task_raw_data WHERE task_id = $1 ORDER BY data_type',
      [taskId]
    );
    return rows;
  },
};
