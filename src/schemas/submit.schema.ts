/**
 * 提交接口请求体 JSON Schema
 *
 * 请求体结构:
 * {
 *   callback_url: string,   (必填，顶层)
 *   request_id: string,     (必填，顶层，案例ID)
 *   request_type: string,   (必填，"0"=排除/"1"=上报)
 *   system_id: string,      (必填，系统ID)
 *   form: { 10个业务字段 }
 * }
 */
export const submitSchema = {
  type: 'object',
  required: ['callback_url', 'request_id', 'request_type', 'system_id', 'form'],
  properties: {
    callback_url: { type: 'string' },
    request_id:   { type: 'string' },
    request_type: { type: 'string', enum: ['0', '1'] },
    system_id:    { type: 'string' },
    form: {
      type: 'object',
      required: [
        'customer_info',
        'customer_account_info',
        'bank_statement_info',
        'feature_info',
        'summery_info',
      ],
      properties: {
        customer_info:               { type: 'string' },
        customer_account_info:       { type: 'string' },
        bank_statement_info:         { type: 'string' },
        feature_info:                { type: 'string' },
        summery_info:                { type: 'string' },
        feature_statement_info:      { type: 'string' },
        history_case_info:           { type: 'string' },
        doubt_exclusion_reasons_info: { type: 'string' },
        due_diligence_info:          { type: 'string' },
        history_rating_info:         { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

/** form 内部字段类型（10个业务字段） */
export interface FormData {
  customer_info: string;
  customer_account_info: string;
  bank_statement_info: string;
  feature_info: string;
  summery_info: string;
  feature_statement_info?: string;
  history_case_info?: string;
  doubt_exclusion_reasons_info?: string;
  due_diligence_info?: string;
  history_rating_info?: string;
}

/** 完整请求体类型 */
export interface SubmitRequestBody {
  callback_url: string;
  request_id: string;
  request_type: string;
  system_id: string;
  form: FormData;
}
