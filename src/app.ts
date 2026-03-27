import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import routes from './routes';
import { requestLogger } from './middleware/request-logger';
import { authMiddleware } from './middleware/auth';
import { ipWhitelistMiddleware } from './middleware/ip-whitelist';
import { errorHandler } from './middleware/error-handler';

const app = express();

// 基础中间件
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use(requestLogger);

// 安全中间件（健康检查不需要认证）
app.use('/api', ipWhitelistMiddleware);
app.use('/api', authMiddleware);

// 路由
app.use(routes);

// 全局错误处理
app.use(errorHandler);

export default app;
