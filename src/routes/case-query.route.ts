import { Router } from 'express';
import { caseQueryController } from '../controllers/case-query.controller';

const router = Router();

router.get('/api/cases/:systemId/:requestId', caseQueryController);

export default router;
