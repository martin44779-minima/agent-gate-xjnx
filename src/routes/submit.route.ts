import { Router } from 'express';
import { validate } from '../middleware/validate';
import { submitController } from '../controllers/submit.controller';

/**
 * 顶层基础结构校验：仅校验外层必填字段和 form 为 object
 * form 内部字段校验由各业务适配器负责（在 gateway.service 中执行）
 */
const baseSubmitSchema = {
  type: 'object',
  required: ['callback_url', 'request_id', 'request_type', 'system_id', 'form'],
  properties: {
    callback_url:  { type: 'string' },
    request_id:    { type: 'string' },
    request_type:  { type: 'string', enum: ['0', '1'] },
    system_id:     { type: 'string' },
    form:          { type: 'object' },
  },
  additionalProperties: true,
};

const router = Router();

router.post('/api/v1/aml/data/submit', validate(baseSubmitSchema), submitController);

export default router;
