# 新部门接入指南

本网关通过 `system_id` 识别不同业务来源，路由到对应的业务适配器。适配器配置存储在 Redis 中，**无需改代码、无需重新部署**，调用管理接口即可完成注册。

---

## 接入流程概览

```
1. 确认 system_id 和 svc_cd   → 上游系统传入的标识组合
2. 确认 Flowise 智能体 URL    → 该部门专属的 prediction 端点
3. 与上游约定 form 字段       → 必填/选填字段及类型（用于校验）
4. 与上游约定回调 msg 字段    → AI 分析结果字段名及在 state 中的路径
5. 调用注册接口写入 Redis     → POST /api/admin/adapters
6. 验证：提交一条测试案例
```

---

## 第一步：了解 system_id 与 svc_cd

| 字段 | 说明 | 示例 |
|------|------|------|
| `system_id` | 上游系统唯一标识 | `NAML`、`XJRCCB_AML` |
| `svc_cd` | 同一系统下的业务细分码，不区分时留空 | `""`、`"012345"` |

> **关键：`system_id + svc_cd` 共同确定一条适配器记录。**  
> 注册时用什么组合，提交请求就必须携带同样的组合，否则会报"未注册"。

**svc_cd 的来源（提交请求侧）**

- 直连调用（直接 POST JSON）：请求体里的 `svc_cd` 字段，不填默认为 `""`
- ESB 网关转发：从 `callbackUrl` 的 JSON 字符串中解析，如：

  ```json
  { "callbackUrl": "/aml-api/callback", "svcCd": "012345" }
  ```

  此时实际 `svc_cd` 为 `"012345"`，注册时必须保持一致。

---

## 第二步：注册适配器

### 接口

```
POST /api/admin/adapters
Content-Type: application/json
X-API-Key: <网关 API Key>
```

### 请求体字段

| 字段 | 必填 | 类型 | 说明 |
|------|------|------|------|
| `system_id` | 是 | string | 系统唯一标识 |
| `svc_cd` | 否 | string | 业务细分码，默认 `""` |
| `display_name` | 否 | string | 可读名称，仅用于展示 |
| `agent_url` | 是 | string | Flowise prediction 完整 URL |
| `form_schema` | 是 | object | JSON Schema，用于校验提交请求的 `form` 字段 |
| `response_map` | 是 | object | 从 Flowise 响应中提取回调字段的映射规则 |

### response_map 结构

```json
{
  "nodeIdPrefix": "directReplyAgentflow_",
  "stateFields": {
    "回调字段名A": "state中的字段名",
    "回调字段名B": ["state字段1", "state字段2"]
  }
}
```

- `nodeIdPrefix`：Flowise `agentFlowExecutedData` 中目标节点 ID 的前缀，匹配第一个符合的节点
- `stateFields`：key 为最终回调给上游的字段名，value 为：
  - 字符串：直接取 `state` 中对应字段
  - 字符串数组：将多个字段拼接（以 `\n` 分隔），用于字段合并的场景

### 示例

```bash
curl -X POST http://<网关地址>/api/admin/adapters \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "system_id": "NAML",
    "svc_cd": "",
    "display_name": "反洗钱-NAML系统",
    "agent_url": "http://flowise:3000/api/v1/prediction/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "form_schema": {
      "type": "object",
      "required": ["customer_info", "bank_statement_info"],
      "properties": {
        "customer_info":       { "type": "string" },
        "bank_statement_info": { "type": "string" },
        "feature_info":        { "type": "string" }
      },
      "additionalProperties": false
    },
    "response_map": {
      "nodeIdPrefix": "directReplyAgentflow_",
      "stateFields": {
        "ai_result":  "analysisResult",
        "risk_level": "riskLevel"
      }
    }
  }'
```

### 成功响应

```json
{ "code": 0, "msg": "适配器注册成功", "data": { "system_id": "NAML", "svc_cd": "" } }
```

> 重复调用此接口会覆盖已有配置，可用于更新 agent_url、form_schema 等字段。

---

## 第三步：验证注册

### 查询已注册的适配器列表

```bash
curl http://<网关地址>/api/admin/adapters \
  -H "X-API-Key: your-api-key"
```

响应示例：

```json
{
  "code": 0,
  "data": [
    { "system_id": "NAML", "svc_cd": "", "display_name": "反洗钱-NAML系统", "agent_url": "http://..." },
    { "system_id": "XJRCCB_AML", "svc_cd": "", "display_name": null, "agent_url": "http://..." }
  ]
}
```

### 提交测试案例

```bash
curl -X POST http://<网关地址>/api/v1/aml/data/submit \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "system_id":    "NAML",
    "svc_cd":       "",
    "request_id":   "test-001",
    "request_type": "0",
    "callback_url": "http://your-system/callback",
    "form": {
      "customer_info":       "张三，男，身份证 ...",
      "bank_statement_info": "近6个月流水 ..."
    }
  }'
```

同步响应 `code: 0` 表示接收成功，网关将异步调用智能体并推送回调。

---

## 管理接口汇总

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/admin/adapters` | 注册或更新适配器（同 system_id+svc_cd 覆盖） |
| `GET` | `/api/admin/adapters` | 查询所有已注册适配器（不含 form_schema 详情） |
| `DELETE` | `/api/admin/adapters` | 删除适配器，请求体传 `{ "system_id": "...", "svc_cd": "..." }` |

---

## 提交接口说明

```
POST /api/v1/aml/data/submit
Content-Type: application/json
X-API-Key: <网关 API Key>
```

### 请求字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `system_id` | 是 | 必须与注册时完全一致 |
| `svc_cd` | 否 | 必须与注册时完全一致，默认 `""` |
| `request_id` | 是 | 上游案例唯一标识，同 system_id + request_type 防重 |
| `request_type` | 是 | `"0"` 排除 / `"1"` 上报 |
| `callback_url` | 是 | 处理完成后网关回调的地址 |
| `form` | 是 | 业务字段，由注册时的 form_schema 校验 |

### 同步响应码

| code | 含义 |
|------|------|
| `0` | 接收成功，异步处理中 |
| `1` | 重复提交，同类型任务处理中 |
| `2` | system_id + svc_cd 未注册 |
| `3` | form 字段校验失败 |

### 异步回调（处理完成后推送）

```json
{
  "request_id":         "test-001",
  "system_id":          "NAML",
  "request_type":       "0",
  "msg": {
    "ai_result":  "...",
    "risk_level": "..."
  },
  "report_create_time": "2026-04-20 10:30:00"
}
```

`msg` 内的字段由注册时 `response_map.stateFields` 决定。

---

## 常见问题

**Q：system_id 或 svc_cd 填错了会怎样？**

同步返回 `{"code": 2, "msg": "system_id [xxx] 未注册，请联系网关管理员"}`，不写库不触发异步。

**Q：注册成功但提交还是报"未注册"？**

99% 是 `svc_cd` 不一致。注册时的 `svc_cd` 必须和提交请求实际携带的 `svc_cd` 完全匹配。ESB 转发场景下，`svc_cd` 从 `callbackUrl` 的 JSON 字符串里解析（见第一步）。

**Q：form 字段不符合规则会怎样？**

同步返回 `{"code": 3, "msg": "form 字段校验失败: /字段名 must be string"}`，不写库不触发异步。

**Q：不同部门可以用同一个智能体 URL 吗？**

可以，`agent_url` 填相同值即可，各部门的 `form_schema` 和 `response_map` 独立配置。

**Q：修改适配器配置需要重启服务吗？**

不需要。每次请求都从 Redis 实时读取，重新 POST 注册接口即可立即生效。

**Q：如何删除一个适配器？**

```bash
curl -X DELETE http://<网关地址>/api/admin/adapters \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{ "system_id": "NAML", "svc_cd": "" }'
```

---

## 现有业务参考

| system_id | svc_cd | 业务说明 |
|-----------|--------|---------|
| `XJRCCB_AML` | `""` | 反洗钱系统 |
