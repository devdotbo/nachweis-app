#!/usr/bin/env bash
# Local stack for the browser end-to-end run (app/e2e, Playwright). Starts everything the app
# needs and leaves it running; the test itself starts nothing.
#
#   anvil -> Deploy.s.sol (registry, FundToken, Subscription; operator = anvil key 0)
#   -> verifier-service from ../nachweis-verifier-relay -> nachweis-bridge (REQUIRE_ADDRESS_PROOF=true)
#   -> Vite dev server with VITE_MOCK unset, VITE_BRIDGE_URL, VITE_CHAIN_ID=31337, VITE_RPC_URL,
#      the deployed addresses, VITE_DEV_PRIVATE_KEY (anvil key 1, the investor) and
#      VITE_DEV_OPERATOR_KEY (anvil key 0, the issuer): the dev signer signs in the page.
#   -> .e2e/app/env.json with URLs, addresses, keys and file paths for the Playwright specs.
#
# Modes (--mode):
#   noir      default. verifier-service in blind-relay mode, bridge in local mode with a
#             NoirPidVerifier pinned to the companion's test issuer. The test feeds the "Prove on your
#             phone" handoff to `companion handoff … --stub-wallet` (app/e2e/noir-handoff.spec.ts).
#   browser   the same stack as noir; the test takes the "Prove in this browser" path: the tab creates
#             the relay request, `companion mint-test-presentation` answers it as the wallet, the tab
#             decrypts, proves with bb.js and posts the proof (app/e2e/browser-prover.spec.ts).
#   sp1-mock  bridge in verifier mode with PROOF_MODE=mock and a MockProofVerifier on the registry.
#             The test posts the presentation with scripts/e2e/wallet.ts (app/e2e/sp1-mock.spec.ts).
#
# Usage: scripts/app-e2e-local.sh [--mode noir|browser|sp1-mock] [--test] [--stop]
#   --test    run `bunx playwright test` in app/ against the stack, then stop it (exit code = test result)
#   --stop    stop a stack started earlier (pids in RUN_DIR/pids) and exit
# Env: VERIFIER_REPO (default ../nachweis-verifier-relay), RUN_DIR (default .e2e/app),
#      ANVIL_PORT, VERIFIER_PORT, BRIDGE_PORT, APP_PORT (default: free ports),
#      BRIDGE_ISSUER_TOKEN (default local-issuer-token), RESULT_TOKEN (default: random per run, never printed).
# A fresh checkout needs `bun install` in app/, companion/ and scripts/e2e/; the script runs it when
# node_modules is missing.
# Nothing touches a public chain: every transaction goes to the local anvil.
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFIER_REPO="${VERIFIER_REPO:-$(cd "$ROOT/.." && pwd)/nachweis-verifier-relay}"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/app}"
MODE=noir; TEST=0; STOP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --test) TEST=1; shift ;;
    --stop) STOP=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$MODE" in noir|browser|sp1-mock) ;; *) echo "unknown mode: $MODE (noir, browser, sp1-mock)" >&2; exit 2 ;; esac
# noir and browser share the stack (relay verifier, local bridge, NoirPidVerifier); only the prover differs.
NOIR_STACK=0; if [ "$MODE" = noir ] || [ "$MODE" = browser ]; then NOIR_STACK=1; fi

export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.foundry/bin:$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"
mkdir -p "$RUN_DIR"
PIDS="$RUN_DIR/pids"
stop_all() {
  [ -f "$PIDS" ] || return 0
  while read -r pid; do
    [ -n "$pid" ] || continue
    pkill -P "$pid" 2>/dev/null || true
    kill "$pid" 2>/dev/null || true
  done < "$PIDS"
  : > "$PIDS"
}
if [ $STOP -eq 1 ]; then stop_all; echo "stopped (pids from $PIDS)"; exit 0; fi

TOOLS="anvil forge cast bun jq curl python3 openssl"
[ "$MODE" = noir ] && TOOLS="$TOOLS nargo bb"
for tool in $TOOLS; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }; done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, operator, bridge key
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor's wallet
OPERATOR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
ISSUER_TOKEN="${BRIDGE_ISSUER_TOKEN:-local-issuer-token}"   # bearer token for the bridge's issuer routes (approve, revoke, attest-operator)
# Shared secret for the verifier's GET /result/:id (X-Result-Token): RESULT_TOKEN on the verifier,
# VERIFIER_RESULT_TOKEN on the bridge. Random per run, never printed. Only the sp1-mock stack reads
# results (verifier mode); the noir stack's relay path never calls /result.
RESULT_TOKEN="${RESULT_TOKEN:-$(openssl rand -hex 16)}"
free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
ANVIL_PORT="${ANVIL_PORT:-$(free_port)}"; VERIFIER_PORT="${VERIFIER_PORT:-$(free_port)}"
BRIDGE_PORT="${BRIDGE_PORT:-$(free_port)}"; APP_PORT="${APP_PORT:-$(free_port)}"
RPC="http://127.0.0.1:$ANVIL_PORT"
VERIFIER_URL="http://127.0.0.1:$VERIFIER_PORT"
BRIDGE_URL="http://127.0.0.1:$BRIDGE_PORT"
APP_URL="http://127.0.0.1:$APP_PORT"

T0=$(date +%s)
say() { echo "[$(( $(date +%s) - T0 ))s] $*"; }
die() { echo "FAIL: $*" >&2; stop_all; exit 1; }
wait_http() { # url, seconds
  for _ in $(seq 1 $(( $2 * 5 ))); do curl -fs "$1" >/dev/null 2>&1 && return 0; sleep 0.2; done
  return 1
}
stop_all
# Every non-zero exit names its reason: set -e alone would end the script silently (seen 2026-09-08,
# when the companion failed without node_modules and its stderr went to /dev/null).
trap 'echo "FAIL: exit $? at line $LINENO: $BASH_COMMAND" >&2' ERR
trap 'rc=$?; [ $rc -eq 0 ] || { stop_all; echo "exit $rc; logs in $RUN_DIR" >&2; }' EXIT
ensure_bun_deps() { # dir, marker package
  [ -d "$1/node_modules/$2" ] && return 0
  say "bun install in $1 (node_modules/$2 missing)"
  (cd "$1" && bun install --silent) || die "bun install failed in $1; run it by hand and retry"
}

# ------------------------------------------------------------------ 1. anvil
anvil --port "$ANVIL_PORT" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || die "anvil did not come up ($RUN_DIR/anvil.log)"
say "anvil on $RPC"

# ------------------------------------------------------------------ 2. contracts
DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$TOKEN" ] && [ -n "$SUBSCRIPTION" ] || die "could not parse the deploy output"
say "AttestationRegistry $REGISTRY, FundToken $TOKEN, Subscription $SUBSCRIPTION (operator $OPERATOR)"

NOIR_VERIFIER=""; ISSUER_JSON=""; ISSUER_KEY_PEM=""; ISSUER_CERT_PEM=""
if [ $NOIR_STACK -eq 1 ]; then
  ISSUER_JSON="$RUN_DIR/issuer.json"
  ensure_bun_deps "$ROOT/companion" qrcode
  ISSUER_OUT=$(cd "$ROOT/companion" && bun run src/cli.ts issuer-key "$ISSUER_JSON" 2>"$RUN_DIR/issuer-key.log") \
    || { tail -20 "$RUN_DIR/issuer-key.log"; die "companion issuer-key failed (see $RUN_DIR/issuer-key.log; bun install in companion/?)"; }
  ISSUER_HASH=$(echo "$ISSUER_OUT" | jq -r .issuer_key_hash)
  [ -n "$ISSUER_HASH" ] && [ "$ISSUER_HASH" != null ] || die "companion issuer-key printed no issuer_key_hash: $ISSUER_OUT"
  NOIR_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY REGISTRY_ADDRESS=$REGISTRY PID_ISSUER_KEY_HASH=$ISSUER_HASH \
    forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url "$RPC" --broadcast 2>&1) || { echo "$NOIR_OUT" | tail -20; die "DeployNoirVerifier.s.sol failed"; }
  NOIR_VERIFIER=$(echo "$NOIR_OUT" | awk '/NoirPidVerifier:/ {print $2}' | head -1)
  [ -n "$NOIR_VERIFIER" ] || die "no NoirPidVerifier address in the deploy output"
  say "NoirPidVerifier $NOIR_VERIFIER pinned to the companion issuer $ISSUER_HASH ($ISSUER_JSON)"
else
  # The fixture proof of PROOF_MODE=mock only passes a MockProofVerifier; the wallet stand-in mints
  # with a fresh issuer key per run (scripts/e2e/wallet.ts), the bridge takes the issuer key from x5c.
  ISSUER_KEY_PEM="$RUN_DIR/issuer.pk8.pem"; ISSUER_CERT_PEM="$RUN_DIR/issuer.crt.pem"
  openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$ISSUER_KEY_PEM" 2>/dev/null
  openssl req -x509 -new -key "$ISSUER_KEY_PEM" -days 365 -subj "/CN=Nachweis app e2e PID issuer (TEST ONLY)" -out "$ISSUER_CERT_PEM" 2>/dev/null
  MOCK_OUT=$(cd "$ROOT/contracts" && forge create src/test/MockProofVerifier.sol:MockProofVerifier --rpc-url "$RPC" --private-key "$K0" --broadcast --constructor-args true 2>&1) || { echo "$MOCK_OUT" | tail -5; die "MockProofVerifier deploy failed"; }
  MOCK_VERIFIER=$(echo "$MOCK_OUT" | awk '/Deployed to:/ {print $3}')
  cast send "$REGISTRY" "setVerifier(bytes32,address)" "$POLICY" "$MOCK_VERIFIER" --rpc-url "$RPC" --private-key "$K0" >/dev/null
  ensure_bun_deps "$ROOT/scripts/e2e" jose
  say "MockProofVerifier $MOCK_VERIFIER set for the policy; e2e issuer key $ISSUER_KEY_PEM"
fi

# ------------------------------------------------------------------ 3. verifier-service
# Always build: cargo is incremental, and a stale release binary silently runs old code (seen 2026-09-08).
[ -d "$VERIFIER_REPO" ] || die "verifier repo not found at $VERIFIER_REPO (set VERIFIER_REPO)"
VERIFIER_BIN="$VERIFIER_REPO/target/release/verifier-service"
(cd "$VERIFIER_REPO" && cargo build --release -p verifier-service >"$RUN_DIR/build-verifier.log" 2>&1) || die "verifier-service build failed, see $RUN_DIR/build-verifier.log"
# The bridge's verifier mode (sp1-mock) reads the raw presentation from /result, so that stack keeps
# it behind the token; the relay stack (noir) keeps the verifier's default, nothing plaintext.
VERIFIER_ENV=(PORT=$VERIFIER_PORT HOST=127.0.0.1 PUBLIC_URL="$VERIFIER_URL/" RESULT_TOKEN="$RESULT_TOKEN")
[ "$MODE" = sp1-mock ] && VERIFIER_ENV+=(RESULT_INCLUDES_PRESENTATION=true)
(cd "$VERIFIER_REPO" && exec env "${VERIFIER_ENV[@]}" "$VERIFIER_BIN" > "$RUN_DIR/verifier.log" 2>&1) & echo $! >> "$PIDS"
wait_http "$VERIFIER_URL/" 30 || die "verifier-service did not come up ($RUN_DIR/verifier.log)"
CLIENT_ID=$(grep -m1 'client_id' "$RUN_DIR/verifier.log" | awk '{print $NF}' || true)
say "verifier-service on $VERIFIER_URL (client_id ${CLIENT_ID:-?})"

# ------------------------------------------------------------------ 4. bridge
BRIDGE_BIN="$ROOT/service/target/release/nachweis-bridge"
(cd "$ROOT/service" && cargo build --release >"$RUN_DIR/build-bridge.log" 2>&1) || die "bridge build failed, see $RUN_DIR/build-bridge.log"
BRIDGE_ENV=(BIND="127.0.0.1:$BRIDGE_PORT" RPC_URL="$RPC" OPERATOR_PRIVATE_KEY=$K0 REGISTRY=$REGISTRY POLICY_ID=nachweis.pid.over18.v1
  REQUIRE_ADDRESS_PROOF=true BRIDGE_ISSUER_TOKEN="$ISSUER_TOKEN" RUST_LOG="${RUST_LOG:-info}")
if [ $NOIR_STACK -eq 1 ]; then
  BRIDGE_ENV+=(NOIR_VERIFIER=$NOIR_VERIFIER HANDOFF_VERIFIER_URL="$VERIFIER_URL" HANDOFF_BRIDGE_URL="$BRIDGE_URL")
else
  [ -n "$CLIENT_ID" ] || die "verifier-service did not print its client_id (needed as EXPECTED_AUD)"
  BRIDGE_ENV+=(VERIFIER_URL="$VERIFIER_URL" PROOF_MODE=mock PROVER_ARTIFACTS="$ROOT/prover-sp1/fixtures" EXPECTED_AUD="$CLIENT_ID"
    VERIFIER_RESULT_TOKEN="$RESULT_TOKEN")
fi
(cd "$ROOT/service" && exec env "${BRIDGE_ENV[@]}" "$BRIDGE_BIN" > "$RUN_DIR/bridge.log" 2>&1) & echo $! >> "$PIDS"
wait_http "$BRIDGE_URL/health" 30 || die "bridge did not come up ($RUN_DIR/bridge.log)"
say "bridge on $BRIDGE_URL, $(curl -s "$BRIDGE_URL/health" | jq -c '{mode,proof_mode}') ($(basename "$(dirname "$BRIDGE_BIN")") build)"

# ------------------------------------------------------------------ 5. the app (Vite dev server, dev signer)
ensure_bun_deps "$ROOT/app" vite
(cd "$ROOT/app" && exec env -u VITE_MOCK VITE_BRIDGE_URL="$BRIDGE_URL" VITE_VERIFIER_URL="$VERIFIER_URL" VITE_CHAIN_ID=31337 VITE_RPC_URL="$RPC" \
  VITE_REGISTRY="$REGISTRY" VITE_FUND_TOKEN="$TOKEN" VITE_SUBSCRIPTION="$SUBSCRIPTION" VITE_POLICY_ID="$POLICY" VITE_REQUIRED_BITS=3 \
  VITE_DEV_PRIVATE_KEY="$K1" VITE_DEV_OPERATOR_KEY="$K0" \
  node node_modules/vite/bin/vite.js --port "$APP_PORT" --strictPort --host 127.0.0.1 > "$RUN_DIR/app.log" 2>&1) & echo $! >> "$PIDS"
wait_http "$APP_URL/" 30 || die "vite did not come up ($RUN_DIR/app.log)"
say "app on $APP_URL (dev signer: investor $INVESTOR, operator $OPERATOR)"

# ------------------------------------------------------------------ 6. env for the specs
ENV_JSON="$RUN_DIR/env.json"
jq -n --arg mode "$MODE" --arg appUrl "$APP_URL" --arg rpcUrl "$RPC" --arg verifierUrl "$VERIFIER_URL" --arg bridgeUrl "$BRIDGE_URL" \
  --arg registry "$REGISTRY" --arg fundToken "$TOKEN" --arg subscription "$SUBSCRIPTION" --arg noirVerifier "$NOIR_VERIFIER" --arg policyId "$POLICY" \
  --arg investor "$INVESTOR" --arg operator "$OPERATOR" --arg issuerJson "$ISSUER_JSON" --arg issuerKeyPem "$ISSUER_KEY_PEM" --arg issuerCertPem "$ISSUER_CERT_PEM" \
  --arg companionDir "$ROOT/companion" --arg walletScript "$ROOT/scripts/e2e/wallet.ts" --arg runDir "$RUN_DIR" --arg issuerToken "$ISSUER_TOKEN" \
  '$ARGS.named' > "$ENV_JSON"
say "env for the specs: $ENV_JSON"

if [ $TEST -eq 1 ]; then
  set +e; trap - ERR
  (cd "$ROOT/app" && APP_E2E_ENV="$ENV_JSON" bunx playwright test)
  rc=$?
  set -e
  stop_all
  [ $rc -eq 0 ] && say "BROWSER E2E ($MODE) OK" || say "BROWSER E2E ($MODE) FAILED (exit $rc); logs in $RUN_DIR"
  exit $rc
fi
echo
echo "running: anvil $RPC, verifier $VERIFIER_URL, bridge $BRIDGE_URL, app $APP_URL (logs and pids in $RUN_DIR)"
echo "test:    cd app && APP_E2E_ENV=$ENV_JSON bunx playwright test"
echo "stop:    scripts/app-e2e-local.sh --stop"
