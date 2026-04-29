#!/usr/bin/env bash
# Local dev loop: FastAPI backend on :8088 + Next.js dev server on :3000
# with /api + /healthz proxied to the backend (see frontend/next.config.ts).
#
# This is the no-Docker path. For the Docker path (az CLI mounted in), use
# scripts/run-local.sh instead.
#
# Usage:
#   ./scripts/run-dev.sh              # start both, smoke test, detach
#   ./scripts/run-dev.sh stop         # stop both
#   ./scripts/run-dev.sh status       # show pids / ports
#
# Env overrides:
#   BACKEND_PORT=8088 FRONTEND_PORT=3000
#   SKIP_DEPS=1  (skip pip install / npm install on restart)

set -euo pipefail

cd "$(dirname "$0")/.."

BACKEND_PORT="${BACKEND_PORT:-8088}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
VENV_DIR=".venv"
FRONTEND_DIR="frontend"
PID_DIR=".run"
BACKEND_PID="$PID_DIR/backend.pid"
FRONTEND_PID="$PID_DIR/frontend.pid"
BACKEND_LOG="$PID_DIR/backend.log"
FRONTEND_LOG="$PID_DIR/frontend.log"

mkdir -p "$PID_DIR"

# ---- subcommands ---------------------------------------------------------

is_alive() { [[ -f "$1" ]] && kill -0 "$(cat "$1" 2>/dev/null)" 2>/dev/null; }

stop_pid() {
  local file="$1" name="$2"
  if is_alive "$file"; then
    local pid
    pid=$(cat "$file")
    echo "Stopping $name (pid $pid)..."
    kill "$pid" 2>/dev/null || true
    for _ in {1..20}; do kill -0 "$pid" 2>/dev/null || break; sleep 0.2; done
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$file"
}

cmd_stop() {
  stop_pid "$BACKEND_PID" backend
  stop_pid "$FRONTEND_PID" frontend
  echo "Stopped."
}

cmd_status() {
  if is_alive "$BACKEND_PID"; then
    echo "backend  : pid $(cat "$BACKEND_PID") — http://localhost:$BACKEND_PORT"
  else
    echo "backend  : not running"
  fi
  if is_alive "$FRONTEND_PID"; then
    echo "frontend : pid $(cat "$FRONTEND_PID") — http://localhost:$FRONTEND_PORT"
  else
    echo "frontend : not running"
  fi
}

case "${1:-start}" in
  stop)   cmd_stop; exit 0 ;;
  status) cmd_status; exit 0 ;;
  start)  ;;
  *) echo "Unknown command: $1" >&2; exit 2 ;;
esac

# ---- start: sanity checks -----------------------------------------------

if is_alive "$BACKEND_PID" || is_alive "$FRONTEND_PID"; then
  echo "Dev processes already running. Run './scripts/run-dev.sh stop' first." >&2
  cmd_status
  exit 1
fi

find_python() {
  # project uses `X | None` (PEP 604), needs Python 3.10+
  for candidate in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$candidate" >/dev/null 2>&1; then
      local ver
      ver=$("$candidate" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo 0.0)
      if [[ "$(printf '%s\n%s' 3.10 "$ver" | sort -V | head -1)" == "3.10" ]]; then
        echo "$candidate"
        return 0
      fi
    fi
  done
  return 1
}

if ! PYTHON_BIN=$(find_python); then
  echo "ERROR: no Python 3.10+ found on PATH." >&2
  echo "Install one (e.g. 'brew install python@3.13') and retry." >&2
  exit 1
fi
echo "Using $PYTHON_BIN ($("$PYTHON_BIN" --version))"

# ---- venv + pip deps -----------------------------------------------------

VENV_PY="$VENV_DIR/bin/python"
VENV_OK=0
if [[ -x "$VENV_PY" ]]; then
  # Rebuild if venv python is <3.10 (stale venv from a prior interpreter).
  venv_ver=$("$VENV_PY" -c 'import sys; print("%d.%d" % sys.version_info[:2])' 2>/dev/null || echo 0.0)
  if [[ "$(printf '%s\n%s' 3.10 "$venv_ver" | sort -V | head -1)" == "3.10" ]]; then
    VENV_OK=1
  else
    echo "Rebuilding stale venv ($venv_ver -> need 3.10+)..."
    rm -rf "$VENV_DIR"
  fi
fi

if [[ "$VENV_OK" -ne 1 ]]; then
  echo "Creating $VENV_DIR ..."
  "$PYTHON_BIN" -m venv "$VENV_DIR"
  "$VENV_PY" -m pip install --upgrade pip -q
fi

if [[ -z "${SKIP_DEPS:-}" ]]; then
  echo "Installing Python deps..."
  "$VENV_PY" -m pip install -r requirements.txt -q
fi

# ---- frontend deps -------------------------------------------------------

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend deps..."
  (cd "$FRONTEND_DIR" && npm install)
elif [[ -z "${SKIP_DEPS:-}" ]]; then
  # Light sync: only if package.json is newer than node_modules.
  if [[ "$FRONTEND_DIR/package.json" -nt "$FRONTEND_DIR/node_modules" ]]; then
    echo "package.json changed, re-syncing frontend deps..."
    (cd "$FRONTEND_DIR" && npm install)
  fi
fi

# ---- start backend -------------------------------------------------------

echo "Starting backend on :$BACKEND_PORT ..."
: > "$BACKEND_LOG"
(
  # app.py reads PORT if set; otherwise defaults to 8088. We export for safety.
  export PORT="$BACKEND_PORT"
  nohup "$VENV_PY" app.py >>"$BACKEND_LOG" 2>&1 &
  echo $! > "$BACKEND_PID"
)

echo -n "Waiting for /healthz "
for i in {1..60}; do
  if curl -fsS "http://localhost:$BACKEND_PORT/healthz" >/dev/null 2>&1; then
    echo " ok"
    break
  fi
  echo -n "."
  sleep 0.5
  if (( i == 60 )); then
    echo " timeout"
    tail -40 "$BACKEND_LOG" >&2
    cmd_stop
    exit 1
  fi
done

# ---- start frontend ------------------------------------------------------

echo "Starting frontend dev server on :$FRONTEND_PORT ..."
: > "$FRONTEND_LOG"
(
  export PORT="$FRONTEND_PORT"
  # DEV_BACKEND_ORIGIN is read by next.config.ts to build the rewrite target.
  export DEV_BACKEND_ORIGIN="http://localhost:$BACKEND_PORT"
  cd "$FRONTEND_DIR"
  nohup npm run dev -- --port "$FRONTEND_PORT" >>"../$FRONTEND_LOG" 2>&1 &
  echo $! > "../$FRONTEND_PID"
)

echo -n "Waiting for frontend "
for i in {1..60}; do
  if curl -fsS -o /dev/null "http://localhost:$FRONTEND_PORT/" 2>/dev/null; then
    echo " ok"
    break
  fi
  echo -n "."
  sleep 0.5
  if (( i == 60 )); then
    echo " timeout"
    tail -40 "$FRONTEND_LOG" >&2
    cmd_stop
    exit 1
  fi
done

# ---- smoke test the proxy ------------------------------------------------

echo
echo "== Proxy check: frontend:$FRONTEND_PORT/api/auth/status -> backend =="
if ! curl -fsS "http://localhost:$FRONTEND_PORT/api/auth/status" | python3 -m json.tool; then
  echo "WARN: proxy smoke test failed. Check $FRONTEND_LOG and $BACKEND_LOG." >&2
fi

echo
echo "Dev is up."
echo "  Frontend: http://localhost:$FRONTEND_PORT"
echo "  Backend : http://localhost:$BACKEND_PORT  (proxied through frontend)"
echo "  Logs    : $BACKEND_LOG  $FRONTEND_LOG"
echo "  Stop    : ./scripts/run-dev.sh stop"
