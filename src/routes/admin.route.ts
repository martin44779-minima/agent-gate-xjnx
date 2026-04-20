import { Router } from 'express';
import {
  listAdaptersController,
  upsertAdapterController,
  deleteAdapterController,
} from '../controllers/admin.controller';

const router = Router();

router.get('/admin/adapters', listAdaptersController);
router.post('/admin/adapters', upsertAdapterController);
router.delete('/admin/adapters', deleteAdapterController);

export default router;
