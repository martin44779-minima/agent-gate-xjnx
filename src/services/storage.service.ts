import { taskMainModel } from '../models/task-main.model';
import { taskRawModel } from '../models/task-raw.model';
import { taskResultModel } from '../models/task-result.model';
import { TASK_STATUS_TEXT, TaskStatusValue } from '../config/constants';

export interface TaskDetail {
  taskId: string;
  status: TaskStatusValue;
  statusText: string;
  upstreamId: string;
  createTime: Date;
  startTime: Date | null;
  endTime: Date | null;
  totalCostMs: number;
  retryCount: number;
  result: {
    riskLevel: string | null;
    report: string | null;
    resultContent: unknown;
  } | null;
}

export const storageService = {
  async getTaskDetail(taskId: string): Promise<TaskDetail | null> {
    const task = await taskMainModel.findByTaskId(taskId);
    if (!task) return null;

    let result: TaskDetail['result'] = null;
    const taskResult = await taskResultModel.findByTaskId(taskId);
    if (taskResult) {
      result = {
        riskLevel: taskResult.risk_level,
        report: taskResult.report,
        resultContent: taskResult.result_content,
      };
    }

    return {
      taskId: task.task_id,
      status: task.task_status,
      statusText: TASK_STATUS_TEXT[task.task_status] || '未知',
      upstreamId: task.upstream_id,
      createTime: task.create_time,
      startTime: task.start_time,
      endTime: task.end_time,
      totalCostMs: task.total_cost_ms,
      retryCount: task.retry_count,
      result,
    };
  },

  async getRawData(taskId: string): Promise<Record<string, unknown>> {
    const rows = await taskRawModel.findByTaskId(taskId);
    const data: Record<string, unknown> = {};
    for (const row of rows) {
      data[row.data_type] = row.data_content;
    }
    return data;
  },

  async saveResult(
    taskId: string,
    agentId: string,
    resultContent: unknown,
    report: string,
    riskLevel: string
  ): Promise<void> {
    await taskResultModel.create({ taskId, agentId, resultContent, report, riskLevel });
  },
};
