import { Request, Response, NextFunction } from 'express';
import { storageService } from '../services/storage.service';

export async function caseQueryController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { system_id: systemId, request_id: requestId, request_type: requestType = '0' } = req.body;

    if (!systemId || !requestId) {
      res.status(400).json({
        code: '0',
        request_id: requestId || null,
        report: null,
        report_create_time: null,
      });
      return;
    }

    if (requestType !== '0' && requestType !== '1') {
      res.status(400).json({
        code: '0',
        request_id: requestId,
        report: null,
        report_create_time: null,
      });
      return;
    }

    const result = await storageService.getCompletedCaseReport(systemId, requestId, requestType);
    if (!result) {
      res.status(200).json({
        code: '0',
        request_id: requestId,
        report: null,
        report_create_time: null,
      });
      return;
    }

    res.status(200).json({
      code: '1',
      request_id: result.requestId,
      report: result.report,
      report_create_time: result.reportCreateTime,
    });
  } catch (err) {
    next(err);
  }
}
