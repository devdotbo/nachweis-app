#!/usr/bin/env bash
#
# browser-real-wallet-down.sh: stop everything browser-real-wallet-up.sh started (app, bridge, anvil,
# then the verifier and the tunnel through g0-down.sh unless they were reused from another run).
#
# Usage:
#   scripts/browser-real-wallet-down.sh [RUN_DIR]    default: newest *-browser directory under RUN_ROOT
#   RUN_ROOT   [<repo>/docs/evidence/private/runs]
#
# Leaves the logs in place (gitignored) and prints where they are. Processes it did not start are
# never touched: only the pids recorded in the run directory are signalled.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ROOT="${RUN_ROOT:-$REPO_DIR/docs/evidence/private/runs}"
RUN_DIR="${1:-${BROWSER_RUN_DIR:-}}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR="$(ls -1d "$RUN_ROOT"/*-browser/ 2>/dev/null | sort | tail -1 || true)"
  RUN_DIR="${RUN_DIR%/}"
fi
[ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] || { echo "browser-real-wallet-down: no run directory (pass one or set BROWSER_RUN_DIR)" >&2; exit 1; }

stop_pid() {
  local name="$1" file="$RUN_DIR/$1.pid" pid
  [ -f "$file" ] || { echo "browser-real-wallet-down: no $name.pid"; return; }
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
    echo "browser-real-wallet-down: stopped $name (pid $pid)"
  else
    echo "browser-real-wallet-down: $name (pid $pid) was not running"
  fi
}

# App first (it polls the bridge), then the bridge (it talks to anvil), then anvil.
stop_pid app
stop_pid bridge
stop_pid anvil
if grep -q '^verifier_reused=yes' "$RUN_DIR/run.txt" 2>/dev/null; then
  echo "browser-real-wallet-down: the verifier and tunnel were reused from another run and stay up (stop them with scripts/g0-down.sh <their run dir>)"
  echo "stopped_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$RUN_DIR/run.txt"
else
  "$REPO_DIR/scripts/g0-down.sh" "$RUN_DIR"
fi
echo "browser-real-wallet-down: logs stay in $RUN_DIR (gitignored); the issuer token file is there too, delete the directory when the evidence is written up."
