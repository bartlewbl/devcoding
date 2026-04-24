import { Router } from 'express';
import {
  listWorktreeStatuses,
  cleanupOrphanedWorktrees,
  cleanupAllWorktrees,
} from '../services/worktree-manager';
import { getActiveSessionIds } from '../services/session';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const statuses = await listWorktreeStatuses(getActiveSessionIds());
    res.json(statuses);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/orphaned', async (req, res) => {
  try {
    const result = await cleanupOrphanedWorktrees(getActiveSessionIds());
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/all', async (req, res) => {
  try {
    const result = await cleanupAllWorktrees();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
