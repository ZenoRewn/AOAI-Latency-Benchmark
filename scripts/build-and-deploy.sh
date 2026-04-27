#!/usr/bin/env bash
# Build the image, push it to ACR, and roll the AKS Deployment to it.
#
# Usage:
#   ACR=myregistry ./scripts/build-and-deploy.sh                   # tag = git short sha
#   ACR=myregistry TAG=v3 ./scripts/build-and-deploy.sh            # explicit tag
#   ACR=myregistry TAG=v3 NAMESPACE=aoai-benchmark DEPLOY=aoai-benchmark ./scripts/build-and-deploy.sh
#   DRY_RUN=1 ACR=myregistry ./scripts/build-and-deploy.sh         # print only
#
# Optional env:
#   IMAGE_NAME   Image repository name. Default: aoai-benchmark
#   PLATFORM     Target platform. Default: linux/amd64 (works on AKS x86 pools).
#                Set to "linux/arm64" or "linux/amd64,linux/arm64" for other pools.
#   SKIP_LOGIN   If set, skip `az acr login`.
#   SKIP_PUSH    If set, skip `docker push` (useful for local build-only test).
#   SKIP_ROLLOUT If set, skip `kubectl set image` / `rollout status`.
set -euo pipefail

: "${ACR:?ACR is required (e.g. ACR=myregistry, without .azurecr.io)}"
IMAGE_NAME="${IMAGE_NAME:-aoai-benchmark}"
NAMESPACE="${NAMESPACE:-aoai-benchmark}"
DEPLOY="${DEPLOY:-aoai-benchmark}"
CONTAINER="${CONTAINER:-app}"
PLATFORM="${PLATFORM:-linux/amd64}"

if [[ -z "${TAG:-}" ]]; then
  TAG=$(git -C "$(dirname "$0")/.." rev-parse --short HEAD 2>/dev/null || date +%Y%m%d%H%M%S)
fi
IMAGE="${ACR}.azurecr.io/${IMAGE_NAME}:${TAG}"

run() {
  printf '\n\033[1;34m$ %s\033[0m\n' "$*"
  if [[ -z "${DRY_RUN:-}" ]]; then
    "$@"
  fi
}

cd "$(dirname "$0")/.."

run docker build --platform "$PLATFORM" -t "$IMAGE" .

if [[ -z "${SKIP_LOGIN:-}" ]]; then
  run az acr login -n "$ACR"
fi

if [[ -z "${SKIP_PUSH:-}" ]]; then
  run docker push "$IMAGE"
fi

if [[ -z "${SKIP_ROLLOUT:-}" ]]; then
  run kubectl -n "$NAMESPACE" set image "deploy/${DEPLOY}" "${CONTAINER}=${IMAGE}"
  run kubectl -n "$NAMESPACE" rollout status "deploy/${DEPLOY}" --timeout=3m
fi

printf '\n\033[1;32m✓ Deployed %s\033[0m\n' "$IMAGE"
