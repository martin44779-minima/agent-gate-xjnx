import config from './config';
import app from './app';
import { closePool } from './database/pool';
import { schedulerService } from './services/scheduler.service';
import logger from './utils/logger';

const PORT = config.server.port;

// 初始化调度服务
schedulerService.init();

const server = app.listen(PORT, () => {
  logger.info(`服务启动成功，监听端口 ${PORT}`, { env: config.server.env });
});

// 优雅关闭
function gracefulShutdown(signal: string): void {
  logger.info(`收到 ${signal} 信号，开始优雅关闭...`);

  server.close(async () => {
    logger.info('HTTP服务已停止');
    try {
      await closePool();
      logger.info('数据库连接池已关闭');
    } catch (err) {
      logger.error('关闭数据库连接池失败', { error: (err as Error).message });
    }
    process.exit(0);
  });

  // 超时强制退出
  setTimeout(() => {
    logger.error('优雅关闭超时，强制退出');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('未捕获异常', { error: err.message, stack: err.stack });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error('未处理的Promise拒绝', { reason: String(reason) });
});

export default server;
