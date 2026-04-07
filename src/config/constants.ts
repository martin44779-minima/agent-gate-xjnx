export const TASK_STATUS = {
  PENDING: 0,
  PROCESSING: 1,
  COMPLETED: 2,
  RETRYING: 3,
  FAILED: 4,
} as const;

export type TaskStatusValue = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_STATUS_TEXT: Record<TaskStatusValue, string> = {
  [TASK_STATUS.PENDING]: '待处理',
  [TASK_STATUS.PROCESSING]: '处理中',
  [TASK_STATUS.COMPLETED]: '已完成',
  [TASK_STATUS.RETRYING]: '重试中',
  [TASK_STATUS.FAILED]: '失败',
};

export const ERROR_CODES = {
  ERR_TIMEOUT: { code: 'ERR_TIMEOUT', retryable: true, desc: '调用AW平台超时' },
  ERR_SERVICE_UNAVAILABLE: { code: 'ERR_SERVICE_UNAVAILABLE', retryable: true, desc: 'AW平台返回503' },
  ERR_RATE_LIMIT: { code: 'ERR_RATE_LIMIT', retryable: true, desc: '触发接口限流' },
  ERR_DATA_INVALID: { code: 'ERR_DATA_INVALID', retryable: false, desc: '上游数据问题' },
  ERR_BUSINESS_CHECK: { code: 'ERR_BUSINESS_CHECK', retryable: false, desc: '反洗钱规则不通过' },
  ERR_AUTH_FAILED: { code: 'ERR_AUTH_FAILED', retryable: false, desc: 'API-Key无效' },
} as const;

export const DATA_TYPES = {
  /** 整体原始入参（10 字段 JSON） */
  RAW_INPUT: 'raw_input',
} as const;
