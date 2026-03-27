import { Router } from 'express';
import { validate } from '../middleware/validate';
import { submitSchema } from '../schemas/submit.schema';
import { submitController } from '../controllers/submit.controller';

const router = Router();

router.post('/api/v1/aml/data/submit', validate(submitSchema), submitController);

export default router;
