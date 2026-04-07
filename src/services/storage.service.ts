import { taskMainModel } from '../models/task-main.model';
import { taskRawModel } from '../models/task-raw.model';
import { taskResultModel } from '../models/task-result.model';
import { TASK_STATUS_TEXT, TaskStatusValue, DATA_TYPES } from '../config/constants';
import { FormData } from '../schemas/submit.schema';

export interface TaskDetail {
  taskId: string;
  caseId: string | null;
  status: TaskStatusValue;
  statusText: string;
  createTime: Date;
  startTime: Date | null;
  endTime: Date | null;
  totalCostMs: number;
  retryCount: number;
  result: {
    report: string | null;
    rawResponse: unknown;
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
        report: taskResult.report,
        rawResponse: taskResult.result_content,
      };
    }

    return {
      taskId: task.task_id,
      caseId: task.case_id,
      status: task.task_status,
      statusText: TASK_STATUS_TEXT[task.task_status] || '未知',
      createTime: task.create_time,
      startTime: task.start_time,
      endTime: task.end_time,
      totalCostMs: task.total_cost_ms,
      retryCount: task.retry_count,
      result,
    };
  },

  /**
   * 获取任务原始入参 form 数据
   */
  async getRawData(taskId: string): Promise<FormData | null> {
    const rows = await taskRawModel.findByTaskId(taskId);
    const raw = rows.find((r) => r.data_type === DATA_TYPES.RAW_INPUT);
    if (!raw) return null;

    const content = typeof raw.data_content === 'string'
      ? JSON.parse(raw.data_content)
      : raw.data_content;
    return content as FormData;
  },

  /**
   * 获取任务的 callback_url 和 case_id
   */
  async getTaskCallbackInfo(taskId: string): Promise<{ callbackUrl: string | null; caseId: string | null } | null> {
    const task = await taskMainModel.findByTaskId(taskId);
    if (!task) return null;
    return {
      callbackUrl: task.callback_url,
      caseId: task.case_id,
    };
  },

  async saveResult(
    taskId: string,
    agentId: string,
    rawResponse: unknown,
    report: string
  ): Promise<void> {
    await taskResultModel.create({
      taskId,
      agentId,
      resultContent: rawResponse,
      report,
    });
  },
};
