/**
 * 提交接口请求体 JSON Schema
 *
 * 请求体结构:
 * {
 *   form: { 10个业务字段 + callback_url + case_id },
 *   streaming: boolean
 * }
 */
export const submitSchema = {
  type: 'object',
  required: ['form'],
  properties: {
    form: {
      type: 'object',
      required: [
        'customer_info',
        'customer_account_info',
        'bank_statement_info',
        'feature_info',
        'feature_statement_info',
        'summery_info',
      ],
      properties: {
        customer_info:               { type: 'string' },
        customer_account_info:       { type: 'string' },
        bank_statement_info:         { type: 'string' },
        feature_info:                { type: 'string' },
        feature_statement_info:      { type: 'string' },
        summery_info:                { type: 'string' },
        history_case_info:           { type: 'string' },
        doubt_exclusion_reasons_info: { type: 'string' },
        due_diligence_info:          { type: 'string' },
        history_rating_info:         { type: 'string' },
        callback_url:                { type: 'string' },
        case_id:                     { type: 'string' },
      },
      additionalProperties: false,
    },
    streaming: { type: 'boolean' },
  },
  additionalProperties: false,
};

/** form 内部字段类型 */
export interface FormData {
  customer_info: string;
  customer_account_info: string;
  bank_statement_info: string;
  feature_info: string;
  feature_statement_info: string;
  summery_info: string;
  history_case_info?: string;
  doubt_exclusion_reasons_info?: string;
  due_diligence_info?: string;
  history_rating_info?: string;
  callback_url?: string;
  case_id?: string;
}

/** 完整请求体类型 */
export interface SubmitRequestBody {
  form: FormData;
  streaming?: boolean;
}
