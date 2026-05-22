# AML反洗钱数据处理网关 — 上线文档

## 1. 系统概述

| 项目 | 说明 |
|------|------|
| 服务名称 | agent-gate（AML反洗钱数据处理网关） |
| 版本 | 1.0.0 |
| 技术栈 | Node.js 20 + TypeScript + Express 4 |
| 数据库 | GaussDB (openGauss 兼容)，驱动 pg-opengauss |
| 缓存 | Redis Sentinel 集群（适配器注册 + 运行时数据） |
| 容器化 | Docker (linux/arm64)，多阶段构建 |
| 部署方式 | Docker / Helm (K8s) |
| 端口 | 3000 |

### 核心功能

1. **数据提交**：接收上游反洗钱系统的案例数据，异步调用 AI 智能体进行风险分析
2. **异步回调**：AI 分析完成后自动回调上游系统，默认通过 ESB 回调，也支持直连
3. **任务查询**：按 request_id + request_type 查询任务处理状态和结果
4. **适配器管理**：通过 Redis 注册不同业务的适配器（form 校验、payload 组装、响应解析）
5. **重试机制**：AI 调用失败自动重试，回调失败自动重试

---

## 2. 系统架构

```
上游反洗钱系统
     │
     ▼ (ESB / 直连)
┌─────────────────────────────────────────┐
│         AML 网关 (agent-gate)            │
│                                         │
│  ┌──────────┐  ┌──────────┐  ┌───────┐ │
│  │  提交接口 │  │  查询接口 │  │ 管理API│ │
│  └────┬─────┘  └──────────┘  └───┬───┘ │
│       │                           │     │
│  ┌────▼─────┐              ┌─────▼───┐ │
│  │ Gateway  │              │ Adapter  │ │
│  │ Service  │              │ Registry │ │
│  └────┬─────┘              │ (Redis)  │ │
│       │                    └─────────┘ │
│  ┌────▼─────┐                          │
│  │Scheduler │◄── eventBus              │
│  │ Service  │                          │
│  └──┬────┬──┘                          │
│     │    │                             │
│  ┌──▼──┐ ┌▼──────────┐                │
│  │Agent│ │ Callback  │                │
│  │Svc  │ │ Service   │                │
│  └──┬──┘ └────┬──────┘                │
│     │         │                       │
│  ┌──▼──┐  ┌───▼────┐                  │
│  │Redis│  │GaussDB │                  │
│  └─────┘  └────────┘                  │
└─────────┬──────────────────────────────┘
          │
     ┌────▼─────┐
     │AgenticWork AI │
     │ 智能体平台 │
     └──────────┘
```

### 请求流程

```
1. 上游系统 → POST /api/v1/aml/data/submit (ESB包裹格式 或 直连snake_case格式)
2. 网关解包 → 适配器校验form → 写库 → 事件总线触发调度
3. 调度器 → 读取原始数据 → 适配器组装payload → 调用AgenticWork智能体
4. 智能体返回 → 适配器解析响应 → 保存结果 → 回调上游
5. 回调格式：ESB模式 { sysHead, body }(驼峰) / 直连模式 snake_case平铺
```

---

## 3. 部署前准备

### 3.1 基础设施清单

| 组件 | 版本要求 | 用途 |
|------|---------|------|
| GaussDB | openGauss 兼容 | 业务数据持久化 |
| Redis | 6.x+ (Sentinel 模式) | 适配器注册、运行时缓存 |
| Docker | 20.x+ | 容器化构建与本地部署 |
| Kubernetes + Helm | K8s 1.20+ / Helm 3 | 生产环境容器编排 |
| AgenticWork | 已部署 | AI 智能体推理平台 |

### 3.2 网络要求

| 方向 | 地址 | 端口 | 用途 |
|------|------|------|------|
| 出站 | GaussDB 主机 | 8000 | 数据库连接 |
| 出站 | Redis Sentinel 节点 ×3 | 6380 | Redis 高可用 |
| 出站 | AgenticWork AI 平台 | 8080 | 智能体调用 |
| 出站 | ESB 网关（回调） | 8017 | 回调上游系统 |
| 入站 | 上游调用方 | 3000 | API 接口访问 |

---

## 4. 数据库初始化

### 4.1 新库初始化

使用 `scripts/init-db.sql` 执行全量建表：

```bash
# 连接 GaussDB
gsql -h <DB_HOST> -p 8000 -U <DB_USER> -d <DB_NAME> -f scripts/init-db.sql
```

创建的表和索引：

| 表名 | 用途 | 关键索引 |
|------|------|---------|
| task_main | 任务主表（生命周期管理） | task_id(唯一), (request_id, request_type), system_id, task_status, create_time |
| task_raw_data | 原始入参数据 | task_id |
| task_result | AI 处理结果 | task_id(唯一) |

---

## 5. 环境变量配置

### 5.1 完整环境变量清单

在部署目录创建 `.env` 文件（Docker 部署），或通过 Helm values 配置（K8s 部署）：

```bash
# ========== 数据库配置 (GaussDB/openGauss) ==========
DB_HOST=<数据库主机>
DB_PORT=8000
DB_USER=<数据库用户>
DB_PASSWORD=<数据库密码>
DB_NAME=<数据库名>
DB_SCHEMA=<数据库schema>
DB_MAX_CONNECTIONS=20

# ========== AW智能体平台配置 ==========
# 完整URL，当前优先级已降低，优先获取redis中适配器配置的agent_url
AW_AGENT_URL=http://<host>:<port>/api/v1/prediction/<flow-id>
# AI调用超时（毫秒），默认10分钟
AW_TIMEOUT_MS=600000

# ========== 重试配置 ==========
RETRY_MAX=3
RETRY_INTERVAL_MS=30000

# ========== 回调配置 ==========
CALLBACK_TIMEOUT_MS=10000
CALLBACK_RETRY_MAX=3
CALLBACK_RETRY_INTERVALS=3000,10000,30000

# ========== 回调参数配置 ==========
# ESB_CALLBACK_ENABLED控制传入的回调地址是否需要使用ESB_CALLBACK_BASE_URL进行拼接
# true: 回调地址 = ESB_CALLBACK_BASE_URL + 入参callbackUrl（ESB模式）
# false: 直接使用入参callbackUrl作为完整回调地址（直连模式）
ESB_CALLBACK_ENABLED=true
ESB_CNSMR_SYS_NO_IND=LMAP
ESB_ORGNL_CNSMR_SYS_NO=LMAP
# esb分发的ip和端口
ESB_CALLBACK_BASE_URL=http://<esb-host>:<esb-port>
# 回调时 sysHead.svcCd 的值，即回调目标接口编码
# 注意：当前为全局配置，所有适配器共用同一个 svcCd；多部门回调接口码不同时需扩展适配器字段
ESB_CALLBACK_SVC_CD=40012N0011

# ========== 安全配置 ==========
# AUTH_ENABLED=false 时关闭所有认证，内网部署推荐关闭
AUTH_ENABLED=false
ALLOWED_API_KEYS=
IP_WHITELIST=
SIGNATURE_SECRET=

# ========== Redis 哨兵配置（用于适配器注册表持久化存储） ==========
REDIS_SENTINEL_HOST_1=<哨兵节点1>
REDIS_SENTINEL_HOST_2=<哨兵节点2>
REDIS_SENTINEL_HOST_3=<哨兵节点3>
REDIS_SENTINEL_PORT=6380
REDIS_SENTINEL_NAME=redis6379
REDIS_SENTINEL_PASSWORD=<哨兵密码>
REDIS_PASSWORD=<Redis密码>
```

### 5.2 关键配置说明

| 配置项 | 生产建议 | 说明 |
|--------|---------|------|
| `DB_*` | 按实际环境 | 数据库连接信息，DB_HOST/USER/PASSWORD/NAME/SCHEMA 为必填 |
| `DB_MAX_CONNECTIONS` | `20` | 根据并发量调整，GaussDB 侧也需确认连接数上限 |
| `AW_AGENT_URL` | 配置全局兜底 URL | 优先使用 Redis 适配器中的 agent_url，此处为兜底 |
| `AW_TIMEOUT_MS` | `600000` | AI 分析可能耗时较长，建议不低于 5 分钟 |
| `CALLBACK_RETRY_INTERVALS` | `3000,10000,30000` | 回调重试间隔，依次递增 |
| `ESB_CALLBACK_ENABLED` | `true` | 控制回调地址是否拼接 ESB_CALLBACK_BASE_URL |
| `ESB_CALLBACK_BASE_URL` | 按实际 ESB 地址 | esb 分发的 IP 和端口，ESB 模式下必须配置 |
| `ESB_CALLBACK_SVC_CD` | `40012N0011` | 回调时 sysHead.svcCd，即回调目标接口编码；当前全局唯一，多部门不同接口码时需扩展 |
| `ESB_CNSMR_SYS_NO_IND` | `LMAP` | 回调 sysHead.cnsmrSysNoInd |
| `ESB_ORGNL_CNSMR_SYS_NO` | `LMAP` | 回调 sysHead.orgnlCnsmrSysNo |
| `REDIS_SENTINEL_HOST_*` | 按实际环境 | Redis 哨兵节点地址，适配器注册表依赖此配置 |
| `AUTH_ENABLED` | `false` | 内网部署关闭认证；如需公网暴露则开启 |

---

## 6. 部署方式

### 6.1 Docker 部署

#### 构建镜像

```bash
# 在项目根目录执行
docker build -t agent-gate:1.0.0 .
```

构建说明：
- 多阶段构建，最终镜像仅包含编译产物和生产依赖
- 基础镜像：`docker.m.daocloud.io/library/node:20.19.5-bookworm-slim` (arm64)
- 国内镜像源：npm 使用 npmmirror，apt 使用阿里云
- 入口命令：`dumb-init node dist/server.js`（支持优雅信号传递）

#### 运行容器

```bash
docker run -d \
  --name agent-gate \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /path/to/.env:/app/.env:ro \
  -v /path/to/logs:/app/logs \
  agent-gate:1.0.0
```

#### docker-compose 示例

```yaml
version: '3.8'
services:
  agent-gate:
    image: agent-gate:1.0.0
    container_name: agent-gate
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    volumes:
      - ./logs:/app/logs
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000/health', r => r.statusCode === 200 ? process.exit(0) : process.exit(1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '2'
```

### 6.2 Helm 部署 (Kubernetes)

#### Helm Chart 目录结构

```
helm/agent-gate/
├── Chart.yaml
├── values.yaml
└── templates/
    ├── deployment.yaml
    ├── service.yaml
    ├── configmap.yaml
    ├── secret.yaml
    └── hpa.yaml
```

#### values.yaml 示例

```yaml
replicaCount: 1

image:
  repository: <镜像仓库地址>/agent-gate
  tag: "1.0.0"
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 3000

resources:
  limits:
    cpu: "2"
    memory: 1Gi
  requests:
    cpu: "0.5"
    memory: 512Mi

autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 3
  targetCPUUtilizationPercentage: 80

# 环境变量 — 非敏感项
env:
  DB_HOST: "<数据库主机>"
  DB_PORT: "8000"
  DB_USER: "<数据库用户>"
  DB_NAME: "<数据库名>"
  DB_SCHEMA: "<数据库schema>"
  DB_MAX_CONNECTIONS: "20"
  AW_AGENT_URL: "http://<host>:<port>/api/v1/prediction/<flow-id>"
  AW_TIMEOUT_MS: "600000"
  RETRY_MAX: "3"
  RETRY_INTERVAL_MS: "30000"
  CALLBACK_TIMEOUT_MS: "10000"
  CALLBACK_RETRY_MAX: "3"
  CALLBACK_RETRY_INTERVALS: "3000,10000,30000"
  ESB_CALLBACK_ENABLED: "true"
  ESB_CNSMR_SYS_NO_IND: "LMAP"
  ESB_ORGNL_CNSMR_SYS_NO: "LMAP"
  ESB_CALLBACK_BASE_URL: "http://<esb-host>:<esb-port>"
  ESB_CALLBACK_SVC_CD: "40012N0011"
  AUTH_ENABLED: "false"

# Redis 哨兵配置
redisSentinel:
  host1: "<哨兵节点1>"
  host2: "<哨兵节点2>"
  host3: "<哨兵节点3>"
  port: "6380"
  name: "redis6379"

# 敏感信息 — 通过 Secret 注入
secrets:
  DB_PASSWORD: <base64编码的密码>
  REDIS_PASSWORD: <base64编码的密码>
  REDIS_SENTINEL_PASSWORD: <base64编码的密码>

healthCheck:
  liveness:
    httpGet:
      path: /health
      port: 3000
    initialDelaySeconds: 15
    periodSeconds: 30
  readiness:
    httpGet:
      path: /health
      port: 3000
    initialDelaySeconds: 10
    periodSeconds: 10
```

#### 部署命令

```bash
# 安装
helm install agent-gate ./helm/agent-gate -n <namespace>

# 升级
helm upgrade agent-gate ./helm/agent-gate -n <namespace>

# 回滚
helm rollback agent-gate <revision> -n <namespace>

# 卸载
helm uninstall agent-gate -n <namespace>
```

---

## 7. 适配器注册

服务启动后，需注册各业务的适配器。适配器配置存储在 Redis 中，key 格式为 `adapter:{system_id}:{svc_cd}`。

### 7.1 方式一：通过管理 API 注册（推荐）

#### 注册适配器

```bash
curl -X POST 'http://<HOST>:3000/api/admin/adapters' \
  -H 'Content-Type: application/json' \
  -d '{
    "system_id": "AML_XJNX",
    "svc_cd": "40012N0011",
    "display_name": "新疆农信反洗钱",
    "agent_url": "http://10.1.161.125:3930/api/v1/prediction/165e15c4-0fdb-723f-1549-0cda411dc1c3",
    "callback_svc_cd": "40012N0011",
    "form_schema": {
      "type": "object",
      "required": ["customer_info", "customer_account_info", "bank_statement_info", "feature_info", "summery_info"],
      "properties": {
        "customer_info":                { "type": "string" },
        "customer_account_info":        { "type": "string" },
        "bank_statement_info":          { "type": "string" },
        "feature_info":                 { "type": "string" },
        "summery_info":                 { "type": "string" },
        "feature_statement_info":       { "type": "string" },
        "history_case_info":            { "type": "string" },
        "doubt_exclusion_reasons_info": { "type": "string" },
        "due_diligence_info":           { "type": "string" },
        "history_rating_info":          { "type": "string" }
      },
      "additionalProperties": false
    },
    "response_map": {
      "nodeIdPrefix": "directReplyAgentflow_",
      "stateFields": {
        "customer_behavior_analysis": "customer_behavior_analysis",
        "account_transaction_analysis": "account_transaction_analysis",
        "doubtful_point_analysis": ["doubtful_point_analysis1", "doubtful_point_analysis2"],
        "analysis_report": "analysis_report"
      }
    }
  }'
```

#### 查看已注册适配器

```bash
curl 'http://<HOST>:3000/api/admin/adapters'
```

#### 删除适配器

```bash
curl -X DELETE 'http://<HOST>:3000/api/admin/adapters' \
  -H 'Content-Type: application/json' \
  -d '{"system_id": "AML_XJNX", "svc_cd": "40012N0011"}'
```

### 7.2 方式二：直接写入 Redis

当管理 API 不可用时，可直接通过 redis-cli 写入适配器配置：

```bash
# 连接 Redis（通过 Sentinel 获取 master 地址后连接）
redis-cli -h <redis-master-host> -p 6379 -a <password>

# 写入适配器（key 格式: adapter:{system_id}:{svc_cd}）
SET adapter:AML_XJNX:40012N0011 '{
  "system_id": "AML_XJNX",
  "svc_cd": "40012N0011",
  "display_name": "新疆农信反洗钱",
  "agent_url": "http://10.1.161.125:3930/api/v1/prediction/165e15c4-0fdb-723f-1549-0cda411dc1c3",
  "callback_svc_cd": "40012N0011",
  "form_schema": {
    "type": "object",
    "required": ["customer_info", "customer_account_info", "bank_statement_info", "feature_info", "summery_info"],
    "properties": {
      "customer_info":                { "type": "string" },
      "customer_account_info":        { "type": "string" },
      "bank_statement_info":          { "type": "string" },
      "feature_info":                 { "type": "string" },
      "summery_info":                 { "type": "string" },
      "feature_statement_info":       { "type": "string" },
      "history_case_info":            { "type": "string" },
      "doubt_exclusion_reasons_info": { "type": "string" },
      "due_diligence_info":           { "type": "string" },
      "history_rating_info":          { "type": "string" }
    },
    "additionalProperties": false
  },
  "response_map": {
    "nodeIdPrefix": "directReplyAgentflow_",
    "stateFields": {
      "customer_behavior_analysis": "customer_behavior_analysis",
      "account_transaction_analysis": "account_transaction_analysis",
      "doubtful_point_analysis": ["doubtful_point_analysis1", "doubtful_point_analysis2"],
      "analysis_report": "analysis_report"
    }
  }
}'

# 直连模式（无 svc_cd）的 key 格式
SET adapter:AML_XJNX: '{
  "system_id": "AML_XJNX",
  "svc_cd": "",
  "display_name": "新疆农信反洗钱（直连）",
  "agent_url": "http://10.1.161.125:3930/api/v1/prediction/165e15c4-0fdb-723f-1549-0cda411dc1c3",
  ...
}'

# 验证写入
GET adapter:AML_XJNX:40012N0011

# 查看所有适配器 key
KEYS adapter:*
```

> **注意**：直接写入 Redis 无 TTL（永久持久化），服务运行时实时生效，无需重启。

### 7.3 适配器字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `system_id` | 是 | 业务系统标识，与提交接口的 system_id 对应 |
| `svc_cd` | 否 | ESB 接口编号，直连调用时为空字符串 |
| `display_name` | 否 | 显示名称 |
| `agent_url` | 是 | AgenticWork 智能体 URL，优先于全局 AW_AGENT_URL |
| `callback_svc_cd` | 否 | ESB 回调时 sysHead.svcCd（即回调目标接口编码）；不填则使用全局 ESB_CALLBACK_SVC_CD；**不同部门回调接口码不同时必填** |
| `form_schema` | 是 | JSON Schema 格式，用于校验入参 form 字段 |
| `response_map.nodeIdPrefix` | 是 | AgenticWork 响应中终止节点 ID 的前缀 |
| `response_map.stateFields` | 是 | 输出字段映射，key 为回调字段名，value 为 AgenticWork state 字段名；value 为数组时按 `\n` 拼接多字段 |

---

## 8. 接口清单

### 8.1 数据提交

```
POST /api/v1/aml/data/submit
```

**ESB 模式请求体**（默认，ESB 自动包裹）：

```json
{
  "sysHead": {
    "svcCd": "40012N0011",
    "scnCd": "",
    "chnlTp": "",
    "branchId": "0101",
    "tlrNo": "teller01",
    "cnsmrSysNo": "UPSTREAM_001",
    "glblSrlNo": "GLBL_001"
  },
  "body": {
    "requestId": "REQ-20260522-001",
    "requestType": "0",
    "systemId": "AML_XJNX",
    "callbackUrl": "/aml-api/permitall/callback/ai/caseReport",
    "form": {
      "customer_info": "...",
      "customer_account_info": "...",
      "bank_statement_info": "...",
      "feature_info": "...",
      "summery_info": "..."
    }
  }
}
```

**直连模式请求体**（`ESB_CALLBACK_ENABLED=false` 时）：

```json
{
  "request_id": "REQ-20260522-001",
  "request_type": "0",
  "system_id": "AML_XJNX",
  "callback_url": "/aml-api/permitall/callback/ai/caseReport",
  "form": {
    "customer_info": "...",
    "customer_account_info": "...",
    "bank_statement_info": "...",
    "feature_info": "...",
    "summery_info": "..."
  }
}
```

**响应**：

```json
{
  "code": 0,
  "msg": "success",
  "request_id": "REQ-20260522-001"
}
```

| code | 含义 |
|------|------|
| 0 | 提交成功 |
| 1 | 重复提交（同 request_id + request_type 有活跃任务） |
| 2 | system_id 未注册适配器 |
| 3 | form 字段校验失败 |

### 8.2 任务查询

```
POST /api/cases/query
```

**请求体**：

```json
{
  "system_id": "AML_XJNX",
  "request_id": "REQ-20260522-001",
  "request_type": "0"
}
```

### 8.3 任务详情

```
GET /api/v1/aml/task/:taskId
```

### 8.4 健康检查

```
GET /health
```

**响应**：

```json
{
  "status": "ok",
  "timestamp": "2026-05-22T10:00:00.000Z"
}
```

### 8.5 适配器管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/admin/adapters | 列出所有适配器 |
| POST | /api/admin/adapters | 注册/更新适配器 |
| DELETE | /api/admin/adapters | 删除适配器 |

---

## 9. ESB 对接说明

### 9.1 入参适配

ESB 转发请求时会将业务参数包裹在 `{ sysHead, body }` 结构中，并使用驼峰命名。网关中间件自动检测并解包为内部 snake_case 格式。

同时，ESB 会错误设置 `Content-Encoding: utf-8` 头，网关已内置中间件自动清除。

### 9.2 回调适配

ESB 模式下（`ESB_CALLBACK_ENABLED=true`），回调请求体自动包裹为 ESB 格式：

```json
{
  "sysHead": {
    "svcCd": "40012N0011",
    "scnCd": "<上游传入>",
    "chnlTp": "<上游传入>",
    "lglPrsnCd": "",
    "branchId": "<上游传入>",
    "tlrNo": "<上游传入>",
    "cnsmrSysNoInd": "LMAP",
    "cnsmrSysNo": "<上游传入>",
    "orgnlCnsmrSysNo": "LMAP",
    "txnDt": "20260522",
    "txnTm": "100000",
    "cnsmrSrlNo": "AI_<cnsmrSysNo>_<日期><时间>",
    "glblSrlNo": "<上游传入>",
    "tmlIdNo": "<上游传入>",
    "mac": "<上游传入>",
    "sgntrVerfSgntr": "<上游传入>",
    "stdIntfVerNo": "<上游传入>",
    "usrLng": "<上游传入>",
    "fileFlg": "<上游传入>",
    "filePath": "<上游传入>",
    "sysPrestoreFlgStrg": "<上游传入>",
    "sysPrestoreCharStrg": "<上游传入>"
  },
  "body": {
    "requestId": "REQ-20260522-001",
    "systemId": "AML_XJNX",
    "requestType": "0",
    "msg": {
      "customer_behavior_analysis": "...",
      "account_transaction_analysis": "...",
      "doubtful_point_analysis": "...",
      "analysis_report": "..."
    },
    "reportCreateTime": "2026-05-22 10:00:00"
  }
}
```

**sysHead 字段来源**：

| 来源 | 字段 | 说明 |
|------|------|------|
| 配置项 | `svcCd` | 取 `ESB_CALLBACK_SVC_CD` 配置值 |
| 配置项 | `cnsmrSysNoInd` | 取 `ESB_CNSMR_SYS_NO_IND` 配置值 |
| 配置项 | `orgnlCnsmrSysNo` | 取 `ESB_ORGNL_CNSMR_SYS_NO` 配置值 |
| 动态生成 | `txnDt` / `txnTm` | 回调时刻的日期和时间 |
| 动态生成 | `cnsmrSrlNo` | `AI_{cnsmrSysNo}_{日期}{时间}` |
| 固定值 | `lglPrsnCd` | 固定为空字符串 |
| 上游传入 | 其余 18 个字段 | 从入参 sysHead 原样保存，回调时回传 |

### 9.3 回调 URL 拼接规则

```
完整回调 URL = ESB_CALLBACK_BASE_URL + callback_url
```

- `ESB_CALLBACK_BASE_URL`：环境变量配置的 ESB 基地址（如 `http://10.1.162.26:8017`）
- `callback_url`：入参中的文根路径（如 `/aml-api/permitall/callback/ai/caseReport`）
- 示例：`http://10.1.162.26:8017` + `/aml-api/permitall/callback/ai/caseReport` = `http://10.1.162.26:8017/aml-api/permitall/callback/ai/caseReport`
- 直连模式（`ESB_CALLBACK_ENABLED=false`）时，callback_url 应为完整 URL

### 9.4 ESB 开关切换

ESB 功能通过 `ESB_CALLBACK_ENABLED` 控制，重启服务生效：

| 值 | 行为 |
|----|------|
| `true`（默认） | ESB 模式：入参自动解包驼峰格式，回调自动包裹 `{ sysHead, body }` 格式 |
| `false` | 直连模式：入参和回调均使用 snake_case 平铺格式 |

---

## 10. 上线检查清单

### 10.1 部署前

- [ ] GaussDB 数据库已初始化（全量或增量迁移）
- [ ] Redis Sentinel 集群可正常连接
- [ ] AgenticWork AI 智能体平台可正常访问
- [ ] 网络策略已放通（数据库、Redis、AgenticWork、ESB）
- [ ] 环境变量已按生产环境配置（`.env` 或 Helm values）
- [ ] 生产环境密码已替换（DB_PASSWORD、REDIS_PASSWORD 等）

### 10.2 构建与部署

- [ ] Docker 镜像构建成功（或已推送到镜像仓库）
- [ ] 容器/Pod 正常启动，日志无报错
- [ ] 健康检查接口返回正常 (`GET /health`)

### 10.3 功能验证

- [ ] 适配器已注册（`GET /api/admin/adapters` 或 `KEYS adapter:*` 确认）
- [ ] 提交接口正常（ESB 模式 POST `/api/v1/aml/data/submit`）
- [ ] AI 调用链路通畅（任务状态从 0 → 2）
- [ ] 回调通知成功送达上游系统
- [ ] 查询接口正常（`POST /api/cases/query`）
- [ ] 重试机制正常（模拟 AI 调用失败场景）

### 10.4 ESB 验证

- [ ] ESB 入参格式可正常解析
- [ ] 回调格式符合 ESB 规范（`{ sysHead, body }` 驼峰格式）
- [ ] 回调 URL 拼接正确（`ESB_CALLBACK_BASE_URL + callback_url`）
- [ ] sysHead 字段完整（上游传入 + 配置项 + 动态生成）

---

## 11. 运维指南

### 11.1 日志

日志使用 winston + daily-rotate-file，输出到 stdout 和文件。

- 日志级别：`debug` / `info` / `warn` / `error`
- 模块日志：`[模块名]` 前缀（scheduler / callback / gateway / adapter-registry / database / redis）
- 生产建议设置 `NODE_ENV=production`，默认 info 级别

### 11.2 任务状态流转

```
0(待处理) → 1(处理中) → 2(已完成)
                    ↓
               3(重试中) → 1(处理中) → 2(已完成)
                    ↓ (重试耗尽)
               4(失败)
```

| 状态值 | 含义 | 说明 |
|--------|------|------|
| 0 | 待处理 | 刚创建，等待调度 |
| 1 | 处理中 | 正在调用 AgenticWork 智能体 |
| 2 | 已完成 | AI 分析完成，已回调上游 |
| 3 | 重试中 | AI 调用失败，等待下次重试 |
| 4 | 失败 | 重试耗尽，最终失败 |

### 11.3 常见问题排查

| 现象 | 可能原因 | 排查方式 |
|------|---------|---------|
| 提交返回 code=2 | system_id 未注册适配器 | `GET /api/admin/adapters` 或 `KEYS adapter:*` 检查 |
| 提交返回 code=3 | form 字段不满足 JSON Schema | 检查适配器 form_schema 配置 |
| 提交返回 code=1 | 重复提交 | 查询该 request_id 是否已有活跃任务 |
| 任务一直 0(待处理) | 事件总线未触发 | 检查 scheduler 日志 |
| 任务 4(失败) | AI 调用失败或超时 | 检查 agent_url 可达性、AW_TIMEOUT_MS 配置 |
| 回调失败 | 上游系统不可达或返回 code!=0 | 检查 callback_path 和 ESB_CALLBACK_BASE_URL |
| ESB Content-Encoding 报错 | ESB 设置了非法 Content-Encoding: utf-8 | 已内置中间件处理，确认版本包含此修复 |
| Redis 连接失败 | Sentinel 地址或密码错误 | 检查 `src/database/redis.ts` 中的配置 |
| 适配器加载失败 | Redis 中 JSON 格式错误 | `GET adapter:{system_id}:{svc_cd}` 检查 JSON 合法性 |

### 11.4 优雅关闭

服务收到 SIGTERM/SIGINT 信号后：
1. 停止接受新请求
2. 等待正在处理的请求完成（超时 10 秒强制退出）
3. 关闭数据库连接池
4. 进程退出

K8s 环境下需确保 `terminationGracePeriodSeconds` >= 15 秒。

### 11.5 监控建议

- **健康检查**：`GET /health`，接入 K8s liveness/readiness 探针或负载均衡健康探测
- **数据库连接池**：关注 `DB_MAX_CONNECTIONS` 使用率
- **Redis**：监控 Sentinel 连接状态
- **任务积压**：`SELECT task_status, COUNT(*) FROM task_main GROUP BY task_status`
- **回调成功率**：日志搜索 `回调通知成功` vs `回调最终失败`
- **AI 调用耗时**：关注 `total_cost_ms` 字段，异常偏高可能为智能体性能问题

---

## 12. 回滚方案

### 12.1 应用回滚

**Docker**：

```bash
docker stop agent-gate
docker run -d \
  --name agent-gate \
  --restart unless-stopped \
  -p 3000:3000 \
  -v /path/to/.env:/app/.env:ro \
  -v /path/to/logs:/app/logs \
  agent-gate:<上一版本tag>
```

**Helm**：

```bash
# 查看历史版本
helm history agent-gate -n <namespace>

# 回滚到指定版本
helm rollback agent-gate <revision> -n <namespace>
```

### 12.2 数据库回滚

增量迁移新增的列均为可空或有默认值，回滚时无需删除列。如需完全回滚：

```sql
ALTER TABLE task_main DROP COLUMN IF EXISTS esb_sys_head;
ALTER TABLE task_main DROP COLUMN IF EXISTS cnsmr_sys_no;
ALTER TABLE task_main DROP COLUMN IF EXISTS callback_path;
ALTER TABLE task_main DROP COLUMN IF EXISTS callback_svc_cd;
ALTER TABLE task_main DROP COLUMN IF EXISTS svc_cd;
```

### 12.3 ESB 模式切换

将 `ESB_CALLBACK_ENABLED` 改为 `false` 并重启服务即可切回直连模式，无需代码回滚。

### 12.4 适配器回滚

适配器配置存储在 Redis 中，不随应用版本变更。如需回滚适配器配置：

```bash
# 备份当前适配器
redis-cli -h <host> -a <password> --keys "adapter:*" | xargs -I {} redis-cli -h <host> -a <password> GET {} > adapter_backup.json

# 删除误配的适配器
redis-cli -h <host> -a <password> DEL adapter:AML_XJNX:40012N0011

# 重新写入正确配置（参见 7.2 节）
```

---

## 13. 依赖版本

| 依赖 | 版本 | 用途 |
|------|------|------|
| express | ^4.21.2 | Web 框架 |
| pg-opengauss | ^1.4.0 | GaussDB 数据库驱动 |
| ioredis | ^5.10.1 | Redis 客户端（支持 Sentinel） |
| axios | ^1.7.9 | HTTP 请求（回调、AI 调用） |
| ajv | ^8.17.1 | JSON Schema 校验（适配器 form 校验） |
| winston | ^3.17.0 | 日志框架 |
| helmet | ^8.0.0 | HTTP 安全头 |
| cors | ^2.8.5 | CORS 支持 |
| compression | ^1.7.5 | 响应压缩 |
| express-rate-limit | ^8.3.2 | 接口限流 |
| uuid | ^11.1.0 | 任务 ID 生成 |
