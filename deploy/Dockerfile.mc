# Minimal, checksum-verified `mc` (MinIO Client) image, built and hosted
# in our own GHCR. quay.io/minio/mc (and the Docker Hub equivalent)
# stopped resolving anonymously on 2026-09-25 — MinIO restricted
# anonymous pulls of their own pre-built images on both registries — so
# every place in this repo that used to assume `mc` came pre-baked into
# a pulled image (the minio-init service, backup-minio.sh,
# restore-minio.sh) now pulls this instead. The binary itself still
# comes from MinIO's own GitHub Releases (the one distribution channel
# confirmed still open), checksum-verified at build time, not at every
# container start.
FROM alpine:3.20

ARG MC_VERSION=RELEASE.2025-08-13T08-35-41Z
ARG MC_SHA256=01f866e9c5f9b87c2b09116fa5d7c06695b106242d829a8bb32990c00312e891

RUN wget -qO /usr/local/bin/mc "https://github.com/minio/mc/releases/download/${MC_VERSION}/mc.linux-amd64.${MC_VERSION}" \
 && echo "${MC_SHA256}  /usr/local/bin/mc" | sha256sum -c - \
 && chmod +x /usr/local/bin/mc

ENTRYPOINT ["mc"]
