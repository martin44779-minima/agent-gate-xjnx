import { Request, Response, NextFunction } from 'express';
import { gatewayService } from '../services/gateway.service';

export async function submitController(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { upstreamId, caseId, callbackUrl, basicInfo, flowInfo, historyInfo } = req.body;

    const result = await gatewayService.submit({
      upstreamId,
      caseId,
      callbackUrl,
      basicInfo,
      flowInfo,
      historyInfo,
    });

    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
