import { Router } from 'express';
import {
  listAdaptersController,
  upsertAdapterController,
  deleteAdapterController,
} from '../controllers/admin.controller';

const router = Router();

router.get('/api/admin/adapters', listAdaptersController);
router.post('/api/admin/adapters', upsertAdapterController);
router.delete('/api/admin/adapters', deleteAdapterController);

export default router;
