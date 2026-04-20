import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { BizAdapter } from './adapter.interface';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * adapter_registry 表的行结构
 */
export interface AdapterRegistryRow {
  system_id: string;
  svc_cd: string;
  display_name?: string;
  agent_url: string;
  form_schema: Record<string, unknown>;
  response_map: ResponseMap;
}

/**
 * response_map 结构：
 * - nodeIdPrefix: agentFlowExecutedData 中终止节点 ID 的前缀，如 "directReplyAgentflow_"
 * - stateFields:  输出字段映射，key 为回调字段名，value 为 state 中的字段名
 *                 value 为数组时，将多个字段按 "\n" 拼接（用于字段拆分的场景）
 */
interface ResponseMap {
  nodeIdPrefix: string;
  stateFields: Record<string, string | string[]>;
}

/**
 * 根据 adapter_registry 表中一行数据，动态构建 BizAdapter
 */
export function buildAdapterFromRow(row: AdapterRegistryRow): BizAdapter {
  const validateFn = ajv.compile(row.form_schema);
  const { nodeIdPrefix, stateFields } = row.response_map;

  return {
    agentUrl: row.agent_url,

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

    parseResponse(raw: unknown): Record<string, string> {
      const defaultOutput = Object.fromEntries(
        Object.keys(stateFields).map((k) => [k, ''])
      );

      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        return defaultOutput;
      }

      const obj = raw as Record<string, unknown>;
      const flowData = obj.agentFlowExecutedData;

      if (!Array.isArray(flowData)) {
        return defaultOutput;
      }

      const targetNode = flowData.find((item: unknown) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
        const data = (item as Record<string, unknown>).data as Record<string, unknown> | undefined;
        return typeof data?.id === 'string' && data.id.startsWith(nodeIdPrefix);
      });

      if (!targetNode) {
        return defaultOutput;
      }

      const state = (
        (targetNode as Record<string, unknown>).data as Record<string, unknown>
      ).state as Record<string, unknown>;

      const result: Record<string, string> = {};
      for (const [outputKey, sourceKey] of Object.entries(stateFields)) {
        if (Array.isArray(sourceKey)) {
          result[outputKey] = sourceKey
            .map((k) => String(state[k] ?? ''))
            .filter(Boolean)
            .join('\n');
        } else {
          result[outputKey] = String(state[sourceKey] ?? '');
        }
      }

      return result;
    },
  };
}
