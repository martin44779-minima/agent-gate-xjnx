# AML 反洗钱数据处理网关 - 测试环境配置指南

## 1. 前置依赖

| 依赖项 | 版本要求 | 说明 |
|--------|---------|------|
| Node.js | >= 16.x | 推荐 20.x LTS |
| npm | >= 8.x | 随 Node.js 安装 |
| GaussDB / openGauss | >= 3.x | 也可用 PostgreSQL 12+ 本地替代 |
| AW 智能体平台 | - | 需要可访问的 flowise prediction 端点 |

## 2. 安装项目依赖

```bash
cd agent-gate
npm install
```

## 3. 环境变量配置

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

### 3.1 必填项

以下变量**必须配置**，缺失任何一项服务会启动失败：

| 变量名 | 当前实际值 | 说明 |
|-------|-----------|------|
| `DB_HOST` | `10.1.161.130` | GaussDB 地址 |
| `DB_USER` | `aw_user` | 数据库用户名 |
| `DB_PASSWORD` | `AiAw@123456` | 数据库密码 |
| `DB_NAME` | `aw3` | 数据库名称 |
| `AW_AGENT_URL` | `http://10.1.161.125:3930/api/v1/prediction/165e15c4-0fdb-723f-1549-0cda411dc1c3` | AW 智能体完整 URL |

### 3.2 选填项（有默认值）

| 变量名 | 默认值 | 说明 |
|-------|--------|------|
| `PORT` | `3000` | 服务监听端口 |
| `NODE_ENV` | `development` | 运行环境 |
| `DB_PORT` | `8000` | GaussDB 端口 |
| `DB_SCHEMA` | `public` | GaussDB schema，当前用 `aw3` |
| `DB_MAX_CONNECTIONS` | `20` | 连接池最大连接数 |
| `AW_TIMEOUT_MS` | `120000` | AW 调用超时（毫秒，默认2分钟） |
| `RETRY_MAX` | `3` | 最大重试次数 |
| `RETRY_INTERVAL_MS` | `30000` | 重试间隔（毫秒） |
| `CALLBACK_TIMEOUT_MS` | `10000` | 回调超时（毫秒） |

### 3.3 安全认证相关

| 变量名 | 默认值 | 说明 |
|-------|--------|------|
| `ALLOWED_API_KEYS` | 空 | 允许的 API Key 列表，逗号分隔。为空时仍需传 `X-API-Key` 头但不校验值 |
| `IP_WHITELIST` | 空 | IP 白名单，逗号分隔，为空不限制 |
| `SIGNATURE_SECRET` | 空 | HMAC-SHA256 签名密钥，**为空时不校验签名**，测试建议留空 |

### 3.4 测试用 .env 完整示例

```env
PORT=3000
NODE_ENV=development

DB_HOST=10.1.161.130
DB_PORT=8000
DB_USER=aw_user
DB_PASSWORD=AiAw@123456
DB_NAME=aw3
DB_SCHEMA=aw3

AW_AGENT_URL=http://10.1.161.125:3930/api/v1/prediction/165e15c4-0fdb-723f-1549-0cda411dc1c3
AW_TIMEOUT_MS=120000

ALLOWED_API_KEYS=test-key
SIGNATURE_SECRET=
```

## 4. 认证机制（重要）

所有 `/api/*` 路径的请求都需要通过认证。认证分三层，按优先级依次校验：

### 4.1 IP 白名单

- 由 `IP_WHITELIST` 环境变量控制
- **为空时**：不限制，任何 IP 都可访问
- **配置后**：仅白名单内的 IP 可访问，否则返回 `403`

```env
# 多个 IP 用逗号分隔
IP_WHITELIST=10.1.161.100,10.1.161.101,127.0.0.1
```

### 4.2 API Key 校验（必需）

> **所有 `/api/*` 请求都必须携带 `X-API-Key` 请求头，否则返回 `401`。**

```
X-API-Key: test-key
```

校验规则：
- 请求头 `X-API-Key` **必须存在**，否则返回 `401 缺少 X-API-Key 请求头`
- 如果 `ALLOWED_API_KEYS` 已配置（非空），Key 必须在列表中，否则返回 `401 无效的 API-Key`
- 如果 `ALLOWED_API_KEYS` 为空，仅检查请求头是否存在，不校验具体值

```env
# 多个 Key 用逗号分隔
ALLOWED_API_KEYS=test-key,prod-key-abc
```

### 4.3 HMAC 签名校验（可选）

- 由 `SIGNATURE_SECRET` 环境变量控制
- **为空时**：跳过签名校验（测试阶段推荐）
- **配置后**：请求需要额外携带 `X-Signature` 和 `X-Timestamp` 两个请求头

签名生成规则：

```
签名字符串 = HTTP方法 + 请求路径 + 时间戳(毫秒) + SHA256(请求体JSON)
签名结果 = HMAC-SHA256(SIGNATURE_SECRET, 签名字符串)，输出 hex
```

请求头示例：

```
X-API-Key: test-key
X-Timestamp: 1712476800000
X-Signature: a3f2b8c9d1e4...（64位hex字符串）
```

校验规则：
- 时间戳与服务器当前时间差不超过 **5 分钟**，否则返回 `401 请求时间戳过期`
- 签名不匹配返回 `401 签名验证失败`

> **测试阶段建议：`SIGNATURE_SECRET` 留空，只用 API Key 认证即可。**

### 4.4 不需要认证的接口

健康检查接口路径为 `/health`（不在 `/api/*` 下），**无需任何认证头**即可访问。

## 5. 数据库初始化

连接 GaussDB 执行建表脚本：

```bash
gsql -h 10.1.161.130 -p 8000 -U aw_user -d aw3 -f scripts/init-db.sql
```

> 如果需要指定 schema，先执行：
> ```sql
> SET search_path TO aw3, public;
> ```

建表脚本创建 3 张表：
- `task_main` - 任务主表（含 case_id、callback_url）
- `task_raw_data` - 原始数据表
- `task_result` - 处理结果表

## 6. 编译和启动

```bash
# 编译 TypeScript
npm run build

# 启动服务
npm start

# 或开发模式（ts-node 直接运行，无需编译）
npm run dev
```

启动成功日志：
```
服务启动成功，监听端口 3000
调度服务已初始化
```

## 7. 接口测试

### 7.1 健康检查（无需认证）

```bash
curl http://localhost:3000/health
```

返回：
```json
{ "status": "ok", "timestamp": "2025-04-07T10:00:00.000Z" }
```

### 7.2 提交接口

**POST** `/api/v1/aml/data/submit`

**必需请求头：**
```
Content-Type: application/json
X-API-Key: test-key
```

请求体格式：
```json
{
  "form": {
    "customer_info": "...",
    "customer_account_info": "...",
    "bank_statement_info": "...",
    "feature_info": "...",
    "feature_statement_info": "...",
    "summery_info": "...",
    "history_case_info": "",
    "doubt_exclusion_reasons_info": "",
    "due_diligence_info": "",
    "history_rating_info": "...",
    "callback_url": "http://your-system/callback",
    "case_id": "唯一案例ID"
  },
  "streaming": false
}
```

使用测试数据文件发送：

**Linux / Mac：**
```bash
curl -X POST http://localhost:3000/api/v1/aml/data/submit \
  -H "Content-Type: application/json" \
  -H "X-API-Key: test-key" \
  -d @test/fixtures/sample-submit.json
```

**Windows cmd：**
```cmd
curl -X POST http://localhost:3000/api/v1/aml/data/submit ^
  -H "Content-Type: application/json" ^
  -H "X-API-Key: test-key" ^
  -d @test/fixtures/sample-submit.json
```

返回（异步接收成功）：
```json
{
  "code": 0,
  "msg": "success",
  "case_id": "TEST_CASE_001",
  "timestamp": "2025-04-07 10:00:00"
}
```

### 7.3 查询接口

**GET** `/api/v1/aml/task/:taskId`

**必需请求头：**
```
X-API-Key: test-key
```

```bash
curl http://localhost:3000/api/v1/aml/task/{taskId} \
  -H "X-API-Key: test-key"
```

### 7.4 异步处理流程

提交接口是**异步处理**的，完整流程：

```
1. 客户端 POST 提交数据（需携带 X-API-Key）
2. 服务立即返回 { code: 0, msg: "success", case_id, timestamp }
3. 后台异步调用 AW 智能体处理
4. AW 返回报告后，服务回调 callback_url：
   成功: { case_id, success: true,  msg: "报告原文",   timestamp }
   失败: { case_id, success: false, msg: "失败原因",   timestamp }
```

## 8. 请求体字段说明

form 内共 12 个字段，全部为字符串类型：

| 字段名 | 必填 | 说明 |
|--------|------|------|
| `customer_info` | 是 | 客户信息（JSON 数组字符串） |
| `customer_account_info` | 是 | 客户账户信息（JSON 数组字符串） |
| `bank_statement_info` | 是 | 银行流水汇总（JSON 对象字符串） |
| `feature_info` | 是 | 特征列表（JSON 数组字符串） |
| `feature_statement_info` | 是 | 特征流水明细（字符串） |
| `summery_info` | 是 | 交易汇总文本 |
| `history_case_info` | 否 | 历史案例，无则传 `""` |
| `doubt_exclusion_reasons_info` | 否 | 疑点排除原因，无则传 `""` |
| `due_diligence_info` | 否 | 尽职调查信息，无则传 `""` |
| `history_rating_info` | 否 | 历史评级（JSON 数组字符串） |
| `callback_url` | 否 | 报告生成后的回调地址 |
| `case_id` | 否 | 案例ID（全局唯一），为空则自动生成 |

## 9. Docker 部署

### 9.1 构建镜像

目标运行环境为 aarch64 (ARM64) Linux，如果在 x86_64 机器上构建需要跨平台构建：

```bash
# 在 x86_64 机器上构建 arm64 镜像并导出 tar
docker buildx create --name arm64builder --use
docker buildx inspect --bootstrap
docker buildx build --platform linux/arm64 -t agent-gate:latest --output type=docker,dest=agent-gate-arm64.tar .

# 如果直接在 aarch64 目标机器上构建
docker build -t agent-gate:latest .
```

### 9.2 运行容器

```bash
# 使用 env 文件
docker run -d --name agent-gate --env-file .env -p 3000:3000 agent-gate:latest

# 或逐个传参
docker run -d --name agent-gate -p 3000:3000 \
  -e DB_HOST=10.1.161.130 \
  -e DB_PORT=8000 \
  -e DB_USER=aw_user \
  -e DB_PASSWORD=AiAw@123456 \
  -e DB_NAME=aw3 \
  -e DB_SCHEMA=aw3 \
  -e AW_AGENT_URL=http://10.1.161.125:3930/api/v1/prediction/165e15c4-0fdb-723f-1549-0cda411dc1c3 \
  -e ALLOWED_API_KEYS=test-key \
  agent-gate:latest
```

## 10. 常见问题排查

| 现象 | 原因 | 解决方案 |
|------|------|---------|
| 启动报 `缺少必填环境变量: DB_HOST` | .env 未配置 | 确认项目根目录有 `.env` 文件 |
| `connect ECONNREFUSED 10.1.161.130:8000` | GaussDB 不可达 | 检查网络和数据库服务状态 |
| 返回 `401 缺少 X-API-Key 请求头` | 请求未携带认证头 | 添加 `-H "X-API-Key: test-key"` |
| 返回 `401 无效的 API-Key` | Key 不在允许列表中 | 检查 `.env` 中 `ALLOWED_API_KEYS` 是否包含你使用的 Key |
| 返回 `401 请求时间戳过期` | 签名时间戳偏差超过5分钟 | 确认客户端与服务器时间同步 |
| 返回 `401 签名验证失败` | 签名不正确 | 检查签名算法或留空 `SIGNATURE_SECRET` 关闭签名校验 |
| 返回 `403 IP 不在白名单中` | IP 被拦截 | 留空 `IP_WHITELIST` 关闭 IP 限制，或将客户端 IP 加入白名单 |
| 返回 `400 校验失败` | 请求体格式不对 | 确认外层有 `form` 包裹，必填字段齐全 |
| 启动报 `缺少必填环境变量: AW_AGENT_URL` | 旧配置名 | 用 `AW_AGENT_URL` 替代旧的 `AW_AGENT_BASE_URL` |
| 回调未收到 | form 中 `callback_url` 为空 | 确认提交时传了 `callback_url` |
| AW 调用超时 | 模型推理时间长 | 调大 `AW_TIMEOUT_MS`（默认120秒） |

## 11. 日志位置

- **控制台** - 实时输出
- **文件** - `logs/` 目录下按日期轮转，格式 `application-YYYY-MM-DD.log`
