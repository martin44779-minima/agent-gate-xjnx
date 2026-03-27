import { Request, Response, NextFunction } from 'express';
import { storageService } from '../services/storage.service';
import { NotFoundError } from '../utils/errors';

export async function taskController(req: Request<{ taskId: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const { taskId } = req.params;

    const detail = await storageService.getTaskDetail(taskId);
    if (!detail) {
      throw new NotFoundError(`任务 ${taskId} 不存在`);
    }

    res.status(200).json({
      success: true,
      data: detail,
    });
  } catch (err) {
    next(err);
  }
}
