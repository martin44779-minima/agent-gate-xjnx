import { Request, Response, NextFunction } from 'express';
import { gatewayService } from '../services/gateway.service';
import { SubmitRequestBody } from '../schemas/submit.schema';

export async function submitController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const body = req.body as SubmitRequestBody;
    const result = await gatewayService.submit(body);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
