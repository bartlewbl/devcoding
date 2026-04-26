# Deploy bartlew code on Hetzner

## What you get

- **Backend** → Hetzner Cloud VPS (~€3.79/mo, 4 GB RAM, persistent disk)
- **Frontend** → Vercel (free CDN, optional) OR served from Hetzner
- **SSL** → Caddy (auto Let's Encrypt)
- **Process manager** → PM2
- **Deploy** → Git push → GitHub Actions → auto-deploy via SSH

---

## 0. Prerequisites

- A domain name (e.g. from Cloudflare, Namecheap, or Porkbun). You need this for GitHub OAuth and SSL.
- This repo pushed to GitHub.

---

## 1. Buy the server

1. Go to [hetzner.com/cloud](https://www.hetzner.com/cloud)
2. Create a project → add a server:
   - **Type**: Shared vCPU (CX23) — 2 vCPU, 4 GB RAM, 40 GB SSD
   - **Location**: Pick closest to you (Falkenstein, Nuremberg, Helsinki, Ashburn, Hillsboro)
   - **Image**: Ubuntu 22.04 LTS
   - **SSH Key**: Add your local SSH key (strongly recommended; disable password auth)
3. Note the **IPv4 address**.

---

## 2. Point your domain to the server

In your domain registrar / DNS panel:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `api` | Your Hetzner IP | Auto |
| A | `@` | Your Hetzner IP | Auto |

Examples:
- Backend API → `api.yourdomain.com`
- Frontend (if self-hosted) → `yourdomain.com`

Wait 1–5 minutes for DNS propagation.

---

## 3. Run the server setup script

SSH into your server:

```bash
ssh root@YOUR_HETZNER_IP
```

Clone this repo (or `wget` the setup script), then run it:

```bash
# Option A: clone the repo first
git clone https://github.com/YOUR_USER/YOUR_REPO.git /var/www/ai-code-studio
cd /var/www/ai-code-studio
bash scripts/setup-server.sh

# Option B: just copy the script to the server and run it
scp scripts/setup-server.sh root@YOUR_HETZNER_IP:/tmp/
ssh root@YOUR_HETZNER_IP "bash /tmp/setup-server.sh"
```

This installs: Node.js 20, PM2, Caddy, UFW firewall, and creates `/var/www/ai-code-studio`.

---

## 4. Configure Caddy (reverse proxy + SSL)

1. Edit `apps/backend/Caddyfile` in this repo — replace `YOUR_DOMAIN.COM` with your actual domain:

```caddy
api.yourdomain.com {
	reverse_proxy localhost:3001
}
```

2. Copy it to the server and reload Caddy:

```bash
ssh root@YOUR_HETZNER_IP
scp apps/backend/Caddyfile root@YOUR_HETZNER_IP:/etc/caddy/Caddyfile
ssh root@YOUR_HETZNER_IP "systemctl reload caddy"
```

Caddy will automatically fetch a Let's Encrypt certificate on first request.

---

## 5. Create the backend .env file

SSH into the server and create the env file:

```bash
ssh root@YOUR_HETZNER_IP
nano /var/www/ai-code-studio/apps/backend/.env
```

Paste this (replace with your real values):

```env
PORT=3001
FRONTEND_URL=https://your-frontend-url.vercel.app
BACKEND_URL=https://api.yourdomain.com

ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-strong-password

JWT_SECRET=some-random-64-char-string

GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
```

> **Frontend URL**: Use your Vercel URL if hosting frontend there, or `https://yourdomain.com` if self-hosting.

---

## 6. Create a GitHub OAuth App

Go to [github.com/settings/developers](https://github.com/settings/developers) → **OAuth Apps** → **New OAuth App**

| Field | Value |
|---|---|
| Application name | `bartlew code` |
| Homepage URL | Your frontend URL |
| Authorization callback URL | `https://api.yourdomain.com/api/github/callback` |

Click **Register** → copy **Client ID** and **Client Secret** → paste them into the `.env` file above.

---

## 7. Install your AI CLIs

Your backend spawns `claude` and/or `kimi` commands. You must install these on the server:

```bash
ssh root@YOUR_HETZNER_IP

# Example: install Claude CLI (check Anthropic's current install method)
# npm install -g @anthropic-ai/claude-cli

# Example: install Kimi CLI (use whatever method applies)
# npm install -g kimi-cli

# Verify they're on PATH
which claude
which kimi
```

> If your AI CLI requires API keys, set those as environment variables in the same `.env` file or export them in `~/.bashrc`.

---

## 8. First deploy

From your local machine or directly on the server:

```bash
ssh root@YOUR_HETZNER_IP
cd /var/www/ai-code-studio
bash scripts/deploy.sh
```

This will:
- Pull the latest code
- `npm install` + `npm run build`
- Start/reload the backend via PM2

Check that it's running:

```bash
pm2 status
pm2 logs ai-code-studio-backend
```

Test the API:

```bash
curl https://api.yourdomain.com/api/auth/login \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your-strong-password"}'
```

You should get a JWT token back.

---

## 9. Deploy the frontend

### Option A: Vercel (recommended, free)

Same as before:
1. Import repo to Vercel
2. Root directory: `apps/frontend`
3. Add env var: `VITE_BACKEND_URL=https://api.yourdomain.com`
4. Deploy

### Option B: Serve from Hetzner (same domain)

If you want everything on one domain:

1. Build the frontend locally or on the server:

```bash
cd apps/frontend
npm install
npm run build
```

2. Update the Caddyfile:

```caddy
api.yourdomain.com {
	reverse_proxy localhost:3001
}

yourdomain.com {
	root * /var/www/ai-code-studio/apps/frontend/dist
	try_files {path} /index.html
	file_server
}
```

3. Reload Caddy:

```bash
systemctl reload caddy
```

---

## 10. Auto-deploy via GitHub Actions (optional but recommended)

This lets you deploy by pushing to `main`.

### Add secrets to your GitHub repo

Go to your repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret Name | Value |
|---|---|
| `HETZNER_HOST` | Your Hetzner IP (e.g. `78.46.x.x`) |
| `HETZNER_USER` | `root` (or your SSH user) |
| `HETZNER_SSH_KEY` | Your private SSH key (full contents of `~/.ssh/id_ed25519`) |

The workflow file (`.github/workflows/deploy.yml`) is already in this repo.

Push to `main` and watch the **Actions** tab. It will SSH in and run `scripts/deploy.sh` automatically.

---

## 11. Hardening checklist (do this)

```bash
ssh root@YOUR_HETZNER_IP

# Disable password login, use SSH keys only
nano /etc/ssh/sshd_config
# Set: PasswordAuthentication no
# Set: PermitRootLogin prohibit-password
systemctl restart ssh

# Enable automatic security updates
apt install -y unattended-upgrades
```

---

## Monthly cost summary

| Item | Cost |
|---|---|
| Hetzner CX23 (4 GB RAM) | ~€3.79 / mo |
| Domain (Cloudflare/Namecheap) | ~$10 / year |
| Vercel frontend (optional) | $0 |
| **Total** | **~$5 / month** |

Compare to Render Starter ($7/mo, 512 MB, sleeps) or DigitalOcean ($24/mo for 4 GB).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `pm2 logs` shows "claude: command not found" | Install the AI CLI globally and ensure it's on `PATH` |
| Caddy SSL fails | Check DNS A-record points to server IP; wait 5 min |
| GitHub OAuth fails | Double-check `BACKEND_URL` and callback URL match exactly |
| Firewall blocks | `ufw status` — port 80/443 must be open |
| Socket.io not connecting | Check Caddy reverse proxy headers; Caddy handles websockets by default |
