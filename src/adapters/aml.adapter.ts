import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { BizAdapter } from './adapter.interface';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * AML 反洗钱业务 form 字段校验规则
 * 5 个必填字段 + 5 个选填字段，全部为 string 类型
 */
const amlFormSchema = {
  type: 'object',
  required: [
    'customer_info',
    'customer_account_info',
    'bank_statement_info',
    'feature_info',
    'summery_info',
  ],
  properties: {
    customer_info:                { type: 'string' },
    customer_account_info:        { type: 'string' },
    bank_statement_info:          { type: 'string' },
    feature_info:                 { type: 'string' },
    summery_info:                 { type: 'string' },
    feature_statement_info:       { type: 'string' },
    history_case_info:            { type: 'string' },
    doubt_exclusion_reasons_info: { type: 'string' },
    due_diligence_info:           { type: 'string' },
    history_rating_info:          { type: 'string' },
  },
  additionalProperties: false,
};

const validateFn = ajv.compile(amlFormSchema);

export const amlAdapter: BizAdapter = {
  validateForm(form: unknown): string | null {
    const valid = validateFn(form);
    if (!valid) {
      const msgs = validateFn.errors
        ?.map((e) => `${e.instancePath || '/'} ${e.message}`)
        .join('; ');
      return msgs || 'form 字段校验失败';
    }
    return null;
  },

  buildAgentPayload(form: unknown): unknown {
    return { form, streaming: false };
  },

  /**
   * 从 agentFlowExecutedData[id=directReplyAgentflow_0].data.state 提取四字段
   * doubtful_point_analysis 可能拆分为 1/2 两个 key，用换行符拼接
   */
  parseResponse(raw: unknown): Record<string, string> {
    const empty = {
      customer_behavior_analysis: '',
      account_transaction_analysis: '',
      doubtful_point_analysis: '',
      analysis_report: '',
    };

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ...empty, analysis_report: String(raw ?? '') };
    }

    const obj = raw as Record<string, unknown>;
    const flowData = obj.agentFlowExecutedData;

    if (!Array.isArray(flowData)) {
      return { ...empty, analysis_report: JSON.stringify(raw) };
    }

    const targetNode = flowData.find((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const node = item as Record<string, unknown>;
      const data = node.data as Record<string, unknown> | undefined;
      return typeof data?.id === 'string' && data.id.startsWith('directReplyAgentflow_');
    });

    if (!targetNode) {
      return { ...empty, analysis_report: JSON.stringify(raw) };
    }

    const state = (
      (targetNode as Record<string, unknown>).data as Record<string, unknown>
    ).state as Record<string, unknown>;

    const part1 = String(state.doubtful_point_analysis1 ?? '');
    const part2 = String(state.doubtful_point_analysis2 ?? '');
    const doubtful = [part1, part2].filter(Boolean).join('\n');

    return {
      customer_behavior_analysis: String(state.customer_behavior_analysis ?? ''),
      account_transaction_analysis: String(state.account_transaction_analysis ?? ''),
      doubtful_point_analysis: doubtful,
      analysis_report: String(state.analysis_report ?? ''),
    };
  },
};
