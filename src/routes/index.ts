import { Router } from 'express';
import submitRoute from './submit.route';
import taskRoute from './task.route';
import caseQueryRoute from './case-query.route';
import adminRoute from './admin.route';

const router = Router();

router.use(submitRoute);
router.use(taskRoute);
router.use(caseQueryRoute);
router.use(adminRoute);

// 健康检查
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
