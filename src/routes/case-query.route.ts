import { Router } from 'express';
import { caseQueryController } from '../controllers/case-query.controller';

const router = Router();

router.post('/api/cases/query', caseQueryController);

export default router;
