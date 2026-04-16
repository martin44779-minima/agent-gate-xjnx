-- ============================================
-- AML反洗钱数据处理系统 - 数据库初始化脚本
-- 适用数据库: GaussDB (openGauss兼容)
-- ============================================

-- 任务主表
CREATE TABLE IF NOT EXISTS task_main (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  request_id VARCHAR(128),
  request_type VARCHAR(1) NOT NULL DEFAULT '0',
  system_id VARCHAR(128),
  callback_url VARCHAR(500),
  task_status SMALLINT NOT NULL DEFAULT 0,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  total_cost_ms BIGINT DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_time TIMESTAMP,
  last_error_code VARCHAR(50),
  esb_sys_head JSONB,
  cnsmr_sys_no VARCHAR(64),
  callback_path VARCHAR(500),
  remark VARCHAR(500)
);

COMMENT ON TABLE task_main IS '任务主表，记录每次案例提交的任务生命周期';
COMMENT ON COLUMN task_main.id IS '自增主键';
COMMENT ON COLUMN task_main.task_id IS '内部任务ID，UUID格式，全局唯一';
COMMENT ON COLUMN task_main.request_id IS '上游系统提供的案例ID，全局唯一';
COMMENT ON COLUMN task_main.request_type IS '案例类型：0-排除，1-上报';
COMMENT ON COLUMN task_main.system_id IS '反洗钱系统分配的系统ID';
COMMENT ON COLUMN task_main.callback_url IS '异步处理完成后的回调地址';
COMMENT ON COLUMN task_main.task_status IS '任务状态：0-待处理，1-处理中，2-已完成，3-重试中，4-失败';
COMMENT ON COLUMN task_main.create_time IS '任务创建时间';
COMMENT ON COLUMN task_main.start_time IS '任务开始处理时间';
COMMENT ON COLUMN task_main.end_time IS '任务结束时间（完成或失败）';
COMMENT ON COLUMN task_main.total_cost_ms IS '任务总耗时（毫秒）';
COMMENT ON COLUMN task_main.retry_count IS '已重试次数';
COMMENT ON COLUMN task_main.next_retry_time IS '下次重试预计执行时间';
COMMENT ON COLUMN task_main.last_error_code IS '最后一次错误代码';
COMMENT ON COLUMN task_main.esb_sys_head IS 'ESB系统头信息（上游传入原始JSON，回调时组装回传）';
COMMENT ON COLUMN task_main.cnsmr_sys_no IS '消费者系统号（回调时用于生成cnsmrSrlNo）';
COMMENT ON COLUMN task_main.callback_path IS '回调路径（文根，需与ESB_CALLBACK_BASE_URL拼接为完整URL）';
COMMENT ON COLUMN task_main.remark IS '备注信息（含重试和失败原因）';

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_main_task_id ON task_main(task_id);
CREATE INDEX IF NOT EXISTS idx_task_main_req_id_type ON task_main(request_id, request_type);
CREATE INDEX IF NOT EXISTS idx_task_main_system_id ON task_main(system_id);
CREATE INDEX IF NOT EXISTS idx_task_main_status ON task_main(task_status);
CREATE INDEX IF NOT EXISTS idx_task_main_create_time ON task_main(create_time);

-- 原始数据表
CREATE TABLE IF NOT EXISTS task_raw_data (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  data_type VARCHAR(50) NOT NULL,
  data_content JSONB NOT NULL,
  data_size INT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE task_raw_data IS '原始数据表，存储提交时的完整form入参';
COMMENT ON COLUMN task_raw_data.id IS '自增主键';
COMMENT ON COLUMN task_raw_data.task_id IS '关联的任务ID';
COMMENT ON COLUMN task_raw_data.data_type IS '数据类型标识，当前固定为raw_input';
COMMENT ON COLUMN task_raw_data.data_content IS '原始入参JSON数据（10个业务字段）';
COMMENT ON COLUMN task_raw_data.data_size IS '数据大小（字节）';
COMMENT ON COLUMN task_raw_data.checksum IS '数据完整性校验码（SHA256）';
COMMENT ON COLUMN task_raw_data.create_time IS '记录创建时间';

CREATE INDEX IF NOT EXISTS idx_task_raw_task_id ON task_raw_data(task_id);

-- 处理结果表
CREATE TABLE IF NOT EXISTS task_result (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  result_content JSONB,
  report TEXT,
  risk_level VARCHAR(20),
  risk_score NUMERIC(6,2),
  conclusion TEXT,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE task_result IS '处理结果表，存储AW智能体返回的分析结果';
COMMENT ON COLUMN task_result.id IS '自增主键';
COMMENT ON COLUMN task_result.task_id IS '关联的任务ID';
COMMENT ON COLUMN task_result.agent_id IS '处理该任务的智能体ID';
COMMENT ON COLUMN task_result.result_content IS '智能体返回的完整原始响应（JSON）';
COMMENT ON COLUMN task_result.report IS '结构化报告（JSON字符串，含4个分析字段）';
COMMENT ON COLUMN task_result.risk_level IS '风险等级（预留扩展）';
COMMENT ON COLUMN task_result.risk_score IS '风险评分（预留扩展）';
COMMENT ON COLUMN task_result.conclusion IS '结论（预留扩展）';
COMMENT ON COLUMN task_result.create_time IS '结果创建时间';

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_result_task_id ON task_result(task_id);

-- ============================================
-- 增量迁移 SQL（已有数据库执行）
-- ============================================
-- ALTER TABLE task_main RENAME COLUMN case_id TO request_id;
-- ALTER TABLE task_main ADD COLUMN request_type VARCHAR(1) NOT NULL DEFAULT '0';
-- ALTER TABLE task_main ADD COLUMN system_id VARCHAR(128);
-- ALTER TABLE task_main ADD COLUMN next_retry_time TIMESTAMP;
-- DROP INDEX IF EXISTS idx_task_main_case_id;
-- CREATE INDEX IF NOT EXISTS idx_task_main_req_id_type ON task_main(request_id, request_type);
-- CREATE INDEX IF NOT EXISTS idx_task_main_system_id ON task_main(system_id);
-- COMMENT ON COLUMN task_main.request_id IS '上游系统提供的案例ID，全局唯一';
-- COMMENT ON COLUMN task_main.request_type IS '案例类型：0-排除，1-上报';
-- COMMENT ON COLUMN task_main.system_id IS '反洗钱系统分配的系统ID';
-- COMMENT ON COLUMN task_main.next_retry_time IS '下次重试预计执行时间';
-- ALTER TABLE task_main ADD COLUMN esb_sys_head JSONB;
-- ALTER TABLE task_main ADD COLUMN cnsmr_sys_no VARCHAR(64);
-- ALTER TABLE task_main ADD COLUMN callback_path VARCHAR(500);
-- COMMENT ON COLUMN task_main.esb_sys_head IS 'ESB系统头信息（上游传入原始JSON，回调时组装回传）';
-- COMMENT ON COLUMN task_main.cnsmr_sys_no IS '消费者系统号（回调时用于生成cnsmrSrlNo）';
-- COMMENT ON COLUMN task_main.callback_path IS '回调路径（文根，需与ESB_CALLBACK_BASE_URL拼接为完整URL）';
