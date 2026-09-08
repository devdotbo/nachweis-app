#!/usr/bin/env bash
#
# g0-down.sh: stop the verifier and the tunnel started by g0-up.sh.
#
# Usage:
#   scripts/g0-down.sh [RUN_DIR]     default: newest directory under RUN_ROOT
#   RUN_ROOT   [<repo>/docs/evidence/private/runs]
#
# Leaves the logs in place (they are gitignored) and prints where they are.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ROOT="${RUN_ROOT:-$REPO_DIR/docs/evidence/private/runs}"
RUN_DIR="${1:-${G0_RUN_DIR:-}}"
if [ -z "$RUN_DIR" ]; then
  RUN_DIR="$(ls -1d "$RUN_ROOT"/*/ 2>/dev/null | sort | tail -1 || true)"
  RUN_DIR="${RUN_DIR%/}"
fi
[ -n "$RUN_DIR" ] && [ -d "$RUN_DIR" ] || { echo "g0-down: no run directory (pass one or set G0_RUN_DIR)" >&2; exit 1; }

stop_pid() {
  local name="$1" file="$RUN_DIR/$1.pid" pid
  [ -f "$file" ] || { echo "g0-down: no $name.pid"; return; }
  pid="$(cat "$file")"
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    if kill -0 "$pid" 2>/dev/null; then kill -KILL "$pid" 2>/dev/null || true; fi
    echo "g0-down: stopped $name (pid $pid)"
  else
    echo "g0-down: $name (pid $pid) was not running"
  fi
}

# Verifier first so the tunnel never serves a half-stopped service.
stop_pid verifier
stop_pid tunnel
echo "stopped_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" >>"$RUN_DIR/run.txt"
echo "g0-down: logs stay in $RUN_DIR (gitignored). Public hostname is gone."
