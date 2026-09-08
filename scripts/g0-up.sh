#!/usr/bin/env bash
#
# g0-up.sh: start the relay-branch verifier and an HTTPS tunnel for the G0 run.
#
# Order: tunnel first (its public hostname becomes PUBLIC_URL), then the
# verifier. Prints the public URL and the run directory. Records pids and logs
# under the run directory. Never prints key material or tokens.
#
# Usage:
#   scripts/g0-up.sh
#   TUNNEL=ngrok scripts/g0-up.sh
#   TUNNEL=none PUBLIC_URL=https://my.host/ scripts/g0-up.sh
#
# Environment (all optional, defaults in brackets):
#   VERIFIER_DIR       verifier worktree [/Users/bioharz/git/ethglobal/nachweis-verifier-relay]
#   VERIFIER_BIN       built binary [$VERIFIER_DIR/target/release/verifier-service]; built if missing
#   RP_KEY_PATH        registrar leaf private key [/Users/bioharz/git/eudi-wallet-hackathon/secrets/rp.key]
#   RP_LEAF_PATH       registrar leaf certificate [$VERIFIER_DIR/fixtures/live/access-leaf.pem]
#   TRUST_ANCHOR_PATH  PID issuer anchor PEM; unset by default. Has no effect on the
#                      relay path (the verifier never opens a relay response) and is
#                      passed through only for a bridge-mode comparison run.
#   RELAY_PICKUP_ONCE  [true]
#   RESULT_INCLUDES_PRESENTATION  [false] keeps /result/:id minimal
#   RESULT_TOKEN       passed through to the verifier if set (result endpoint auth,
#                      added by the verifier teammate); never printed
#   PORT               [8090]   HOST [127.0.0.1]   RUST_LOG [info]
#   TUNNEL             cloudflared | ngrok | none [cloudflared]
#   PUBLIC_URL         required when TUNNEL=none; must end in '/'
#   RUN_ROOT           [<repo>/docs/evidence/private/runs] (gitignored)
#   G0_RUN_DIR         explicit run directory instead of RUN_ROOT/<timestamp>

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFIER_DIR="${VERIFIER_DIR:-/Users/bioharz/git/ethglobal/nachweis-verifier-relay}"
VERIFIER_BIN="${VERIFIER_BIN:-$VERIFIER_DIR/target/release/verifier-service}"
RP_KEY_PATH="${RP_KEY_PATH:-/Users/bioharz/git/eudi-wallet-hackathon/secrets/rp.key}"
RP_LEAF_PATH="${RP_LEAF_PATH:-$VERIFIER_DIR/fixtures/live/access-leaf.pem}"
RELAY_PICKUP_ONCE="${RELAY_PICKUP_ONCE:-true}"
RESULT_INCLUDES_PRESENTATION="${RESULT_INCLUDES_PRESENTATION:-false}"
PORT="${PORT:-8090}"
HOST="${HOST:-127.0.0.1}"
RUST_LOG="${RUST_LOG:-info}"
TUNNEL="${TUNNEL:-cloudflared}"
RUN_ROOT="${RUN_ROOT:-$REPO_DIR/docs/evidence/private/runs}"
RUN_DIR="${G0_RUN_DIR:-$RUN_ROOT/$(date +%Y%m%d-%H%M%S)}"

die() { echo "g0-up: $*" >&2; exit 1; }

# Preconditions, reported as paths and existence only.
[ -f "$RP_KEY_PATH" ] || die "RP key not found at $RP_KEY_PATH (set RP_KEY_PATH)"
[ -f "$RP_LEAF_PATH" ] || die "RP leaf not found at $RP_LEAF_PATH (set RP_LEAF_PATH)"
if [ -n "${TRUST_ANCHOR_PATH:-}" ] && [ ! -f "$TRUST_ANCHOR_PATH" ]; then
  die "TRUST_ANCHOR_PATH set but not found: $TRUST_ANCHOR_PATH"
fi
command -v curl >/dev/null || die "curl missing"
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die "port $PORT already in use (set PORT)"
fi

if [ ! -x "$VERIFIER_BIN" ]; then
  echo "g0-up: building verifier (release) in $VERIFIER_DIR"
  cargo build --release --manifest-path "$VERIFIER_DIR/verifier-service/Cargo.toml"
  [ -x "$VERIFIER_BIN" ] || die "build finished but $VERIFIER_BIN is missing"
fi

mkdir -p "$RUN_DIR"
chmod 700 "$RUN_DIR"
echo "g0-up: run directory $RUN_DIR"

# 1. Tunnel first: PUBLIC_URL is derived from it.
TUNNEL_PID=""
case "$TUNNEL" in
  cloudflared)
    command -v cloudflared >/dev/null || die "cloudflared not on PATH; install: brew install cloudflared (or set TUNNEL=ngrok / TUNNEL=none)"
    cloudflared tunnel --url "http://$HOST:$PORT" >"$RUN_DIR/tunnel.log" 2>&1 &
    TUNNEL_PID=$!
    echo "$TUNNEL_PID" >"$RUN_DIR/tunnel.pid"
    PUBLIC_URL=""
    for _ in $(seq 1 60); do
      PUBLIC_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$RUN_DIR/tunnel.log" | head -1 || true)"
      [ -n "$PUBLIC_URL" ] && break
      sleep 1
    done
    [ -n "$PUBLIC_URL" ] || { kill "$TUNNEL_PID" 2>/dev/null || true; die "no trycloudflare URL within 60 s; see $RUN_DIR/tunnel.log"; }
    PUBLIC_URL="$PUBLIC_URL/"
    ;;
  ngrok)
    command -v ngrok >/dev/null || die "ngrok not on PATH; install: brew install ngrok"
    ngrok http "http://$HOST:$PORT" --log stdout --log-format json >"$RUN_DIR/tunnel.log" 2>&1 &
    TUNNEL_PID=$!
    echo "$TUNNEL_PID" >"$RUN_DIR/tunnel.pid"
    PUBLIC_URL=""
    for _ in $(seq 1 60); do
      PUBLIC_URL="$(curl -fsS http://127.0.0.1:4040/api/tunnels 2>/dev/null | grep -oE 'https://[a-z0-9.-]+\.ngrok[a-z.-]*' | head -1 || true)"
      [ -n "$PUBLIC_URL" ] && break
      sleep 1
    done
    [ -n "$PUBLIC_URL" ] || { kill "$TUNNEL_PID" 2>/dev/null || true; die "no ngrok URL within 60 s; see $RUN_DIR/tunnel.log"; }
    PUBLIC_URL="$PUBLIC_URL/"
    ;;
  none)
    [ -n "${PUBLIC_URL:-}" ] || die "TUNNEL=none needs PUBLIC_URL=https://host/"
    ;;
  *) die "unknown TUNNEL=$TUNNEL (cloudflared | ngrok | none)" ;;
esac
case "$PUBLIC_URL" in */) ;; *) die "PUBLIC_URL must end in '/': $PUBLIC_URL" ;; esac
case "$PUBLIC_URL" in https://*) ;; *) echo "g0-up: warning: PUBLIC_URL is not https; the wallet requires an https response_uri" >&2 ;; esac

# 2. Verifier. Secrets travel only through the environment of the child.
(
  export PORT HOST PUBLIC_URL RUST_LOG RP_KEY_PATH RP_LEAF_PATH RELAY_PICKUP_ONCE RESULT_INCLUDES_PRESENTATION
  [ -n "${TRUST_ANCHOR_PATH:-}" ] && export TRUST_ANCHOR_PATH
  [ -n "${RESULT_TOKEN:-}" ] && export RESULT_TOKEN
  cd "$VERIFIER_DIR"
  exec "$VERIFIER_BIN" >"$RUN_DIR/verifier.log" 2>&1
) &
VERIFIER_PID=$!
echo "$VERIFIER_PID" >"$RUN_DIR/verifier.pid"

HEALTH_OK=""
for _ in $(seq 1 30); do
  if curl -fsS "http://$HOST:$PORT/health" >/dev/null 2>&1; then HEALTH_OK=1; break; fi
  if ! kill -0 "$VERIFIER_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [ -z "$HEALTH_OK" ]; then
  echo "g0-up: verifier did not answer /health; last log lines:" >&2
  tail -20 "$RUN_DIR/verifier.log" >&2 || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  kill "$VERIFIER_PID" 2>/dev/null || true
  exit 1
fi

# 3. Record the run (no secrets: paths and URLs only).
cat >"$RUN_DIR/env.sh" <<ENV
# Source this in the companion shell. Written by g0-up.sh, no secrets.
export G0_RUN_DIR="$RUN_DIR"
export PUBLIC_URL="$PUBLIC_URL"
export NACHWEIS_VERIFIER_URL="http://$HOST:$PORT"
export NACHWEIS_SESSION="$RUN_DIR/session.json"
export VERIFIER_DIR="$VERIFIER_DIR"
export RP_LEAF_PATH="$RP_LEAF_PATH"
ENV
{
  echo "started_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "verifier_commit=$(git -C "$VERIFIER_DIR" rev-parse HEAD 2>/dev/null || echo unverified)"
  echo "companion_commit=$(git -C "$REPO_DIR" rev-parse HEAD 2>/dev/null || echo unverified)"
  echo "tunnel=$TUNNEL"
  echo "public_url=$PUBLIC_URL"
  echo "relay_pickup_once=$RELAY_PICKUP_ONCE"
  echo "result_includes_presentation=$RESULT_INCLUDES_PRESENTATION"
  echo "trust_anchor_path=${TRUST_ANCHOR_PATH:-unset}"
  echo "result_token_set=$([ -n "${RESULT_TOKEN:-}" ] && echo yes || echo no)"
} >"$RUN_DIR/run.txt"

echo
echo "g0-up: verifier pid $VERIFIER_PID, tunnel pid ${TUNNEL_PID:-none}"
echo "g0-up: startup lines from the verifier (client_id must be the registrar one):"
grep -E 'public url|client_id|cert|issuer trust|status check|listening' "$RUN_DIR/verifier.log" | head -8 | sed 's/^/    /'
echo
echo "PUBLIC_URL=$PUBLIC_URL"
echo "G0_RUN_DIR=$RUN_DIR"
echo "next: source $RUN_DIR/env.sh   (then follow docs/g0-runbook.md, step 5)"
echo "stop: scripts/g0-down.sh $RUN_DIR"
