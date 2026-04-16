import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import routes from './routes';
import { normalizeRequestBody } from './middleware/normalize-request';
import { requestLogger } from './middleware/request-logger';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { authMiddleware } from './middleware/auth';
import { ipWhitelistMiddleware } from './middleware/ip-whitelist';
import { errorHandler } from './middleware/error-handler';

const app = express();

// 基础中间件
app.use(helmet());
app.use(cors());
app.use(compression());

// 修正 ESB 网关错误设置 Content-Encoding: utf-8 的问题
// Content-Encoding 应为压缩算法(gzip/deflate/br)，字符编码应在 Content-Type charset 中指定
app.use((req, _res, next) => {
  const encoding = req.headers['content-encoding'];
  if (encoding && encoding.toLowerCase() === 'utf-8') {
    delete req.headers['content-encoding'];
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ESB 包裹格式解包：检测 sysHead+body 并转换为内部 snake_case 格式
app.use(normalizeRequestBody);

// 请求日志
app.use(requestLogger);

// 安全中间件（健康检查不需要认证）
app.use('/api', rateLimitMiddleware);
app.use('/api', ipWhitelistMiddleware);
app.use('/api', authMiddleware);

// 路由
app.use(routes);

// 全局错误处理
app.use(errorHandler);

export default app;
