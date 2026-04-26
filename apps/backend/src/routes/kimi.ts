import { Router } from 'express';
import { getKimiDefaultModel } from '../services/kimiConfig';

const router = Router();

router.get('/model', (_req, res) => {
  const info = getKimiDefaultModel();
  if (!info) {
    res.status(404).json({ error: 'No Kimi model configured' });
    return;
  }
  res.json(info);
});

export default router;
