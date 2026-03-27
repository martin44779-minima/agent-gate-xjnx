import { Request, Response, NextFunction } from 'express';
import { AppError, ValidationError } from '../utils/errors';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('error-handler');

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  const traceId = (req as unknown as Record<string, unknown>).traceId as string | undefined;

  if (err instanceof AppError) {
    logger.warn('业务错误', {
      traceId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      path: req.path,
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err instanceof ValidationError && { details: err.details }),
      },
    });
    return;
  }

  logger.error('未预期错误', {
    traceId,
    message: err.message,
    stack: err.stack,
    path: req.path,
  });

  res.status(500).json({
    success: false,
    error: {
      code: 'ERR_INTERNAL',
      message: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    },
  });
}
