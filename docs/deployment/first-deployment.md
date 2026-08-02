# First Production Deployment — Exact Steps

Follow in order. Nothing here includes the real VPS password — every step
that needs it tells you to type it interactively or paste it into GitHub's
secret UI (which never displays it back to you).

## 1. Configure OVH DNS

Follow `docs/deployment/ovh-dns.md` — six `A` records, all → `149.202.34.65`.

## 2. Wait for DNS propagation

```bash
dig +short ahmedmzaliboutique.tn
dig +short www.ahmedmzaliboutique.tn
dig +short admin.ahmedmzaliboutique.tn
dig +short pos.ahmedmzaliboutique.tn
dig +short api.ahmedmzaliboutique.tn
dig +short media.ahmedmzaliboutique.tn
```

Every line must print `149.202.34.65` before continuing — Let's Encrypt
cannot issue certificates otherwise.

## 3. Connect to the VPS

```bash
ssh ubuntu@149.202.34.65
```

(Password auth — you'll be prompted. This is you connecting manually for
setup; the CI/CD pipeline authenticates the same way using GitHub Secrets.)

## 4. Get the bootstrap script onto the VPS and run it

```bash
curl -fsSL https://raw.githubusercontent.com/declared-as-ala/mzali-full/master/scripts/bootstrap-ovh-vps.sh -o bootstrap.sh
bash bootstrap.sh
```

It installs Docker, configures UFW (22/80/443 only), enables Fail2ban,
creates `/opt/mzali/{compose,shared,backups,releases,scripts,logs}`, adds
`ubuntu` to the `docker` group, and enables unattended security upgrades.
**Log out and back in** afterward so the `docker` group membership takes
effect:

```bash
exit
ssh ubuntu@149.202.34.65
docker ps   # should work without sudo now
```

## 5. Clone the repository onto the VPS

```bash
git clone https://github.com/declared-as-ala/mzali-full.git /opt/mzali/releases/mzali
cd /opt/mzali/releases/mzali
```

## 6. Create `/opt/mzali/shared/.env.production`

```bash
cp deploy/.env.example /opt/mzali/shared/.env.production
chmod 600 /opt/mzali/shared/.env.production
nano /opt/mzali/shared/.env.production
```

Replace every `change-me`/`replace-with-*` placeholder — domains are already
pre-filled to `*.ahmedmzaliboutique.tn`. Generate real secrets with the
`openssl` commands in `docs/deployment/github-secrets.md`. Leave `IMAGE_TAG`
as-is; `deploy.sh` updates it automatically on every deploy.

Then symlink it into the checkout (the deploy scripts read `deploy/.env`;
CD also does this automatically on future deploys, but the first one is
manual):

```bash
ln -s /opt/mzali/shared/.env.production deploy/.env
```

## 7. First-time infrastructure bring-up (before any app images exist)

Start only the stateful services and confirm they're healthy before the
first CD run ever tries to pull app images:

```bash
docker compose --env-file deploy/.env \
  -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml \
  up -d mongo redis minio minio-init
docker compose --env-file deploy/.env \
  -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml ps
```

Wait until `mongo`, `redis`, `minio`, and `minio-init` all show
`healthy`/`exited (0)` respectively. Then take the first backup (creates
`/opt/mzali/backups/mongo/<timestamp>/` — proves the backup path itself
works before you rely on it):

```bash
bash deploy/scripts/backup-mongodb.sh
bash deploy/scripts/backup-minio.sh
```

## 8. Add GitHub Secrets

In the repo on GitHub: **Settings → Environments → New environment** named
`production` (optionally require an approving reviewer here), then add the
five deploy-transport secrets from `docs/deployment/github-secrets.md`
(`VPS_HOST`, `VPS_PORT`, `VPS_USER`, `VPS_PASSWORD`, `VPS_DEPLOY_PATH`).

## 9. Run CI

Push to `master` (or open a PR) — `.github/workflows/ci.yml` runs
lint/typecheck/tests/build for storefront, POS, and backend, validates the
compose files, builds all four Docker images, and scans them with Trivy.
CI must be green before deployment can trigger.

## 10. Trigger production deployment

Deployment fires automatically when CI succeeds on `master`. To run it
manually instead (e.g. to redeploy an older commit):

**GitHub UI:** Actions → Deploy Production → Run workflow → optionally set
the `sha` input → Run workflow.

**GitHub CLI:**
```bash
gh workflow run deploy-production.yml -f sha=<commit-sha>
```

This builds and pushes all four images tagged with the commit SHA, updates
the VPS checkout to that SHA, symlinks `deploy/.env` if missing, and runs
`deploy/scripts/deploy.sh <sha>` over SSH — which backs up, pulls, restarts,
waits for health, and smoke-tests every domain.

## 11. Verify containers

```bash
ssh ubuntu@149.202.34.65
cd /opt/mzali/releases/mzali
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml ps
```

All of `mongo`, `redis`, `minio`, `storefront`, `api`, `worker`, `pos`,
`caddy` should show `Up (healthy)`.

## 12. Verify domains + SSL

```bash
bash deploy/scripts/verify-production.sh
```

Or by hand:
```bash
curl -I https://ahmedmzaliboutique.tn/
curl -I https://www.ahmedmzaliboutique.tn/
curl -I https://admin.ahmedmzaliboutique.tn/
curl -I https://pos.ahmedmzaliboutique.tn/
curl -I https://api.ahmedmzaliboutique.tn/health/ready
curl -I https://media.ahmedmzaliboutique.tn/
```
Every response should be `HTTP/2 200` (or `301`/`302` for `www`/`admin`,
followed to `200`) with a valid certificate — `curl` fails closed on a bad
cert, so success here already proves HTTPS works.

## 13. Test Admin

Visit `https://admin.ahmedmzaliboutique.tn/` in a browser — this redirects
to `https://ahmedmzaliboutique.tn/admin` (see the audit doc §6 for why it's
a redirect, not a separate app). Log in, confirm the dashboard loads.

## 14. Test POS

Visit `https://pos.ahmedmzaliboutique.tn/` — log in with a cashier/employee
account, confirm the till loads and product search works.

## 15. Test storefront

Visit `https://ahmedmzaliboutique.tn/` — browse the shop page, open a
product, confirm images load from `media.ahmedmzaliboutique.tn`.

## 16. Test API

```bash
curl https://api.ahmedmzaliboutique.tn/health
```
Should return `{"status":"ok","checks":{"mongodb":true,"redis":true}}`.

## 17. Test persistent uploads

Upload a product image in Admin, confirm it renders from
`https://media.ahmedmzaliboutique.tn/catalog/...`, then redeploy
(`gh workflow run deploy-production.yml`) and confirm the image is still
there afterward — proves the `minio-data` volume survives redeployment.

## 18. Test restart after reboot

```bash
ssh ubuntu@149.202.34.65 'sudo reboot'
# wait ~1 minute
ssh ubuntu@149.202.34.65
cd /opt/mzali/releases/mzali
docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml ps
```
Every service has `restart: unless-stopped` — all containers should be
`Up` again automatically (Docker's own daemon-start policy restarts them;
no manual `up -d` needed). If any show `Exited`, check logs
(`docker compose ... logs <service>`).

## 19. Verify backups

```bash
bash deploy/scripts/verify-backup.sh
```
Restores the latest backup into a throwaway container and diffs document
counts against live data. Schedule this + the two backup scripts on cron —
see `docs/deployment/backup-and-restore.md`.
