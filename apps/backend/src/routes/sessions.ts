import { Router } from 'express';
import { listSessions, getSession, toSummary } from '../services/session';

const router = Router();

router.get('/', (req, res) => {
  res.json(listSessions(req.userId));
});

router.get('/:id', (req, res) => {
  const s = getSession(req.params.id);
  if (!s || s.userId !== req.userId) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(toSummary(s));
});

export default router;
