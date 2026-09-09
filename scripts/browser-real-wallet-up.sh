#!/usr/bin/env bash
#
# browser-real-wallet-up.sh: the local stack for the evidence run in which the official test wallet
# on the phone answers the WEB APP's own relay request ("Prove in this browser", docs/browser-real-wallet.md).
#
#   verifier-service (relay branch, relay mode, registrar leaf) behind a cloudflared quick tunnel,
#     exactly as scripts/g0-up.sh starts it (this script calls g0-up.sh with the run directory below)
#   -> anvil on a free port -> Deploy.s.sol (registry, FundToken, Subscription; operator = anvil key 0)
#   -> HonkVerifier + NoirPidVerifier pinned to PID_ISSUER_KEY_HASH (default: the sandbox PID issuer
#      from docs/evidence/g0-2026-09-08.md) -> EudiAllowlistChecker(registry, POLICY, 3)
#   -> nachweis-bridge in local mode, REQUIRE_ADDRESS_PROOF=true, a fresh BRIDGE_ISSUER_TOKEN
#   -> Vite dev server (COOP same-origin, COEP require-corp) with the dev signer: anvil key 1 as the
#      investor, key 0 as the operator (the issuer approves with registry.approve from the page)
#
# Hosts as the tab sees them: VITE_VERIFIER_URL is the LOCAL verifier, so POST /relay/request goes to
# 127.0.0.1. The verifier builds request_uri, status_url and pickup_url from PUBLIC_URL, so the tab
# fetches the request object, polls the status and picks up the JWE over the tunnel host, the same host
# the wallet uses. The bridge and anvil are local only. This script probes POST /relay/request once and
# refuses to continue if request_uri is not on the PUBLIC_URL host.
#
# Usage: scripts/browser-real-wallet-up.sh [--stub-issuer] [--pool]
#   --stub-issuer   pin NoirPidVerifier to a fresh companion test issuer (issuer.json in the run directory)
#                   instead of the sandbox issuer: the smoke test without a phone, where
#                   `companion mint-test-presentation` answers the tab's relay request.
#   --pool          door two as well: anvil forks Sepolia (SEPOLIA_RPC_URL, else publicnode; chain id stays
#                   31337) and scripts/pool-local.sh --attach onboards the Uniswap v4 permissioned pool on
#                   THIS stack's registry (real Uniswap bytecode at the published Sepolia addresses,
#                   docs/swap.md); the app gets VITE_POOL_ADAPTER and VITE_POOL_STABLE, env.json a `pool`
#                   object. Verifier, issuer pin and tunnel are unchanged; the same phone flow attests.
# Env (all optional):
#   PID_ISSUER_KEY_HASH  bytes32 pinned in NoirPidVerifier [sandbox PID issuer, see above]; ignored with --stub-issuer
#   G0_ENV               env.sh of a g0-up run whose verifier and tunnel are still up: reuse them instead of starting new ones
#   VERIFIER_PORT ANVIL_PORT BRIDGE_PORT APP_PORT   [free ports]
#   TUNNEL VERIFIER_DIR VERIFIER_BIN RP_KEY_PATH RP_LEAF_PATH   passed through to g0-up.sh
#   RUN_ROOT  [<repo>/docs/evidence/private/runs] (gitignored)   RUN_DIR  [RUN_ROOT/<timestamp>-browser]
#   BRIDGE_ISSUER_TOKEN  [fresh random; written to RUN_DIR/issuer-token (0600), never printed]
#   TUNNEL_WAIT_SECS     [180] how long to wait for the public hostname to answer /health
#   SEPOLIA_RPC_URL      [https://ethereum-sepolia-rpc.publicnode.com] read-only fork source with --pool
# Stop: scripts/browser-real-wallet-down.sh [RUN_DIR]
# Nothing touches a public chain: every transaction goes to the local anvil (with --pool: the local fork;
# Sepolia is only read). No secret is printed.
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_ROOT="${RUN_ROOT:-$ROOT/docs/evidence/private/runs}"
RUN_DIR="${RUN_DIR:-$RUN_ROOT/$(date +%Y%m%d-%H%M%S)-browser}"
SANDBOX_ISSUER_HASH=0xb4f2bfa1df99f06e588d39931b2cfd517a2befe8737c7f86bfa5c668d2abe079   # sha256 of the sandbox PID issuer's SEC1 key (G0 record, live)
STUB_ISSUER=0; POOL=0
while [ $# -gt 0 ]; do
  case "$1" in
    --stub-issuer) STUB_ISSUER=1; shift ;;
    --pool) POOL=1; shift ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.foundry/bin:$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast cargo bun jq curl openssl xxd python3; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, operator, bridge key
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor's wallet
OPERATOR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
REQUIRED_BITS=3
ISSUER_TOKEN="${BRIDGE_ISSUER_TOKEN:-$(openssl rand -hex 16)}"
free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
ANVIL_PORT="${ANVIL_PORT:-$(free_port)}"; BRIDGE_PORT="${BRIDGE_PORT:-$(free_port)}"; APP_PORT="${APP_PORT:-$(free_port)}"
RPC="http://127.0.0.1:$ANVIL_PORT"
BRIDGE_URL="http://127.0.0.1:$BRIDGE_PORT"
APP_URL="http://127.0.0.1:$APP_PORT"

mkdir -p "$RUN_DIR"; chmod 700 "$RUN_DIR"
T0=$(date +%s)
say() { echo "[$(( $(date +%s) - T0 ))s] $*"; }
stop_mine() { # only what this script started (named pid files); the verifier and tunnel are g0-down's
  local name pid
  for name in app bridge anvil; do
    [ -f "$RUN_DIR/$name.pid" ] || continue
    pid="$(cat "$RUN_DIR/$name.pid")"
    kill "$pid" 2>/dev/null || true
  done
}
die() { echo "FAIL: $*" >&2; exit 1; }
trap 'echo "FAIL: exit $? at line $LINENO: $BASH_COMMAND" >&2' ERR
trap 'rc=$?; [ $rc -eq 0 ] || { stop_mine; [ "${VERIFIER_REUSED:-yes}" = no ] && "$ROOT/scripts/g0-down.sh" "$RUN_DIR" >/dev/null 2>&1 || true; echo "exit $rc; logs in $RUN_DIR" >&2; }' EXIT
wait_http() { # url, seconds
  for _ in $(seq 1 $(( $2 * 5 ))); do curl -fs "$1" >/dev/null 2>&1 && return 0; sleep 0.2; done
  return 1
}
say "run directory $RUN_DIR"

# ------------------------------------------------------------------ 1. verifier in relay mode plus tunnel (g0-up.sh)
VERIFIER_REUSED=no
if [ -n "${G0_ENV:-}" ]; then
  [ -f "$G0_ENV" ] || die "G0_ENV=$G0_ENV does not exist"
  # shellcheck disable=SC1090
  source "$G0_ENV"
  VERIFIER_URL="${NACHWEIS_VERIFIER_URL:-}"
  [ -n "$VERIFIER_URL" ] && [ -n "${PUBLIC_URL:-}" ] || die "$G0_ENV carries no NACHWEIS_VERIFIER_URL and PUBLIC_URL"
  curl -fs "$VERIFIER_URL/health" >/dev/null 2>&1 || die "the verifier of $G0_ENV does not answer $VERIFIER_URL/health; start a new one (unset G0_ENV)"
  VERIFIER_REUSED=yes
  say "reusing the verifier at $VERIFIER_URL behind $PUBLIC_URL (from $G0_ENV)"
else
  VERIFIER_PORT="${VERIFIER_PORT:-$(free_port)}"
  VERIFIER_URL="http://127.0.0.1:$VERIFIER_PORT"
  say "starting the relay verifier on port $VERIFIER_PORT and the ${TUNNEL:-cloudflared} tunnel (scripts/g0-up.sh)"
  G0_RUN_DIR="$RUN_DIR" PORT="$VERIFIER_PORT" "$ROOT/scripts/g0-up.sh" > "$RUN_DIR/g0-up.out" 2>&1 \
    || { tail -15 "$RUN_DIR/g0-up.out" >&2; die "g0-up.sh failed (see $RUN_DIR/g0-up.out)"; }
  # shellcheck disable=SC1091
  source "$RUN_DIR/env.sh"
  VERIFIER_URL="$NACHWEIS_VERIFIER_URL"
  say "verifier on $VERIFIER_URL, public $PUBLIC_URL (client_id $(grep -m1 'client_id' "$RUN_DIR/verifier.log" | awk '{print $NF}' || echo '?'))"
fi
PUBLIC_BASE="${PUBLIC_URL%/}"

# The relay request the tab will make, probed once with a throwaway P-256 key and a random challenge:
# request_uri (what the wallet and the tab fetch) must be on the PUBLIC_URL host. The pending relay
# session this creates is never answered; the response's pickup token is not stored.
PUB_XY="$(openssl ecparam -name prime256v1 -genkey -noout 2>/dev/null | openssl ec -pubout -outform DER 2>/dev/null | tail -c 64 | xxd -p -c 64)"
b64url() { xxd -r -p | openssl base64 -A | tr '+/' '-_' | tr -d '='; }
PROBE_X="$(echo "${PUB_XY:0:64}" | b64url)"; PROBE_Y="$(echo "${PUB_XY:64:64}" | b64url)"
PROBE="$(curl -s -X POST -H 'content-type: application/json' \
  --data "{\"client_jwk\":{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"$PROBE_X\",\"y\":\"$PROBE_Y\",\"use\":\"enc\",\"alg\":\"ECDH-ES\"},\"bound_address\":\"$INVESTOR\",\"challenge\":\"0x$(openssl rand -hex 32)\"}" \
  "$VERIFIER_URL/relay/request" | jq -c '{request_uri, status_url, pickup_url}' 2>/dev/null || true)"
PROBE_REQUEST_URI="$(echo "$PROBE" | jq -r '.request_uri // empty')"
[ -n "$PROBE_REQUEST_URI" ] || die "POST $VERIFIER_URL/relay/request did not answer with a request_uri (verifier log: $RUN_DIR/verifier.log)"
case "$PROBE_REQUEST_URI" in
  "$PUBLIC_BASE"/*) say "relay probe: request_uri, status_url and pickup_url are on the public host ($(echo "$PROBE" | jq -r '.request_uri' | sed 's#/request/.*#/request/<id>#'))" ;;
  *) die "relay probe: request_uri $PROBE_REQUEST_URI is not under $PUBLIC_URL; the wallet could not fetch it" ;;
esac

# ------------------------------------------------------------------ 2. anvil (with --pool: a fork of Sepolia, as app-e2e-local.sh --pool)
ANVIL_ARGS=(--port "$ANVIL_PORT" --silent); ANVIL_WAIT=50
if [ $POOL -eq 1 ]; then
  FORK_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
  ANVIL_ARGS+=(--fork-url "$FORK_URL" --chain-id 31337 --retries 5 --timeout 30000); ANVIL_WAIT=450
fi
anvil "${ANVIL_ARGS[@]}" > "$RUN_DIR/anvil.log" 2>&1 & echo $! > "$RUN_DIR/anvil.pid"
for _ in $(seq 1 $ANVIL_WAIT); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || die "anvil did not come up ($RUN_DIR/anvil.log)"
if [ $POOL -eq 1 ]; then say "anvil on $RPC, chain 31337, forking $FORK_URL at block $(cast block-number --rpc-url "$RPC")"; else say "anvil on $RPC"; fi

# ------------------------------------------------------------------ 3. contracts
DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$TOKEN" ] && [ -n "$SUBSCRIPTION" ] || die "could not parse the Deploy.s.sol output"
say "AttestationRegistry $REGISTRY, FundToken $TOKEN, Subscription $SUBSCRIPTION (operator $OPERATOR)"
POOL_ENV=(); POOL_JSON='null'
if [ $POOL -eq 1 ]; then
  # Checker, adapter, pool and liquidity on this registry; the probe (anvil key 2) swaps once and is
  # refused once revoked. The investor (key 1) is left untouched for the phone flow.
  "$ROOT/scripts/pool-local.sh" --attach "$RPC" --registry "$REGISTRY" --fund-token "$TOKEN" --subscription "$SUBSCRIPTION" --out "$RUN_DIR/pool" > "$RUN_DIR/pool.log" 2>&1 \
    || { tail -20 "$RUN_DIR/pool.log"; die "pool-local.sh failed (see $RUN_DIR/pool.log)"; }
  while read -r line; do [ -n "$line" ] && POOL_ENV+=("$line"); done < "$RUN_DIR/pool/pool.env"; POOL_JSON=$(cat "$RUN_DIR/pool/pool.json")
  say "permissioned pool on the fork: adapter $(jq -r .adapter <<< "$POOL_JSON"), mUSD $(jq -r .stable <<< "$POOL_JSON"), checker $(jq -r .checker <<< "$POOL_JSON") reads $REGISTRY ($(tail -1 "$RUN_DIR/pool.log"))"
fi

ISSUER_JSON=""
if [ $STUB_ISSUER -eq 1 ]; then
  ISSUER_JSON="$RUN_DIR/issuer.json"
  [ -d "$ROOT/companion/node_modules/qrcode" ] || (cd "$ROOT/companion" && bun install --silent) || die "bun install failed in companion/"
  ISSUER_OUT=$(cd "$ROOT/companion" && bun run src/cli.ts issuer-key "$ISSUER_JSON" 2>"$RUN_DIR/issuer-key.log") || { tail -10 "$RUN_DIR/issuer-key.log"; die "companion issuer-key failed"; }
  ISSUER_HASH=$(echo "$ISSUER_OUT" | jq -r .issuer_key_hash)
  [ -n "$ISSUER_HASH" ] && [ "$ISSUER_HASH" != null ] || die "companion issuer-key printed no issuer_key_hash"
  ISSUER_LABEL="companion test issuer (stub wallet, fixture)"
else
  ISSUER_HASH="${PID_ISSUER_KEY_HASH:-$SANDBOX_ISSUER_HASH}"
  [[ "$ISSUER_HASH" =~ ^0x[0-9a-fA-F]{64}$ ]] || die "PID_ISSUER_KEY_HASH must be a 0x-prefixed bytes32: $ISSUER_HASH"
  if [ "$ISSUER_HASH" = "$SANDBOX_ISSUER_HASH" ]; then ISSUER_LABEL="sandbox PID issuer (live, G0 record)"; else ISSUER_LABEL="PID_ISSUER_KEY_HASH from the environment"; fi
fi
NOIR_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY REGISTRY_ADDRESS=$REGISTRY PID_ISSUER_KEY_HASH=$ISSUER_HASH \
  forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url "$RPC" --broadcast 2>&1) || { echo "$NOIR_OUT" | tail -20; die "DeployNoirVerifier.s.sol failed"; }
NOIR_VERIFIER=$(echo "$NOIR_OUT" | awk '/NoirPidVerifier:/ {print $2}' | head -1)
[ -n "$NOIR_VERIFIER" ] || die "no NoirPidVerifier address in the deploy output"
CHECKER_OUT=$(cd "$ROOT/contracts" && forge create src/uniswap/EudiAllowlistChecker.sol:EudiAllowlistChecker --rpc-url "$RPC" --private-key $K0 --broadcast \
  --constructor-args "$REGISTRY" "$POLICY" $REQUIRED_BITS 2>&1) || { echo "$CHECKER_OUT" | tail -10; die "EudiAllowlistChecker deploy failed"; }
CHECKER=$(echo "$CHECKER_OUT" | awk '/Deployed to:/ {print $3}' | head -1)
[ -n "$CHECKER" ] || die "no checker address in the forge create output"
say "NoirPidVerifier $NOIR_VERIFIER pinned to $ISSUER_HASH ($ISSUER_LABEL); EudiAllowlistChecker $CHECKER"

# ------------------------------------------------------------------ 4. bridge, local mode
BRIDGE_BIN="$ROOT/service/target/release/nachweis-bridge"
(cd "$ROOT/service" && cargo build --release >"$RUN_DIR/build-bridge.log" 2>&1) || die "bridge build failed, see $RUN_DIR/build-bridge.log"
umask 077; printf '%s\n' "$ISSUER_TOKEN" > "$RUN_DIR/issuer-token"; umask 022
# HANDOFF_VERIFIER_URL stays local: the tab takes the relay base from the session's handoff when the
# bridge carries one (app/src/lib/browserProver.ts), and this run wants POST /relay/request on 127.0.0.1.
(cd "$ROOT/service" && exec env BIND="127.0.0.1:$BRIDGE_PORT" RPC_URL="$RPC" OPERATOR_PRIVATE_KEY=$K0 REGISTRY=$REGISTRY NOIR_VERIFIER=$NOIR_VERIFIER \
  POLICY_ID=nachweis.pid.over18.v1 REQUIRE_ADDRESS_PROOF=true BRIDGE_ISSUER_TOKEN="$ISSUER_TOKEN" RUST_LOG="${RUST_LOG:-info}" \
  HANDOFF_VERIFIER_URL="$VERIFIER_URL" HANDOFF_BRIDGE_URL="$BRIDGE_URL" \
  "$BRIDGE_BIN" > "$RUN_DIR/bridge.log" 2>&1) & echo $! > "$RUN_DIR/bridge.pid"
wait_http "$BRIDGE_URL/health" 30 || die "bridge did not come up ($RUN_DIR/bridge.log)"
say "bridge on $BRIDGE_URL, $(curl -s "$BRIDGE_URL/health" | jq -c '{mode,proof_mode}') (local mode, REQUIRE_ADDRESS_PROOF=true, fresh issuer token in $RUN_DIR/issuer-token)"

# ------------------------------------------------------------------ 5. the app: Vite dev server (COOP and COEP from vite.config.ts), dev signer
[ -d "$ROOT/app/node_modules/vite" ] || (cd "$ROOT/app" && bun install --silent) || die "bun install failed in app/"
(cd "$ROOT/app" && exec env -u VITE_MOCK VITE_BRIDGE_URL="$BRIDGE_URL" VITE_VERIFIER_URL="$VERIFIER_URL" VITE_CHAIN_ID=31337 VITE_RPC_URL="$RPC" \
  VITE_REGISTRY="$REGISTRY" VITE_FUND_TOKEN="$TOKEN" VITE_SUBSCRIPTION="$SUBSCRIPTION" VITE_POLICY_ID="$POLICY" VITE_REQUIRED_BITS=$REQUIRED_BITS \
  VITE_DEV_PRIVATE_KEY="$K1" VITE_DEV_OPERATOR_KEY="$K0" "${POOL_ENV[@]}" \
  node node_modules/vite/bin/vite.js --port "$APP_PORT" --strictPort --host 127.0.0.1 > "$RUN_DIR/app.log" 2>&1) & echo $! > "$RUN_DIR/app.pid"
wait_http "$APP_URL/" 30 || die "vite did not come up ($RUN_DIR/app.log)"
COOP=$(curl -sI "$APP_URL/" | grep -i '^cross-origin-opener-policy' | tr -d '\r' | awk '{print $2}')
COEP=$(curl -sI "$APP_URL/" | grep -i '^cross-origin-embedder-policy' | tr -d '\r' | awk '{print $2}')
[ "$COOP" = same-origin ] && [ "$COEP" = require-corp ] || die "the app does not send COOP same-origin and COEP require-corp (got '$COOP', '$COEP'); bb.js would prove single-threaded"
say "app on $APP_URL (COOP $COOP, COEP $COEP; dev signer: investor $INVESTOR, operator $OPERATOR$([ $POOL -eq 1 ] && echo '; Swap door on'))"

# The tab fetches the request object over the tunnel host right after POST /relay/request, so the
# public hostname must resolve before the first click. A quick tunnel's DNS takes one to two minutes
# (seen 2026-09-08: registered at once, not reachable after 30 s); the wait runs after the builds.
TUNNEL_WAIT_SECS="${TUNNEL_WAIT_SECS:-180}"
say "waiting for the tunnel: GET ${PUBLIC_URL}health (up to $TUNNEL_WAIT_SECS s)"
wait_http "${PUBLIC_URL}health" "$TUNNEL_WAIT_SECS" || die "${PUBLIC_URL}health did not answer within $TUNNEL_WAIT_SECS s (tunnel log: $RUN_DIR/tunnel.log); the wallet and the tab need it"
say "tunnel answers: GET ${PUBLIC_URL}health"

# ------------------------------------------------------------------ 6. record (no secrets) and the env for the Playwright spec
ENV_JSON="$RUN_DIR/env.json"
jq -n --arg mode browser --arg appUrl "$APP_URL" --arg rpcUrl "$RPC" --arg verifierUrl "$VERIFIER_URL" --arg verifierPublicUrl "$PUBLIC_BASE" --arg bridgeUrl "$BRIDGE_URL" \
  --arg registry "$REGISTRY" --arg fundToken "$TOKEN" --arg subscription "$SUBSCRIPTION" --arg noirVerifier "$NOIR_VERIFIER" --arg checker "$CHECKER" --arg policyId "$POLICY" \
  --arg investor "$INVESTOR" --arg operator "$OPERATOR" --arg issuerJson "$ISSUER_JSON" --arg issuerKeyPem "" --arg issuerCertPem "" \
  --arg companionDir "$ROOT/companion" --arg walletScript "$ROOT/scripts/e2e/wallet.ts" --arg runDir "$RUN_DIR" \
  --argjson pool "$POOL_JSON" '$ARGS.named' > "$ENV_JSON"
{
  echo "browser_run=1"
  echo "app_commit=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || echo unverified)"
  echo "verifier_reused=$VERIFIER_REUSED"
  echo "verifier_url=$VERIFIER_URL"
  echo "public_url=$PUBLIC_URL"
  echo "rpc=$RPC"
  echo "bridge_url=$BRIDGE_URL"
  echo "app_url=$APP_URL"
  echo "registry=$REGISTRY"
  echo "fund_token=$TOKEN"
  echo "subscription=$SUBSCRIPTION"
  echo "noir_verifier=$NOIR_VERIFIER"
  echo "checker=$CHECKER"
  echo "issuer_key_hash=$ISSUER_HASH ($ISSUER_LABEL)"
  echo "investor=$INVESTOR"
  echo "operator=$OPERATOR"
  if [ $POOL -eq 1 ]; then
    echo "pool=1 (fork of $FORK_URL at block $(jq -r .forkBlock <<< "$POOL_JSON"))"
    echo "pool_adapter=$(jq -r .adapter <<< "$POOL_JSON")"
    echo "pool_stable=$(jq -r .stable <<< "$POOL_JSON")"
    echo "pool_checker=$(jq -r .checker <<< "$POOL_JSON")"
    echo "pool_id=$(jq -r .poolId <<< "$POOL_JSON")"
  fi
} >> "$RUN_DIR/run.txt"
cat >> "$RUN_DIR/env.sh" <<ENV
# Added by browser-real-wallet-up.sh (no secrets).
export BROWSER_RUN_DIR="$RUN_DIR"
export APP_URL="$APP_URL"
export BRIDGE_URL="$BRIDGE_URL"
export RPC_URL="$RPC"
export REGISTRY="$REGISTRY"
export FUND_TOKEN="$TOKEN"
export SUBSCRIPTION="$SUBSCRIPTION"
export NOIR_VERIFIER="$NOIR_VERIFIER"
export CHECKER="$CHECKER"
export APP_E2E_ENV="$ENV_JSON"
ENV
if [ $POOL -eq 1 ]; then
  { echo "export POOL_JSON=\"$RUN_DIR/pool/pool.json\""; sed 's/^VITE_/export VITE_/' "$RUN_DIR/pool/pool.env"; } >> "$RUN_DIR/env.sh"
fi

cat <<SUMMARY

BROWSER-REAL-WALLET UP ($(( $(date +%s) - T0 )) s)
  app (open in Chrome on this Mac):  $APP_URL
  public tunnel (the wallet's host):  $PUBLIC_URL
  verifier (the tab's relay host):    $VERIFIER_URL
  bridge / anvil:                     $BRIDGE_URL / $RPC
  NoirPidVerifier pinned to:          $ISSUER_HASH ($ISSUER_LABEL)
  run directory (gitignored):         $RUN_DIR
$([ $POOL -eq 1 ] && printf '  permissioned pool (fork):           adapter %s, mUSD %s, pool.json %s\n' "$(jq -r .adapter <<< "$POOL_JSON")" "$(jq -r .stable <<< "$POOL_JSON")" "$RUN_DIR/pool/pool.json")
Click sequence (docs/browser-real-wallet.md):
  1. Investor: "Connect dev signer" (investor $INVESTOR); Eligibility shows "not permitted".
  2. "Present your ID": "Create presentation request"; the dev signer signs nachweis:session:<id>; "signed, sent to bridge".
  3. "Prove in this browser" is the selected path; click its start button; the wallet QR appears.
  4. Phone: open the official test wallet, scan the QR, consent, present. The tab shows relay status responded,
     then pickup, checking, witness, init, proving, verifying, submitting, submitted (about 30 s); "attested from this browser".
  5. Header: "Issuer"; Presentations: "Approve" on the session (operator dev key); status "approved".
  6. Header: "Investor"; Eligibility "permitted"; "Two doors, one decision": "Subscribe"; "tx confirmed", FundToken balance rises.
$([ $POOL -eq 1 ] && cat <<'POOLSEQ'
  7. Same card, door two: "Swap" (mint mUSD from the faucet if the balance is 0; Permit2 signature, then the swap);
     "Swapped in the permissioned pool", NDF received through the real Uniswap v4 hook on the fork.
  8. Header: "Issuer"; Revoke the investor. Header: "Investor": Subscribe reverts NotEligible, Swap is
     "Refused by PermissionedHooks.beforeSwap". One revoke, two doors closed.
POOLSEQ
)
Record (sanitized) from the card's log line and dl: timings, proof bytes, tx hash; statusOf:
  cast call --rpc-url $RPC $REGISTRY "statusOf(address,bytes32)(bool,bool,bool,uint64)" $INVESTOR $POLICY
Smoke test without the phone (stack started with --stub-issuer):
  cd app && APP_E2E_ENV=$ENV_JSON bunx playwright test e2e/browser-prover.spec.ts
$([ $POOL -eq 1 ] && printf 'Swap door without the phone (attests the investor by operator, swaps, revokes, refused):\n  cd app && APP_E2E_ENV=%s bunx playwright test e2e/swap.spec.ts\n' "$ENV_JSON")
Stop: scripts/browser-real-wallet-down.sh $RUN_DIR
SUMMARY
