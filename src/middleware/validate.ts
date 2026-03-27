import { Request, Response, NextFunction } from 'express';
import Ajv, { ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { ValidationError } from '../utils/errors';

const ajv = new Ajv({ allErrors: true, removeAdditional: false });
addFormats(ajv);

export function validate(schema: object) {
  const validateFn: ValidateFunction = ajv.compile(schema);

  return (req: Request, _res: Response, next: NextFunction): void => {
    const valid = validateFn(req.body);
    if (!valid) {
      const details = validateFn.errors?.map((e) => ({
        path: e.instancePath || '/',
        message: e.message || '校验失败',
        params: e.params,
      }));
      return next(new ValidationError('数据格式校验失败', details));
    }
    next();
  };
}
