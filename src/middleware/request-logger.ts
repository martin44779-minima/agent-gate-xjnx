import { Request, Response, NextFunction } from 'express';
import { generateUUID } from '../utils/helpers';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('http');

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-trace-id'] as string) || generateUUID();
  (req as unknown as Record<string, unknown>).traceId = traceId;

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('请求完成', {
      traceId,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      duration,
      ip: req.ip,
    });
  });

  next();
}
