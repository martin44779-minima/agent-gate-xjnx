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
  remark VARCHAR(500)
);

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
