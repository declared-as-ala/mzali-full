#!/usr/bin/env bash
# One-time OVH VPS bootstrap for the Mzali production deployment.
#
# Run manually, once, connected as the `ubuntu` user (root SSH login stays
# disabled — this script uses sudo for every privileged step):
#
#   ssh ubuntu@149.202.34.65
#   curl -fsSL https://raw.githubusercontent.com/<owner>/<repo>/master/scripts/bootstrap-ovh-vps.sh -o bootstrap.sh
#   bash bootstrap.sh
#
# or, if you've already cloned the repo on the VPS:
#
#   bash scripts/bootstrap-ovh-vps.sh
#
# Idempotent: every step checks current state before acting, so running
# this twice (e.g. after a manual package upgrade) does not damage the VPS,
# reset the firewall to a more permissive state, or touch existing data.
set -Eeuo pipefail

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
ok()  { printf '  \033[1;32mOK\033[0m %s\n' "$1"; }

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this as the ubuntu user with sudo available, not as root directly." >&2
  exit 1
fi
if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required and was not found." >&2
  exit 1
fi

APP_DIR="/opt/mzali"
DEPLOY_USER="${SUDO_USER:-$USER}"

log "Updating apt package index"
sudo apt-get update -y

log "Installing base packages"
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl gnupg lsb-release ufw fail2ban unattended-upgrades \
  apt-transport-https software-properties-common jq
ok "base packages present"

log "Installing Docker Engine + Compose plugin from the official repository"
if ! command -v docker >/dev/null 2>&1; then
  sudo install -m 0755 -d /etc/apt/keyrings
  if [[ ! -f /etc/apt/keyrings/docker.gpg ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    sudo chmod a+r /etc/apt/keyrings/docker.gpg
  fi
  arch="$(dpkg --print-architecture)"
  codename="$(. /etc/os-release && echo "$VERSION_CODENAME")"
  echo "deb [arch=$arch signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $codename stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
else
  ok "Docker already installed ($(docker --version))"
fi

log "Enabling Docker on startup"
sudo systemctl enable --now docker
ok "docker.service enabled"

log "Verifying Docker Compose plugin"
docker compose version >/dev/null
ok "docker compose plugin present"

# Minimum permissions for routine CD, not unrestricted sudo: the deploy user
# only needs to run `docker` (compose up/pull/exec) without a password
# prompt. Everything else the CI/CD pipeline does (creating /opt/mzali,
# writing deploy/.env) happens once, here, interactively — not on every
# deploy — so it does not need passwordless sudo baked in permanently.
log "Adding $DEPLOY_USER to the docker group"
if ! id -nG "$DEPLOY_USER" | grep -qw docker; then
  sudo usermod -aG docker "$DEPLOY_USER"
  echo "  Added. You must log out and back in (or run 'newgrp docker') for this to take effect in your current shell."
else
  ok "$DEPLOY_USER already in the docker group"
fi

log "Creating $APP_DIR structure"
sudo mkdir -p "$APP_DIR"/{compose,shared,backups/mongo,backups/minio,releases,scripts,logs}
sudo chown -R "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"
chmod 750 "$APP_DIR"
chmod 700 "$APP_DIR/shared"
ok "$APP_DIR ready, owned by $DEPLOY_USER"

if [[ ! -f "$APP_DIR/shared/.env.production" ]]; then
  log "Creating an empty $APP_DIR/shared/.env.production placeholder"
  umask 177
  cat > "$APP_DIR/shared/.env.production" <<'EOF'
# Populate from deploy/.env.example in the repository, then:
#   chmod 600 /opt/mzali/shared/.env.production
# This file is the single source of truth for production secrets — it is
# NOT regenerated on every deploy, only edited by hand when a secret
# actually needs to change (see docs/deployment/github-secrets.md).
EOF
  chmod 600 "$APP_DIR/shared/.env.production"
  ok "placeholder created at $APP_DIR/shared/.env.production (chmod 600)"
else
  ok "$APP_DIR/shared/.env.production already exists — left untouched"
fi

log "Configuring UFW (SSH, HTTP, HTTPS only)"
sudo ufw --force enable >/dev/null
sudo ufw allow 22/tcp comment 'SSH' >/dev/null
sudo ufw allow 80/tcp comment 'HTTP (Caddy ACME + redirect)' >/dev/null
sudo ufw allow 443/tcp comment 'HTTPS' >/dev/null
sudo ufw allow 443/udp comment 'HTTP/3' >/dev/null
sudo ufw default deny incoming >/dev/null
sudo ufw default allow outgoing >/dev/null
ok "UFW active — allowed: 22/tcp, 80/tcp, 443/tcp, 443/udp"
sudo ufw status verbose

log "Configuring Fail2ban for SSH"
sudo mkdir -p /etc/fail2ban/jail.d
sudo tee /etc/fail2ban/jail.d/sshd.local >/dev/null <<'EOF'
[sshd]
enabled = true
port = ssh
maxretry = 5
findtime = 10m
bantime = 1h
EOF
sudo systemctl enable --now fail2ban
sudo systemctl restart fail2ban
ok "fail2ban active on sshd"

log "Enabling unattended security upgrades"
echo 'Unattended-Upgrade::Allowed-Origins { "${distro_id}:${distro_codename}-security"; };' \
  | sudo tee /etc/apt/apt.conf.d/51unattended-upgrades-security >/dev/null
sudo systemctl enable --now unattended-upgrades
ok "unattended-upgrades enabled (security updates only)"

log "Configuring Docker daemon log rotation"
if [[ ! -f /etc/docker/daemon.json ]]; then
  sudo mkdir -p /etc/docker
  echo '{"log-driver":"json-file","log-opts":{"max-size":"10m","max-file":"5"}}' \
    | sudo tee /etc/docker/daemon.json >/dev/null
  sudo systemctl restart docker
  ok "Docker daemon log rotation configured (10m x 5 files)"
else
  ok "/etc/docker/daemon.json already exists — left untouched"
fi

log "Disk space check"
df -h / "$APP_DIR" 2>/dev/null | awk 'NR==1 || /\/$|mzali/'
avail_kb="$(df --output=avail / | tail -1)"
if (( avail_kb < 5*1024*1024 )); then
  echo "  WARNING: less than 5GB free on / — image pulls and backups may fail." >&2
else
  ok "sufficient free disk space on /"
fi

log "Confirming SSH root login is disabled (should already be, per your VPS config)"
if sudo grep -qE '^\s*PermitRootLogin\s+(no|prohibit-password)' /etc/ssh/sshd_config 2>/dev/null; then
  ok "PermitRootLogin is disabled"
else
  echo "  WARNING: could not confirm PermitRootLogin is disabled in /etc/ssh/sshd_config." >&2
  echo "  This script does NOT change SSH config — verify manually, do not assume." >&2
fi

log "Verifying required ports are not already bound by something else"
for p in 80 443; do
  if sudo ss -ltnp "( sport = :$p )" 2>/dev/null | grep -q LISTEN; then
    echo "  WARNING: something is already listening on port $p — Caddy will fail to bind." >&2
    sudo ss -ltnp "( sport = :$p )" 2>/dev/null
  else
    ok "port $p is free"
  fi
done

cat <<EOF

=================================================================
Bootstrap complete.

Next steps (see docs/deployment/first-deployment.md for the full sequence):
  1. If this was your first run, log out and back in now so the docker
     group membership takes effect: exit, then ssh back in.
  2. Clone the repository into $APP_DIR/releases/mzali (the CD workflow
     expects this exact path — VPS_DEPLOY_PATH secret):
       git clone <repo-url> $APP_DIR/releases/mzali
  3. Copy deploy/.env.example to $APP_DIR/shared/.env.production and fill
     in every value, then: chmod 600 $APP_DIR/shared/.env.production
  4. Symlink it into the checkout (the deploy scripts read deploy/.env; the
     CD workflow also creates this symlink automatically if missing, this
     is only needed for a manual first deploy):
       ln -s $APP_DIR/shared/.env.production $APP_DIR/releases/mzali/deploy/.env
  5. Add the GitHub Secrets listed in docs/deployment/github-secrets.md.
  6. Trigger the deploy-production workflow.
=================================================================
EOF
