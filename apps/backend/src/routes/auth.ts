import { Router } from 'express';
import { generateToken } from '../middleware/auth';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  const validUser = process.env.ADMIN_USERNAME || 'admin';
  const validPass = process.env.ADMIN_PASSWORD || 'changeme';

  if (username !== validUser || password !== validPass) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  res.json({ token: generateToken(username) });
});

export default router;
