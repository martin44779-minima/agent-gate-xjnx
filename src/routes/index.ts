import { Router } from 'express';
import submitRoute from './submit.route';
import taskRoute from './task.route';

const router = Router();

router.use(submitRoute);
router.use(taskRoute);

// 健康检查
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
