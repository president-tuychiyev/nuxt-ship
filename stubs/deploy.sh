#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

TAR_FILE="${1:?usage: deploy.sh <hash.tar.gz>}"
SELF_PATH="$(readlink -f "$0")"
SUCCESS=0

cleanup() {
    rm -f "$TAR_FILE"
    if [ "$SUCCESS" -ne 1 ]; then
        rm -f docker-compose.yml
    fi
    rm -f "$SELF_PATH"
}
trap cleanup EXIT

if ! docker network inspect app_network >/dev/null 2>&1; then
    docker network create app_network
fi

echo "==> Loading image from $TAR_FILE"
gunzip -c "$TAR_FILE" | docker load

echo "==> Starting containers"
docker compose -f docker-compose.yml up -d --force-recreate

echo "==> Pruning dangling images"
docker image prune -f

echo "==> Container status"
docker compose -f docker-compose.yml ps

SUCCESS=1
echo "==> Deployment finished"
