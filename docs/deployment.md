# Production deployment

> **Superseded** by `docs/deployment/production-deployment.md` (OVH VPS,
> `/opt/mzali`, password-based SSH deploy, all six production domains). Kept
> for historical reference — the deploy path, SSH auth method, and backup
> script names below are out of date versus the current setup.

The production stack is the merge of `deploy/docker-compose.yml` and
`deploy/docker-compose.prod.yml`. It runs the storefront, Nest API, BullMQ
worker, authenticated MongoDB replica set, password-protected Redis, MinIO,
and Caddy. Only Caddy publishes host ports 80/443; the API and data services
remain on the private `mzali-internal` network.

## VPS preparation

1. Install Docker Engine with the Compose plugin on a Linux VPS.
2. Point the storefront and media DNS records at the VPS.
3. Copy the repository to a stable path such as `/srv/mzali`.
4. Copy `deploy/.env.example` to `deploy/.env`, replace every placeholder,
   and set permissions to `chmod 600 deploy/.env`.
5. Generate independent secrets with `openssl rand -hex 32`. Generate the
   Mongo replica key with `openssl rand -base64 756 | tr -d '\n'`.
6. Authenticate the VPS to GHCR using a read-packages token:
   `docker login ghcr.io`.
7. Mount `BACKUP_TARGET` from a second disk or remote-backed filesystem.

For the first-ever bootstrap, start only the stateful services, wait for them
to become healthy, and create the initial empty backup before enabling CD:

```bash
docker compose --env-file deploy/.env \
  -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml \
  up -d mongo redis minio minio-init
bash deploy/scripts/backup.sh
```

After images have been published, start or inspect the complete stack with:

```bash
docker compose --env-file deploy/.env \
  -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml up -d
docker compose --env-file deploy/.env \
  -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml ps
```

The MinIO console is intentionally not routed by Caddy. On the VPS, obtain its
private container IP, then use that IP as the SSH tunnel destination instead
of publishing port 9001:

```bash
docker inspect "$(docker compose --env-file deploy/.env -f deploy/docker-compose.yml -f deploy/docker-compose.prod.yml ps -q minio)" \
  --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'
# Run locally, substituting the private IP printed above:
ssh -L 9001:172.20.0.5:9001 user@your-vps
```

## GitHub configuration

Create a protected GitHub environment named `production` and require an
approving reviewer. Add these repository/environment secrets:

- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_KEY`
- `VPS_SSH_PORT`
- `VPS_DEPLOY_PATH` (for example `/srv/mzali`)

CI runs on pull requests and pushes to `master`. A successful `master` CI run
starts CD; the protected `production` environment supplies the approval gate.
CD publishes immutable SHA tags plus the convenience `latest` tag, but deploys
the SHA tag only. The VPS records the successful SHA in `deploy/.last-good`.

`deploy/scripts/deploy.sh` takes a pre-deploy backup, pulls the requested SHA,
starts the stack, waits for API and storefront health, and smoke-tests the home
and configured product pages. On failure it exits non-zero and prints the
exact previous-tag rollback command.
