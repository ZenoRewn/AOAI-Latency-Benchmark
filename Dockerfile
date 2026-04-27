# syntax=docker/dockerfile:1.7

# ---- Stage 1: build Next.js static export ----
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

# Leverage Docker layer cache: install deps first
COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY frontend/ ./
# NEXT_PUBLIC_API_URL is intentionally unset so the built frontend talks
# to the same origin it was served from (see src/lib/api.ts).
RUN npm run build

# ---- Stage 2: Python backend + static frontend ----
# Pin to bookworm so the Microsoft apt repo (bookworm main) is reachable
# when INSTALL_AZ_CLI=true. Trixie has no azure-cli release file yet.
FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOST=0.0.0.0 \
    PORT=8088

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Optional: install azure-cli for local-dev images so DefaultAzureCredential
# can fall through to AzureCliCredential when ~/.azure is bind-mounted.
# Production images (AKS Workload Identity) leave this off — the prod path
# doesn't need `az` on PATH.
ARG INSTALL_AZ_CLI=false
RUN if [ "$INSTALL_AZ_CLI" = "true" ]; then \
      apt-get update \
   && apt-get install -y --no-install-recommends gnupg lsb-release \
   && curl -sL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /etc/apt/trusted.gpg.d/microsoft.gpg \
   && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/trusted.gpg.d/microsoft.gpg] https://packages.microsoft.com/repos/azure-cli/ $(lsb_release -cs) main" \
        > /etc/apt/sources.list.d/azure-cli.list \
   && apt-get update \
   && apt-get install -y --no-install-recommends azure-cli \
   && rm -rf /var/lib/apt/lists/*; \
    fi

RUN useradd --create-home --uid 1000 appuser
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY --chown=appuser:appuser app.py auth.py config.py ./
COPY --chown=appuser:appuser routes/ ./routes/
COPY --chown=appuser:appuser benchmark/ ./benchmark/
COPY --chown=appuser:appuser static/ ./static/
COPY --chown=appuser:appuser templates/ ./templates/

# Pre-built frontend from Stage 1
COPY --from=frontend-builder --chown=appuser:appuser /app/frontend/out /app/frontend/out

USER appuser
EXPOSE 8088

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

CMD ["sh", "-c", "exec uvicorn app:app --host ${HOST} --port ${PORT}"]
