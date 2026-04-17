# 新部门接入指南

本网关通过 `system_id` 识别不同业务来源，路由到对应的业务适配器。每个适配器负责该业务的入参校验、智能体调用和出参解析，彼此完全隔离。

---

## 接入流程概览

```
1. 确认 system_id         → 上游系统传入的唯一标识
2. 确认 Flowise 智能体 URL → 该部门专属的 prediction 端点
3. 与上游约定 form 字段    → 必填/选填字段及类型
4. 与上游约定回调 msg 字段 → AI 分析结果的字段名及来源路径
5. 新建适配器文件         → src/adapters/xxx.adapter.ts
6. 注册适配器             → src/adapters/index.ts 加一行
7. 重新打镜像部署
```

---

## 第一步：新建适配器文件

在 `src/adapters/` 目录下新建 `{部门标识}.adapter.ts`，实现以下三个方法：

```typescript
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { BizAdapter } from './adapter.interface';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// 1. 定义该业务的 form 字段校验规则
const formSchema = {
  type: 'object',
  required: ['字段A', '字段B'],          // 必填字段
  properties: {
    字段A: { type: 'string' },
    字段B: { type: 'string' },
    字段C: { type: 'string' },           // 选填字段
  },
  additionalProperties: false,
};

const validateFn = ajv.compile(formSchema);

export const xxxAdapter: BizAdapter = {

  // 该业务对应的 Flowise 智能体 URL（不填则使用全局 AW_AGENT_URL）
  agentUrl: 'http://智能体地址/api/v1/prediction/xxxxxxxx',

  // 2. form 字段校验，返回错误描述或 null（通过）
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

  // 3. 组装发给 Flowise 的请求体
  buildAgentPayload(form: unknown): unknown {
    return { form, streaming: false };
  },

  // 4. 解析 Flowise 原始响应，提取回调 msg 字段
  parseResponse(raw: unknown): Record<string, string> {
    const fallback = { result: JSON.stringify(raw) };

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fallback;
    }

    // 根据实际 Flowise 响应结构提取字段
    // 示例：从 agentFlowExecutedData 中找目标节点
    const obj = raw as Record<string, unknown>;
    const flowData = obj.agentFlowExecutedData;
    if (!Array.isArray(flowData)) return fallback;

    const targetNode = flowData.find((item: unknown) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
      const data = (item as Record<string, unknown>).data as Record<string, unknown> | undefined;
      return data?.id === 'directReplyAgentflow_0';   // 替换为实际节点 id
    });

    if (!targetNode) return fallback;

    const state = (
      (targetNode as Record<string, unknown>).data as Record<string, unknown>
    ).state as Record<string, unknown>;

    // 按与上游约定的字段名返回
    return {
      字段X: String(state.字段X ?? ''),
      字段Y: String(state.字段Y ?? ''),
    };
  },
};
```

> **parseResponse 编写要点**
> - 兜底逻辑必须保留：找不到目标节点时返回原始响应字符串，方便排查
> - 所有字段值用 `String(xxx ?? '')` 处理，保证不出现 `undefined`
> - 字段名和内容与上游提前约定，网关不做任何假设

---

## 第二步：注册适配器

打开 `src/adapters/index.ts`，在注册表中添加一行：

```typescript
import { xxxAdapter } from './xxx.adapter';      // 新增

const registry: Record<string, BizAdapter> = {
  'XJRCCB_AML': amlAdapter,
  'YOUR_SYSTEM_ID': xxxAdapter,                  // 新增，key 为上游传入的 system_id
};
```

---

## 第三步：重新打镜像部署

```bash
# 构建 arm64 镜像
docker buildx build --platform linux/arm64 -t agent-gate:latest --output type=docker,dest=agent-gate-arm64.tar .

# 将 tar 包传到服务器后导入并重启
docker load -i agent-gate-arm64.tar
docker rm -f agent-gate
docker run -d --name agent-gate --env-file /data/ai/agent-gate/.env -p 3000:3000 agent-gate:latest
```

---

## 接口说明

所有业务共用同一个提交接口，`system_id` 决定路由到哪个适配器。

**请求**

```
POST /api/v1/aml/data/submit
Content-Type: application/json
```

```json
{
  "callback_url": "/your-system/callback/path",
  "request_id":   "案例唯一ID",
  "request_type": "0",
  "system_id":    "YOUR_SYSTEM_ID",
  "form": {
    "字段A": "...",
    "字段B": "..."
  }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `callback_url` | 是 | 回调地址（开启 ESB 时为文根路径，关闭时为完整 URL） |
| `request_id` | 是 | 上游案例唯一标识，同 system_id + request_type 防重 |
| `request_type` | 是 | `"0"` 排除 / `"1"` 上报 |
| `system_id` | 是 | 必须与注册表中的 key 完全一致 |
| `form` | 是 | 各业务自定义字段，由适配器校验 |

**同步响应**

| code | 含义 |
|------|------|
| `0` | 接收成功，异步处理中 |
| `1` | 重复提交，同类型任务处理中 |
| `2` | system_id 未注册 |
| `3` | form 字段校验失败 |

**异步回调**（处理完成后推送到 callback_url）

```json
{
  "request_id": "案例唯一ID",
  "system_id":  "YOUR_SYSTEM_ID",
  "request_type": "0",
  "msg": {
    "字段X": "...",
    "字段Y": "..."
  },
  "report_create_time": "2026-04-17 10:30:00"
}
```

`msg` 内的字段由该业务适配器的 `parseResponse` 决定，上游按约定解析即可。

---

## 现有业务参考

| system_id | 适配器文件 | 业务说明 |
|-----------|-----------|---------|
| `XJRCCB_AML` | `aml.adapter.ts` | 反洗钱系统 |

---

## 常见问题

**Q：system_id 填错了会怎样？**

同步返回 `{"code": 2, "msg": "system_id [xxx] 未注册，请联系网关管理员"}`，不写库不触发异步。

**Q：form 字段不符合规则会怎样？**

同步返回 `{"code": 3, "msg": "form 字段校验失败: /字段名 must be string"}`，不写库不触发异步。

**Q：不同部门可以调用同一个智能体吗？**

可以，适配器的 `agentUrl` 不填时默认使用 `.env` 中的 `AW_AGENT_URL`，多个适配器可以共用。

**Q：新部门上线后是否影响现有业务？**

不影响。适配器完全隔离，注册表新增一行不改动任何现有逻辑。
