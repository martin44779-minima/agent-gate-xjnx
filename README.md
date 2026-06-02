# Agent Gate — AML 智能体接入网关

> 反洗钱（AML）AI 分析平台的统一接入网关，负责接收上游业务系统提交的案例分析请求，异步调用 Flowise 智能体完成 AI 分析，并通过 ESB 将结果回调到下游系统。

---

## 项目背景

银行反洗钱合规场景中，多个业务系统（风控、审计、人工审核等）需要调用同一套 AI 分析能力（基于 Flowise 搭建的智能体 Flow）。直接暴露 Flowise 接口存在以下问题：

- 各业务系统耦合 Flowise 接口格式，升级困难
- 无统一的认证、限流、重试机制
- 无任务追踪和回调能力

Agent Gate 作为中间层，屏蔽了底层智能体差异，向上游提供统一的 REST 接口，向下游通过 ESB 标准报文回调结果。

---

## 架构

```
上游业务系统
     │
     │  POST /api/submit（同步接收，立即返回 task_id）
     ▼
┌─────────────────────────────────────────────────────┐
│                    Agent Gate                        │
│                                                      │
│  ┌─────────────┐    ┌──────────────┐                │
│  │  Gateway    │───▶│  Scheduler   │                │
│  │  Service    │    │  Service     │                │
│  └─────────────┘    └──────┬───────┘               │
│         │                  │                        │
│  ┌──────▼──────┐    ┌──────▼───────┐               │
│  │  task_main  │    │  BizAdapter  │               │
│  │  task_raw   │    │  （per sysId）│              │
│  │  task_result│    └──────┬───────┘               │
│  └─────────────┘           │                        │
│      GaussDB/openGauss      │                       │
│                      ┌──────▼───────┐               │
│                      │ AgentService │               │
│                      └──────┬───────┘               │
└─────────────────────────────┼───────────────────────┘
                               │  POST（Flowise prediction API）
                               ▼
                     Flowise 智能体平台
                               │
                    ┌──────────▼──────────┐
                    │  CallbackService     │
                    │  ESB 标准报文回调    │
                    └──────────┬──────────┘
                               │
                          下游业务系统
```

---

## 核心流程

| 阶段 | 描述 |
|------|------|
| **接收** | 上游 POST `/api/submit`，网关校验请求、防重检查，写入 `task_main` + `task_raw_data`，立即返回 `{code:0, request_id}` |
| **调度** | 通过内存事件总线（EventEmitter）异步触发 `schedulerService.processTask` |
| **适配** | 根据 `system_id` 从 Redis 获取注册的 `BizAdapter`，组装智能体请求 payload |
| **调用** | `agentService.invoke` 调用 Flowise prediction 端点（支持超时配置） |
| **解析** | 适配器 `parseResponse` 将 Flowise 原始响应解析为业务回调字段 |
| **回调** | `callbackService.notifyDownstream` 按 ESB 标准报文格式回调下游，支持指数退避重试 |
| **重试** | 智能体调用失败时，可重试错误（超时/503/429）自动延迟重试，最多 `RETRY_MAX` 次 |

---

## 目录结构

```
agent-gate/
├── src/
│   ├── adapters/           # 业务适配器（每个 system_id 一个适配器）
│   │   ├── adapter.interface.ts   # BizAdapter 接口定义
│   │   ├── aml.adapter.ts         # AML 反洗钱适配器实现
│   │   ├── dynamic.adapter.ts     # 动态适配器（从 Redis 读取配置）
│   │   └── index.ts               # 适配器注册表
│   ├── controllers/        # HTTP 路由控制器
│   ├── services/
│   │   ├── gateway.service.ts     # 接收入口：校验、防重、写库、触发事件
│   │   ├── scheduler.service.ts   # 调度：监听事件、驱动任务全流程
│   │   ├── agent.service.ts       # 调用 Flowise 智能体
│   │   ├── callback.service.ts    # ESB 回调（含重试）
│   │   ├── storage.service.ts     # 原始数据 & 结果读写
│   │   └── event-bus.ts           # 内存事件总线
│   ├── models/             # GaussDB 数据模型
│   ├── middleware/         # 认证、限流、IP 白名单、日志
│   ├── config/             # 配置读取（dotenv）
│   └── utils/              # 工具函数（加密、脱敏、错误类型）
├── docs/
│   ├── adapter-guide.md    # 适配器接入指南
│   ├── deployment.md       # 部署文档
│   └── testing-guide.md    # 测试指南
├── scripts/
│   └── init-db.sql         # 数据库初始化脚本
├── test/                   # Jest 单元测试 + 测试 fixture
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 快速开始

### 1. 环境准备

- Node.js >= 18
- GaussDB / openGauss 数据库
- Redis 哨兵集群（用于适配器注册表）
- Flowise 智能体平台

### 2. 初始化数据库

```bash
psql -h <host> -U <user> -d <db> -f scripts/init-db.sql
```

### 3. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填写数据库、Redis、Flowise 地址等
```

### 4. 本地启动（开发模式）

```bash
npm install
npm run dev
```

### 5. Docker 启动

```bash
docker build -t agent-gate .
docker run -d --env-file .env -p 3000:3000 agent-gate
```

---

## 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `DB_HOST` | 数据库主机 | `10.0.0.1` |
| `DB_PORT` | 数据库端口 | `8000` |
| `DB_USER` / `DB_PASSWORD` | 数据库凭证 | — |
| `DB_NAME` / `DB_SCHEMA` | 数据库名/Schema | — |
| `AW_AGENT_URL` | Flowise prediction 端点 | `http://flowise:3000/api/v1/prediction/<flow-id>` |
| `AW_TIMEOUT_MS` | 智能体调用超时（ms） | `600000` |
| `RETRY_MAX` | 最大重试次数 | `3` |
| `RETRY_INTERVAL_MS` | 重试间隔（ms） | `30000` |
| `ESB_CALLBACK_ENABLED` | 是否拼接 ESB 回调地址 | `true` |
| `ESB_CALLBACK_BASE_URL` | ESB 分发服务地址 | `http://esb-host:port` |
| `CALLBACK_RETRY_INTERVALS` | 回调重试间隔序列（ms，逗号分隔） | `3000,10000,30000` |
| `AUTH_ENABLED` | 是否开启 API 认证 | `false`（内网部署） |
| `REDIS_SENTINEL_HOST_*` | Redis 哨兵节点 | — |

---

## API 接口

### 提交分析任务

```
POST /api/submit
Content-Type: application/json
```

请求体：

```json
{
  "request_id": "REQ-2024-001",
  "request_type": "AML_CASE_ANALYSIS",
  "system_id": "AML_SYSTEM",
  "callback_url": "/callback/aml/result",
  "form": {
    "customer_info": "客户姓名：张三，证件号：...",
    "customer_account_info": "账户：6217001234567890，开户行：...",
    "bank_statement_info": "2024-01 转入 50万，来源：...",
    "feature_info": "近3月交易频次异常，涉及多个高风险地区...",
    "summery_info": "疑似利用多层账户转移资金..."
  }
}
```

响应：

```json
{
  "code": 0,
  "msg": "success",
  "request_id": "REQ-2024-001"
}
```

| code | 含义 |
|------|------|
| `0` | 接收成功，异步处理中 |
| `1` | 重复提交（同 request_id + 同类型任务处理中） |
| `2` | system_id 未注册 |
| `3` | form 字段校验失败 |

---

### 查询任务状态

```
GET /api/task/:taskId
GET /api/task/request/:requestId
```

---

### 适配器管理（Admin）

```
GET    /api/admin/adapters          # 查看已注册适配器列表
POST   /api/admin/adapters          # 注册新适配器
DELETE /api/admin/adapters/:systemId  # 删除适配器
```

---

## 适配器机制

每个接入方（`system_id`）对应一个 `BizAdapter`，实现三个方法：

```typescript
interface BizAdapter {
  validateForm(form: unknown): string | null;     // 校验入参
  buildAgentPayload(form: unknown): unknown;       // 组装智能体请求
  parseResponse(raw: unknown): Record<string, string>;  // 解析响应
  agentUrl?: string;       // 可选：指定专属智能体 URL
  callbackSvcCd?: string;  // 可选：ESB 回调接口编码
}
```

新业务系统接入只需实现 `BizAdapter` 并通过 Admin API 注册，无需修改网关核心代码。

---

## 技术栈

| 层次 | 技术 |
|------|------|
| 运行时 | Node.js 18 + TypeScript |
| Web 框架 | Express 4 |
| 数据库 | GaussDB / openGauss（`pg-opengauss` 驱动） |
| 缓存/注册表 | Redis 哨兵集群（ioredis） |
| 智能体平台 | Flowise（prediction API） |
| 日志 | Winston + daily-rotate-file |
| 测试 | Jest + Supertest |
| 容器化 | Docker |
| 校验 | AJV（JSON Schema） |
