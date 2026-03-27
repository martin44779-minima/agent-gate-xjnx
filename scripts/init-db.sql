-- ============================================
-- AML反洗钱数据处理系统 - 数据库初始化脚本
-- 适用数据库: GaussDB (openGauss兼容)
-- ============================================

-- 任务主表
CREATE TABLE IF NOT EXISTS task_main (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  upstream_id VARCHAR(64) NOT NULL,
  case_id VARCHAR(64),
  task_status SMALLINT NOT NULL DEFAULT 0,
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  total_cost_ms BIGINT DEFAULT 0,
  retry_count INT NOT NULL DEFAULT 0,
  last_error_code VARCHAR(50),
  callback_url VARCHAR(500),
  remark VARCHAR(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_main_task_id ON task_main(task_id);
CREATE INDEX IF NOT EXISTS idx_task_main_upstream ON task_main(upstream_id, case_id);
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

CREATE INDEX IF NOT EXISTS idx_task_raw_task_id ON task_raw_data(task_id);

-- 处理结果表
CREATE TABLE IF NOT EXISTS task_result (
  id BIGSERIAL PRIMARY KEY,
  task_id VARCHAR(64) NOT NULL,
  agent_id VARCHAR(64) NOT NULL,
  result_content JSONB,
  report TEXT,
  risk_level VARCHAR(20),
  create_time TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_result_task_id ON task_result(task_id);
