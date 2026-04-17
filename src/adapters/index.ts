import { BizAdapter } from './adapter.interface';
import { amlAdapter } from './aml.adapter';

/**
 * 业务适配器注册表
 * key 为上游系统传入的 system_id，value 为对应适配器
 *
 * 新增部门接入步骤：
 * 1. 新建 src/adapters/xxx.adapter.ts 实现 BizAdapter 接口
 * 2. 在下方注册表中添加一行：'上游system_id': xxxAdapter
 * 3. 重新打镜像部署，无需改动其他文件
 */
const registry: Record<string, BizAdapter> = {
  // 反洗钱系统 — 请将 key 替换为实际的 system_id 值
  'XJRCCB_AML': amlAdapter,
};

/**
 * 根据 system_id 获取对应适配器
 * 返回 null 表示该 system_id 未注册，网关会拒绝请求
 */
export function getAdapter(systemId: string): BizAdapter | null {
  return registry[systemId] ?? null;
}
