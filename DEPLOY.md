# Deploy bartlew code

## Architecture

- **Frontend** → Vercel (static Vite/React app)
- **Backend** → Render (Node.js + Socket.io + PTY)

---

## 1. Deploy Backend to Render

### Option A: Blueprint (recommended)

1. Push this repo to GitHub.
2. In Render, click **New + → Blueprint**.
3. Connect your GitHub repo and select `apps/backend/render.yaml`.
4. Fill in the required environment variables when prompted:
   - `FRONTEND_URL` — your Vercel URL (e.g. `https://ai-code-studio.vercel.app`)
   - `BACKEND_URL` — your Render URL (e.g. `https://ai-code-studio-backend.onrender.com`)
   - `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET` — from your GitHub OAuth app
5. Create the **GitHub OAuth App** at [github.com/settings/developers](https://github.com/settings/developers):
   - Homepage URL: your Vercel frontend URL
   - Authorization callback URL: `{BACKEND_URL}/api/github/callback`

### Option B: Manual Web Service

1. In Render, click **New + → Web Service**.
2. Connect your repo.
3. Set:
   - **Root Directory**: `apps/backend`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start`
4. Add the same environment variables listed above.

> **Note:** Render free tier spins down after 15 min of inactivity. Sessions and cloned repos are stored in memory / ephemeral disk and will be lost when the instance sleeps. Upgrade to a paid plan for 24/7 uptime and persistent disk.

---

## 2. Deploy Frontend to Vercel

1. In Vercel, click **Add New… → Project**.
2. Connect your repo.
3. Set:
   - **Framework Preset**: Vite
   - **Root Directory**: `apps/frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add environment variable:
   - `VITE_BACKEND_URL` — your Render backend URL (e.g. `https://ai-code-studio-backend.onrender.com`)
5. Deploy.

---

## Environment Variable Cheat Sheet

| Variable | Set on | Value |
|---|---|---|
| `VITE_BACKEND_URL` | Vercel | Render backend URL |
| `FRONTEND_URL` | Render | Vercel frontend URL |
| `BACKEND_URL` | Render | Render backend URL |
| `GITHUB_CLIENT_ID` | Render | From GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | Render | From GitHub OAuth app |
| `JWT_SECRET` | Render | Auto-generated secret |
| `ADMIN_USERNAME` | Render | Default: `admin` |
| `ADMIN_PASSWORD` | Render | Auto-generated password |

---

## Local Development

```bash
# 1. Copy env files
cp .env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env

# 2. Fill in real values in both .env files

# 3. Start both dev servers
npm run dev
```

The Vite dev proxy forwards `/api` calls to `localhost:3001` automatically.
