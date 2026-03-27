import { Router } from 'express';
import { taskController } from '../controllers/task.controller';

const router = Router();

router.get('/api/v1/aml/task/:taskId', taskController);

export default router;
