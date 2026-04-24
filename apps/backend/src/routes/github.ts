import { Router } from 'express';
import axios from 'axios';
import { Octokit } from '@octokit/rest';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// userId → github token (in-memory; fine for a local single-user tool)
export const githubTokens = new Map<string, string>();
// tempKey → github token (for the OAuth handoff)
const tempTokens = new Map<string, string>();

router.get('/authorize', authMiddleware, (req, res) => {
  const state = Buffer.from(JSON.stringify({ userId: req.userId })).toString('base64url');
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    scope: 'repo,user',
    state,
    redirect_uri: `${process.env.BACKEND_URL || 'http://localhost:3001'}/api/github/callback`,
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

router.get('/callback', async (req, res) => {
  const { code, state } = req.query as { code: string; state: string };
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  try {
    const { data } = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      },
      { headers: { Accept: 'application/json' } }
    );

    const { userId } = JSON.parse(Buffer.from(state, 'base64url').toString());
    const key = `${userId}-${Date.now()}`;
    tempTokens.set(key, data.access_token);
    // Clean up after 2 min
    setTimeout(() => tempTokens.delete(key), 120_000);

    res.redirect(`${frontendUrl}/auth/github/success?key=${key}`);
  } catch {
    res.redirect(`${frontendUrl}/auth/github/error`);
  }
});

router.get('/redeem', authMiddleware, (req, res) => {
  const { key } = req.query as { key: string };
  const token = tempTokens.get(key);
  if (!token) { res.status(404).json({ error: 'Key not found or expired' }); return; }

  tempTokens.delete(key);
  githubTokens.set(req.userId!, token);
  res.json({ success: true });
});

router.get('/status', authMiddleware, (req, res) => {
  res.json({ connected: githubTokens.has(req.userId!) });
});

router.get('/repos', authMiddleware, async (req, res) => {
  const token = githubTokens.get(req.userId!);
  if (!token) { res.status(401).json({ error: 'GitHub not connected' }); return; }

  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.repos.listForAuthenticatedUser({
    per_page: 100,
    sort: 'updated',
    affiliation: 'owner',
  });

  res.json(data.map(r => ({
    id: r.id,
    name: r.name,
    full_name: r.full_name,
    clone_url: r.clone_url,
    html_url: r.html_url,
    private: r.private,
    description: r.description,
    default_branch: r.default_branch,
  })));
});

export default router;
