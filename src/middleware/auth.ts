import { Request, Response, NextFunction } from 'express';
import config from '../config';
import { sha256, verifySignature } from '../utils/crypto';
import { AuthError } from '../utils/errors';

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!config.security.authEnabled) {
    return next();
  }

  try {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const signature = req.headers['x-signature'] as string | undefined;
    const timestamp = req.headers['x-timestamp'] as string | undefined;

    if (!apiKey) {
      throw new AuthError('缺少 X-API-Key 请求头');
    }

    if (config.security.apiKeys.length > 0 && !config.security.apiKeys.includes(apiKey)) {
      throw new AuthError('无效的 API-Key');
    }

    if (config.security.signatureSecret && signature && timestamp) {
      const now = Date.now();
      const reqTime = parseInt(timestamp, 10);
      if (isNaN(reqTime) || Math.abs(now - reqTime) > 5 * 60 * 1000) {
        throw new AuthError('请求时间戳过期');
      }

      const bodyHash = sha256(JSON.stringify(req.body || {}));
      const isValid = verifySignature(
        config.security.signatureSecret,
        req.method,
        req.path,
        timestamp,
        bodyHash,
        signature
      );
      if (!isValid) {
        throw new AuthError('签名验证失败');
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
