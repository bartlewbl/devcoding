import { Router } from 'express';
import { getUsage, getUsageStats, getDailyUsage, clearAllUsage } from '../services/usage';

const router = Router();

router.get('/', (req, res) => {
  const filter = {
    userId: req.userId,
    sessionId: req.query.sessionId as string | undefined,
    provider: req.query.provider as string | undefined,
    modelName: req.query.modelName as string | undefined,
    startTime: req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined,
    endTime: req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined,
  };

  const records = getUsage(filter);
  res.json(records);
});

router.get('/stats', (req, res) => {
  const filter = {
    userId: req.userId,
    sessionId: req.query.sessionId as string | undefined,
    provider: req.query.provider as string | undefined,
    modelName: req.query.modelName as string | undefined,
    startTime: req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined,
    endTime: req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined,
  };

  const stats = getUsageStats(filter);
  res.json(stats);
});

router.get('/daily', (req, res) => {
  const filter = {
    userId: req.userId,
    sessionId: req.query.sessionId as string | undefined,
    provider: req.query.provider as string | undefined,
    modelName: req.query.modelName as string | undefined,
    startTime: req.query.startTime ? parseInt(req.query.startTime as string, 10) : undefined,
    endTime: req.query.endTime ? parseInt(req.query.endTime as string, 10) : undefined,
  };

  const daily = getDailyUsage(filter);
  res.json(daily);
});

router.delete('/all', (req, res) => {
  clearAllUsage();
  res.json({ success: true });
});

export default router;
