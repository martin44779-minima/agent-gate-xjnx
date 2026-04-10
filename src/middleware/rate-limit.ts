import rateLimit from 'express-rate-limit';
import config from '../config';

export const rateLimitMiddleware = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      code: 1,
      msg: '请求过于频繁，请稍后重试',
    });
  },
});
