#!/usr/bin/env bash
# Build + run the benchmark locally with Azure CLI credentials mounted from
# ~/.azure so Auto Discovery works against your own `az login` session.
#
# Usage:
#   ./scripts/run-local.sh                 # build, run, smoke test, leave running
#   SKIP_BUILD=1 ./scripts/run-local.sh    # skip rebuild
#   ./scripts/run-local.sh stop            # stop and remove the local container
#
# After it starts, open http://localhost:8088 in a browser.

set -euo pipefail

IMAGE="${IMAGE:-aoai-benchmark:local}"
CONTAINER="${CONTAINER:-aoai-bench-local}"
PORT="${PORT:-8088}"
# Fixed path (not mktemp) so the bind mount stays valid after the script exits.
# Rotated on every start; cleaned up on `./scripts/run-local.sh stop`.
AZ_COPY="/tmp/aoai-azure-local"

cd "$(dirname "$0")/.."

if [[ "${1:-}" == "stop" ]]; then
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$AZ_COPY"
  echo "Stopped and removed $CONTAINER."
  exit 0
fi

# 1. Sanity check: user must be logged in via az CLI.
if ! az account show >/dev/null 2>&1; then
  echo "ERROR: no active Azure CLI session. Run 'az login' first." >&2
  exit 1
fi
ACCOUNT_NAME=$(az account show --query user.name -o tsv)
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
echo "Using az login: $ACCOUNT_NAME  (subscription $SUBSCRIPTION_ID)"

# 2. Build with INSTALL_AZ_CLI=true so the container has `az` on PATH.
if [[ -z "${SKIP_BUILD:-}" ]]; then
  echo "Building $IMAGE (this installs azure-cli into the image, ~300MB extra)..."
  docker build --build-arg INSTALL_AZ_CLI=true -t "$IMAGE" .
fi

# 3. Stop any stale container with the same name.
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true

# 4. Copy ~/.azure to a fixed temp dir with widened permissions. The copy
# lives as long as the container; `./scripts/run-local.sh stop` cleans it up.
# The originals in ~/.azure stay at 600 — we only loosen the copy.
# We allow WRITE too (u+w,go+w) because `az` inside the container refreshes
# MSAL tokens and writes back to azureProfile.json / msal_token_cache.json.
rm -rf "$AZ_COPY"
mkdir -p "$AZ_COPY"
cp -R "$HOME/.azure/." "$AZ_COPY/"
chmod -R u+rwX,go+rwX "$AZ_COPY"

# 5. Run. We use --user 0 so root inside the container can read the cache
# regardless of host-side ownership (bind mounts on macOS pass host uid
# through). Only for local testing — prod images keep running as appuser.
echo "Starting $CONTAINER on port $PORT..."
docker run --rm -d \
  --name "$CONTAINER" \
  -p "$PORT:8088" \
  -v "$AZ_COPY:/root/.azure" \
  -e HOME=/root \
  -e "AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID" \
  --user 0 \
  "$IMAGE" >/dev/null

# 6. Wait for /healthz.
echo -n "Waiting for /healthz "
for i in {1..60}; do
  if curl -fsS "http://localhost:$PORT/healthz" >/dev/null 2>&1; then
    echo " ok"
    break
  fi
  echo -n "."
  sleep 1
  if (( i == 60 )); then
    echo " timeout"
    docker logs "$CONTAINER" | tail -50
    exit 1
  fi
done

# 7. Smoke test.
echo
echo "== /api/version (auth method) =="
curl -sS "http://localhost:$PORT/api/version" | python3 -m json.tool
echo
echo "== /api/resources/discover =="
curl -sS "http://localhost:$PORT/api/resources/discover" | python3 -m json.tool

echo
echo "Container is still running. Open http://localhost:$PORT in a browser."
echo "To stop:  ./scripts/run-local.sh stop"
