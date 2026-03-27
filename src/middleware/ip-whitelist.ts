import { Request, Response, NextFunction } from 'express';
import config from '../config';
import { ForbiddenError } from '../utils/errors';

export function ipWhitelistMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const whitelist = config.security.ipWhitelist;

  if (whitelist.length === 0) {
    return next();
  }

  const clientIp = req.ip || req.socket.remoteAddress || '';
  const normalizedIp = clientIp.replace(/^::ffff:/, '');

  const allowed = whitelist.some((ip) => {
    const normalizedWhiteIp = ip.trim().replace(/^::ffff:/, '');
    return normalizedIp === normalizedWhiteIp;
  });

  if (!allowed) {
    return next(new ForbiddenError(`IP ${normalizedIp} 不在白名单中`));
  }

  next();
}
