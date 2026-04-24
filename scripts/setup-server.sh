#!/bin/bash
set -e

echo "=== AI Code Studio — Hetzner Server Setup ==="

# ------------------------------------------------------------------
# 1. System update
# ------------------------------------------------------------------
apt update && apt upgrade -y

# ------------------------------------------------------------------
# 2. Install essentials
# ------------------------------------------------------------------
apt install -y curl git build-essential python3 python3-pip ufw

# ------------------------------------------------------------------
# 3. Install Node.js 20 LTS
# ------------------------------------------------------------------
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node -v
npm -v

# ------------------------------------------------------------------
# 4. Install PM2 (process manager)
# ------------------------------------------------------------------
npm install -g pm2

# ------------------------------------------------------------------
# 5. Install Caddy (reverse proxy + auto SSL)
# ------------------------------------------------------------------
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy

# ------------------------------------------------------------------
# 6. Configure firewall
# ------------------------------------------------------------------
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow http
ufw allow https
ufw --force enable

echo "Firewall status:"
ufw status

# ------------------------------------------------------------------
# 7. Create app directory
# ------------------------------------------------------------------
mkdir -p /var/www/ai-code-studio
mkdir -p /var/log/pm2

# ------------------------------------------------------------------
# 8. Setup Git deploy key (optional — only if using private repo)
# ------------------------------------------------------------------
# ssh-keygen -t ed25519 -C "deploy@ai-code-studio" -f /root/.ssh/deploy_key -N ""
# cat /root/.ssh/deploy_key.pub
# echo "Add the above public key to your GitHub repo deploy keys"

# ------------------------------------------------------------------
# 9. Done
# ------------------------------------------------------------------
echo ""
echo "=== Base setup complete ==="
echo ""
echo "Next steps:"
echo "1. Point your domain's A-record to this server's IP"
echo "2. Edit apps/backend/Caddyfile with your domain"
echo "3. Run: sudo cp apps/backend/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy"
echo "4. Install your AI CLIs (e.g. npm install -g @anthropic-ai/claude-cli)"
echo "5. Clone this repo to /var/www/ai-code-studio"
echo "6. Create /var/www/ai-code-studio/apps/backend/.env"
echo "7. Run: ./scripts/deploy.sh"
