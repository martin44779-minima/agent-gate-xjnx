import { taskMainModel } from '../models/task-main.model';
import { taskRawModel } from '../models/task-raw.model';
import { taskResultModel } from '../models/task-result.model';
import { TASK_STATUS_TEXT, TaskStatusValue, DATA_TYPES } from '../config/constants';
import { ReportMsg } from './callback.service';

export interface TaskDetail {
  taskId: string;
  requestId: string | null;
  requestType: string;
  systemId: string | null;
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

export interface CaseQueryResult {
  requestId: string;
  report: ReportMsg;
  reportCreateTime: string;
}

function formatTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
      requestId: task.request_id,
      requestType: task.request_type,
      systemId: task.system_id,
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
  async getRawData(taskId: string): Promise<unknown | null> {
    const rows = await taskRawModel.findByTaskId(taskId);
    const raw = rows.find((r) => r.data_type === DATA_TYPES.RAW_INPUT);
    if (!raw) return null;

    const content = typeof raw.data_content === 'string'
      ? JSON.parse(raw.data_content)
      : raw.data_content;
    return content;
  },

  /**
   * 获取任务的回调信息
   */
  async getTaskCallbackInfo(taskId: string): Promise<{ callbackUrl: string | null; requestId: string | null; systemId: string | null; requestType: string } | null> {
    const task = await taskMainModel.findByTaskId(taskId);
    if (!task) return null;
    return {
      callbackUrl: task.callback_url,
      requestId: task.request_id,
      systemId: task.system_id,
      requestType: task.request_type,
    };
  },

  async saveResult(
    taskId: string,
    agentId: string,
    rawResponse: unknown,
    report: ReportMsg
  ): Promise<void> {
    await taskResultModel.create({
      taskId,
      agentId,
      resultContent: rawResponse,
      report: JSON.stringify(report),
    });
  },

  /**
   * 按 system_id + request_id + request_type 查询最新已完成的案例报告
   */
  async getCompletedCaseReport(systemId: string, requestId: string, requestType: string): Promise<CaseQueryResult | null> {
    const task = await taskMainModel.findCompletedBySystemAndRequestId(systemId, requestId, requestType);
    if (!task) return null;

    const taskResult = await taskResultModel.findByTaskId(task.task_id);
    if (!taskResult || !taskResult.report) return null;

    let report: ReportMsg;
    try {
      report = JSON.parse(taskResult.report) as ReportMsg;
    } catch {
      return null;
    }

    const reportCreateTime = task.end_time
      ? formatTimestamp(task.end_time)
      : formatTimestamp(task.create_time);

    return {
      requestId: task.request_id || requestId,
      report,
      reportCreateTime,
    };
  },
};
