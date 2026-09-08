#!/usr/bin/env bash
# Local end-to-end run of the Nachweis pipeline without a phone.
#
#   anvil (fork of Sepolia, so the REAL SP1VerifierGateway is on the chain)
#   -> registry, fund token, subscription, Sp1PidVerifier (or MockProofVerifier in mock mode)
#   -> verifier-service in bridge mode (POST /request, GET /result/:id), PUBLIC_URL http://127.0.0.1
#   -> nachweis-bridge in verifier mode with PROOF_MODE from --mode
#   -> a synthetic wallet (scripts/e2e/wallet.ts) mints a fresh SD-JWT PID presentation for the
#      session nonce and posts it encrypted, like the sandbox wallet does
#   -> bridge: native statement, proof, attestWithProof against the fork (evidence only)
#   -> cast: isEligible false and subscribe reverts before the issuer approves; POST /sessions/:id/approve
#      with the issuer token; subscribe as the investor, balance > 0, isEligible true; revoke via the
#      bridge; subscribe reverts NotEligible, isEligible false
#
# Usage: scripts/e2e-local.sh [--mode mock|execute|groth16] [--keep] [--fork-url URL]
#   --mode     mock (fixture proof, MockProofVerifier), execute (guest run, no proof: attestation
#              via the operator fallback), groth16 (real proof, real gateway on the fork; ~5 min)
#   --keep     leave anvil, verifier and bridge running afterwards (URLs and pids are printed)
#   --fork-url upstream Sepolia RPC for anvil (default https://ethereum-sepolia-rpc.publicnode.com)
# Env: VERIFIER_REPO (default ../nachweis-verifier-relay next to this repo), E2E_RUN_DIR (default .e2e),
#      BRIDGE_ISSUER_TOKEN (default local-issuer-token), RESULT_TOKEN (default: random per run, never printed)
#
# Nothing is broadcast to Sepolia: every transaction goes to the local anvil URL.
# Idempotent: a previous run's processes (from .e2e/pids) are stopped first, everything is redeployed.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFIER_REPO="${VERIFIER_REPO:-$(cd "$ROOT/.." && pwd)/nachweis-verifier-relay}"
RUN_DIR="${E2E_RUN_DIR:-$ROOT/.e2e}"
FORK_URL="https://ethereum-sepolia-rpc.publicnode.com"
MODE="mock"
KEEP=0

while [ $# -gt 0 ]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --mode=*) MODE="${1#--mode=}"; shift ;;
    --keep) KEEP=1; shift ;;
    --fork-url) FORK_URL="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$MODE" in mock|execute|groth16) ;; *) echo "--mode must be mock, execute or groth16" >&2; exit 2 ;; esac

export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast cargo bun openssl jq curl python3; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

# anvil's deterministic accounts: 0 deploys and operates (the bridge's key), 1 is the investor.
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
INVESTOR_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
ISSUER_TOKEN="${BRIDGE_ISSUER_TOKEN:-local-issuer-token}"   # bearer token for the bridge's issuer routes (approve, revoke, attest-operator)
# Shared secret for the verifier's GET /result/:id (X-Result-Token). The verifier serves the raw
# presentation only behind it and answers 503 with RESULT_INCLUDES_PRESENTATION on and no token;
# one random value per run, passed as RESULT_TOKEN to the verifier and VERIFIER_RESULT_TOKEN to
# the bridge, never printed. RESULT_TOKEN in the environment overrides it.
RESULT_TOKEN="${RESULT_TOKEN:-$(openssl rand -hex 16)}"
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
POLICY_ID=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f  # keccak256("nachweis.pid.over18.v1")
REQUIRED_BITS=3
SP1_GATEWAY=0x397A5f7f3dBd538f23DE225B51f532c34448dA9B  # Sepolia SP1VerifierGateway, present on the fork

BRIDGE_BIN="$ROOT/service/target/release/nachweis-bridge"
GUEST_ELF="$ROOT/prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program"
VERIFIER_BIN="$VERIFIER_REPO/target/release/verifier-service"

mkdir -p "$RUN_DIR"
PIDFILE="$RUN_DIR/pids"
T0=$(python3 -c 'import time;print(time.time())')
TIMELINE=()

now_ts() { python3 -c 'import datetime;print(datetime.datetime.now().strftime("%H:%M:%S.%f")[:-3])'; }
elapsed() { python3 -c "import time;print('%7.2f' % (time.time()-$T0))"; }
mark() { # mark <label> [detail]
  local line
  line="$(printf '%s  +%ss  %-28s %s' "$(now_ts)" "$(elapsed)" "$1" "${2:-}")"
  TIMELINE+=("$line")
  echo "$line"
}
die() { echo "FAIL: $*" >&2; exit 1; }
free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
wait_http() { # wait_http <url> <seconds> <accept regex on status code>
  local i; for i in $(seq 1 "$2"); do
    if curl -s -o /dev/null -w '%{http_code}' "$1" 2>/dev/null | grep -qE "$3"; then return 0; fi; sleep 1
  done; return 1
}

stop_previous() {
  [ -f "$PIDFILE" ] || return 0
  while read -r pid name; do
    [ -n "$pid" ] || continue
    if ps -p "$pid" -o comm= 2>/dev/null | grep -q "$name"; then kill "$pid" 2>/dev/null || true; fi
  done < "$PIDFILE"
  : > "$PIDFILE"
}
cleanup() {
  local rc=$?
  if [ "$KEEP" = 1 ]; then
    echo; echo "kept running (stop with: kill \$(cut -d' ' -f1 $PIDFILE)):"
    echo "  anvil    $RPC_URL"; echo "  verifier $VERIFIER_URL"; echo "  bridge   $BRIDGE_URL"
    echo "  registry $REGISTRY  token $TOKEN  subscription $SUBSCRIPTION  verifier contract $VERIFIER_CONTRACT"
  else
    stop_previous
  fi
  [ $rc -eq 0 ] || echo "exit $rc; logs in $RUN_DIR (anvil.log, verifier.log, bridge.log)" >&2
}
trap cleanup EXIT

stop_previous
RPC_URL=""; VERIFIER_URL=""; BRIDGE_URL=""; REGISTRY=""; TOKEN=""; SUBSCRIPTION=""; VERIFIER_CONTRACT=""

# ---------------------------------------------------------------- builds
# The bridge and the verifier are always built: cargo is incremental, so an up-to-date binary costs
# a second, and a stale release binary silently runs yesterday's code (seen 2026-09-08 after WP16).
# The guest ELF and the contracts are built only when missing (slow, and rarely touched).
[ -d "$VERIFIER_REPO" ] || die "verifier repo not found at $VERIFIER_REPO (set VERIFIER_REPO)"
mark build "verifier-service (cargo build --release)"
(cd "$VERIFIER_REPO" && cargo build --release -p verifier-service >"$RUN_DIR/build-verifier.log" 2>&1) || die "verifier build failed, see $RUN_DIR/build-verifier.log"
if [ ! -f "$GUEST_ELF" ]; then
  command -v cargo-prove >/dev/null || die "cargo-prove missing (sp1up), cannot build the guest ELF"
  mark build "guest ELF (cargo prove build)"
  (cd "$ROOT/prover-sp1/program" && cargo prove build >"$RUN_DIR/build-elf.log" 2>&1) || die "guest build failed, see $RUN_DIR/build-elf.log"
fi
mark build "bridge (cargo build --release)"
(cd "$ROOT/service" && cargo build --release >"$RUN_DIR/build-bridge.log" 2>&1) || die "bridge build failed, see $RUN_DIR/build-bridge.log"
if [ ! -d "$ROOT/contracts/out" ]; then
  mark build "contracts (forge build)"
  (cd "$ROOT/contracts" && forge build >"$RUN_DIR/build-forge.log" 2>&1) || die "forge build failed, see $RUN_DIR/build-forge.log"
fi
[ -d "$ROOT/scripts/e2e/node_modules/jose" ] || (cd "$ROOT/scripts/e2e" && bun install --silent) || die "bun install failed in scripts/e2e"

# ---------------------------------------------------------------- issuer key of this run
# The synthetic wallet mints with a fresh issuer key per run; Sp1PidVerifier pins sha256 of that
# key (SEC1 uncompressed), so the hash is computed here and passed as PID_ISSUER_KEY_HASH. A run
# against the sandbox issuer would pin the sandbox anchor (the deploy script's default) instead.
ISSUER_KEY="$RUN_DIR/issuer.pk8.pem"
ISSUER_CERT="$RUN_DIR/issuer.crt.pem"
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out "$ISSUER_KEY" 2>/dev/null
openssl req -x509 -new -key "$ISSUER_KEY" -days 365 -subj "/CN=Nachweis e2e PID issuer (TEST ONLY)" -out "$ISSUER_CERT" 2>/dev/null
openssl pkey -in "$ISSUER_KEY" -pubout -outform DER 2>/dev/null | tail -c 65 > "$RUN_DIR/issuer.sec1"
[ "$(head -c 1 "$RUN_DIR/issuer.sec1" | xxd -p)" = "04" ] || die "issuer public key is not an uncompressed P-256 point"
ISSUER_KEY_HASH="0x$(openssl dgst -sha256 -hex < "$RUN_DIR/issuer.sec1" | awk '{print $NF}')"
mark issuer-key "sha256(SEC1) = $ISSUER_KEY_HASH"

# ---------------------------------------------------------------- anvil, forked from Sepolia
ANVIL_PORT=$(free_port); VPORT=$(free_port); BPORT=$(free_port)
RPC_URL="http://127.0.0.1:$ANVIL_PORT"
VERIFIER_URL="http://127.0.0.1:$VPORT"
BRIDGE_URL="http://127.0.0.1:$BPORT"

anvil --fork-url "$FORK_URL" --port "$ANVIL_PORT" --host 127.0.0.1 --retries 5 --timeout 30000 >"$RUN_DIR/anvil.log" 2>&1 &
echo "$! anvil" >> "$PIDFILE"
for i in $(seq 1 90); do cast chain-id --rpc-url "$RPC_URL" >/dev/null 2>&1 && break; sleep 1; done
CHAIN_ID=$(cast chain-id --rpc-url "$RPC_URL" 2>/dev/null) || die "anvil did not come up (fork of $FORK_URL), see $RUN_DIR/anvil.log"
FORK_BLOCK=$(cast block-number --rpc-url "$RPC_URL")
GATEWAY_CODE=$(cast code "$SP1_GATEWAY" --rpc-url "$RPC_URL")
[ "${#GATEWAY_CODE}" -gt 10 ] || die "no code at the SP1 gateway $SP1_GATEWAY on the fork"
mark anvil "chain $CHAIN_ID at block $FORK_BLOCK, gateway code $(( (${#GATEWAY_CODE} - 2) / 2 )) bytes, $RPC_URL"

# ---------------------------------------------------------------- deploy (broadcast to anvil only)
cd "$ROOT/contracts"
DEPLOY_OUT=$(DEPLOYER_PRIVATE_KEY=$DEPLOYER_KEY OPERATOR_ADDRESS=$DEPLOYER POLICY_ID=$POLICY_ID REQUIRED_BITS=$REQUIRED_BITS \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC_URL" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$TOKEN" ] && [ -n "$SUBSCRIPTION" ] || { echo "$DEPLOY_OUT" | tail -20; die "could not parse deploy addresses"; }
mark deploy "registry $REGISTRY token $TOKEN subscription $SUBSCRIPTION"

if [ "$MODE" = mock ]; then
  # The fixture proof only passes a MockProofVerifier; the SP1 adapter would send it to the gateway.
  MOCK_OUT=$(forge create src/test/MockProofVerifier.sol:MockProofVerifier --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --broadcast --constructor-args true 2>&1) || { echo "$MOCK_OUT" | tail -5; die "MockProofVerifier deploy failed"; }
  VERIFIER_CONTRACT=$(echo "$MOCK_OUT" | awk '/Deployed to:/ {print $3}')
  cast send "$REGISTRY" "setVerifier(bytes32,address)" "$POLICY_ID" "$VERIFIER_CONTRACT" --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" >/dev/null
  mark verifier-contract "MockProofVerifier $VERIFIER_CONTRACT (mock mode)"
else
  SP1_OUT=$(DEPLOYER_PRIVATE_KEY=$DEPLOYER_KEY REGISTRY_ADDRESS=$REGISTRY POLICY_ID=$POLICY_ID PID_ISSUER_KEY_HASH=$ISSUER_KEY_HASH SP1_GATEWAY=$SP1_GATEWAY \
    forge script script/DeploySp1Verifier.s.sol:DeploySp1Verifier --rpc-url "$RPC_URL" --broadcast 2>&1) || { echo "$SP1_OUT" | tail -20; die "DeploySp1Verifier.s.sol failed"; }
  VERIFIER_CONTRACT=$(echo "$SP1_OUT" | awk '/Sp1PidVerifier:/ {print $2}' | head -1)
  [ -n "$VERIFIER_CONTRACT" ] || { echo "$SP1_OUT" | tail -20; die "could not parse Sp1PidVerifier address"; }
  VKEY=$(echo "$SP1_OUT" | awk '/programVKey:/ {getline; print $1}' | head -1)
  mark verifier-contract "Sp1PidVerifier $VERIFIER_CONTRACT gateway $SP1_GATEWAY vkey $VKEY"
fi
cd "$ROOT"

# ---------------------------------------------------------------- verifier-service, bridge mode
# PUBLIC_URL is plain http on loopback: the HTTPS requirement is the wallet's (the phone refuses a
# non-https response_uri), the service itself only uses PUBLIC_URL to build request_uri/response_uri,
# and our synthetic wallet posts directly. No RP key (ephemeral cert) and no TRUST_ANCHOR_PATH: the
# e2e issuer is self-signed, so issuer trust is not enforced here; Sp1PidVerifier pins its key hash.
# The binaries run as copies under run-specific names ($RUN_DIR/bin/e2e-*): the machine is shared
# with other sessions, and a foreign `pkill nachweis-bridge` during the 5 minute proof would end the run.
mkdir -p "$RUN_DIR/bin"
cp -f "$VERIFIER_BIN" "$RUN_DIR/bin/e2e-verifier-service"
cp -f "$BRIDGE_BIN" "$RUN_DIR/bin/e2e-nachweis-bridge"
(cd "$VERIFIER_REPO" && exec env PORT=$VPORT HOST=127.0.0.1 PUBLIC_URL="$VERIFIER_URL/" RESULT_INCLUDES_PRESENTATION=true \
  RESULT_TOKEN="$RESULT_TOKEN" "$RUN_DIR/bin/e2e-verifier-service") >"$RUN_DIR/verifier.log" 2>&1 &
echo "$! e2e-verifier-service" >> "$PIDFILE"
wait_http "$VERIFIER_URL/" 30 '^200$' || die "verifier-service did not come up, see $RUN_DIR/verifier.log"
CLIENT_ID=$(grep -m1 'client_id' "$RUN_DIR/verifier.log" | awk '{print $NF}')
[ -n "$CLIENT_ID" ] || die "verifier-service did not print its client_id"
mark verifier-service "$VERIFIER_URL client_id $CLIENT_ID"

# ---------------------------------------------------------------- bridge, verifier mode
# EXPECTED_AUD must be the verifier's client_id (the KB-JWT aud), which is derived from the
# ephemeral certificate and therefore read from the verifier's startup log. The issuer key comes
# from the x5c leaf (ISSUER_KEY_SEC1_HEX unset), KB_JWT_WINDOW_SECS stays at the default 600.
BRIDGE_ENV=(BIND="127.0.0.1:$BPORT" RPC_URL="$RPC_URL" OPERATOR_PRIVATE_KEY="$DEPLOYER_KEY" REGISTRY="$REGISTRY" POLICY_ID="$POLICY_ID"
  VERIFIER_URL="$VERIFIER_URL" PROOF_MODE="$MODE" PROVER_ARTIFACTS="$ROOT/prover-sp1/fixtures" PROVER_ELF="$GUEST_ELF"
  EXPECTED_AUD="$CLIENT_ID" REQUIRE_ADDRESS_PROOF=true CORS_ORIGINS="http://localhost:5173" RUST_LOG="${RUST_LOG:-info}"
  BRIDGE_ISSUER_TOKEN="$ISSUER_TOKEN" VERIFIER_RESULT_TOKEN="$RESULT_TOKEN")
[ "$MODE" = groth16 ] && BRIDGE_ENV+=(SP1_PROVER=cpu)
(cd "$ROOT/service" && exec env "${BRIDGE_ENV[@]}" "$RUN_DIR/bin/e2e-nachweis-bridge") >"$RUN_DIR/bridge.log" 2>&1 &
BRIDGE_PID=$!
echo "$BRIDGE_PID e2e-nachweis-bridge" >> "$PIDFILE"
wait_http "$BRIDGE_URL/health" 60 '^200$' || die "bridge did not come up, see $RUN_DIR/bridge.log"
mark bridge "$BRIDGE_URL $(curl -s "$BRIDGE_URL/health" | jq -c '{mode,proof_mode}')"

# ---------------------------------------------------------------- the flow
SESSION=$(curl -sf -X POST "$BRIDGE_URL/sessions" -H 'content-type: application/json' -d "{\"bound_address\":\"$INVESTOR\"}") || die "POST /sessions failed"
SID=$(echo "$SESSION" | jq -r .session_id)
NONCE=$(echo "$SESSION" | jq -r .nonce)
mark session-created "id $SID nonce $NONCE"

SIG=$(cast wallet sign --private-key "$INVESTOR_KEY" "nachweis:session:$SID")
AP=$(curl -s -w '\n%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/address-proof" -H 'content-type: application/json' -d "{\"signature\":\"$SIG\"}")
[ "$(echo "$AP" | tail -1)" = 200 ] || die "address proof refused: $AP"
mark address-proof "EIP-191 by $INVESTOR accepted"

WALLET=$(bun run "$ROOT/scripts/e2e/wallet.ts" "$VERIFIER_URL" "$SID" "$ISSUER_KEY" "$ISSUER_CERT") || { echo "$WALLET"; die "wallet post refused by the verifier"; }
mark wallet-posted "verifier answered $(echo "$WALLET" | jq -c '.answer | {status, inspect}')"

# Follow the bridge state machine: created -> presented -> verified -> proving -> proved (-> failed).
case "$MODE" in groth16) WAIT=1500 ;; *) WAIT=300 ;; esac
LAST=""; STATE=""
for i in $(seq 1 "$WAIT"); do
  S=$(curl -sf "$BRIDGE_URL/sessions/$SID") || {
    kill -0 "$BRIDGE_PID" 2>/dev/null || die "the bridge process ($BRIDGE_PID) is gone during '$LAST' (killed from outside? no panic in $RUN_DIR/bridge.log means a signal)"
    die "GET /sessions/$SID failed"; }
  STATE=$(echo "$S" | jq -r .state)
  if [ "$STATE" != "$LAST" ]; then
    case "$STATE" in
      proved) mark "state:$STATE" "$(echo "$S" | jq -c '{proof_system, cycles, public_values: (.public_values | {over18, expiry, nonce})}')" ;;
      *) mark "state:$STATE" "$(echo "$S" | jq -r .detail)" ;;
    esac
    LAST="$STATE"
  fi
  case "$STATE" in
    proved) break ;;
    failed) die "bridge session failed: $(echo "$S" | jq -r .error)" ;;
  esac
  sleep 1
done
[ "$STATE" = proved ] || die "session did not reach proved within ${WAIT}s (state $STATE)"

# Attest. execute mode has no proof (proof_hex null), so the operator fallback attests there (and
# approves in the same transaction: the operator signed the decision). The proof path stores evidence
# only; the issuer approves in a separate step below.
if [ "$MODE" = execute ]; then
  NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/attest-operator" -H 'content-type: application/json' -d '{}')
  [ "$NOAUTH" = 401 ] || die "attest-operator without the issuer token answered $NOAUTH, expected 401"
  ATTEST=$(curl -s -w '\n%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/attest-operator" -H "authorization: Bearer $ISSUER_TOKEN" -H 'content-type: application/json' -d '{}')
  ATTEST_PATH="attestByOperator (operator fallback, execute mode has no proof)"
else
  ATTEST=$(curl -s -w '\n%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/attest" -H 'content-type: application/json' -d '{}')
  ATTEST_PATH="attestWithProof"
fi
ATTEST_CODE=$(echo "$ATTEST" | tail -1); ATTEST_BODY=$(echo "$ATTEST" | sed '$d')
[ "$ATTEST_CODE" = 200 ] || die "$ATTEST_PATH answered $ATTEST_CODE: $ATTEST_BODY"
TX=$(echo "$ATTEST_BODY" | jq -r .tx_hash)
RECEIPT=$(cast receipt "$TX" --rpc-url "$RPC_URL" --json)
GAS=$(echo "$RECEIPT" | jq -r .gasUsed | xargs cast to-dec)
[ "$(echo "$RECEIPT" | jq -r .status)" = "0x1" ] || die "attest tx $TX reverted"
mark "state:attested" "$ATTEST_PATH tx $TX gas $GAS bits $(echo "$ATTEST_BODY" | jq -r '.attested.bits // .attested.decision.bits // empty')"
if [ "$MODE" != execute ]; then
  # The trace shows the registry -> Sp1PidVerifier -> gateway -> Groth16 verifier call chain.
  cast run "$TX" --rpc-url "$RPC_URL" --quick > "$RUN_DIR/attest-trace-$MODE.txt" 2>&1 || true
  if grep -qi "$(echo "$SP1_GATEWAY" | cut -c1-10)" "$RUN_DIR/attest-trace-$MODE.txt"; then
    mark gateway-call "SP1VerifierGateway $SP1_GATEWAY appears in the attest trace ($RUN_DIR/attest-trace-$MODE.txt)"
  fi
fi

if [ "$MODE" != execute ]; then
  # Evidence on chain, not approved: isEligible false, subscribe reverts, the session says attested.
  ELIG0=$(cast call "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY_ID" "$REQUIRED_BITS" --rpc-url "$RPC_URL")
  [ "$ELIG0" = false ] || die "isEligible right after attestWithProof is $ELIG0, expected false before the issuer approves"
  APPROVED0=$(cast call "$REGISTRY" "approved(address,bytes32)(bool)" "$INVESTOR" "$POLICY_ID" --rpc-url "$RPC_URL")
  [ "$APPROVED0" = false ] || die "approved right after attestWithProof is $APPROVED0"
  set +e
  SUB0=$(cast send "$SUBSCRIPTION" "subscribe()" --rpc-url "$RPC_URL" --private-key "$INVESTOR_KEY" --json 2>&1); SUB0_RC=$?
  set -e
  [ $SUB0_RC -ne 0 ] || die "subscribe() succeeded before the issuer approved"
  S0=$(curl -sf "$BRIDGE_URL/sessions/$SID")
  [ "$(echo "$S0" | jq -r .state)" = attested ] && [ "$(echo "$S0" | jq -r .approved)" = false ] || die "session after attest: $(echo "$S0" | jq -c '{state,approved}')"
  mark awaiting-approval "isEligible false, approved false, subscribe() reverts, session attested (awaiting issuer approval)"
  # The issuer approves: bearer token required.
  NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/approve")
  [ "$NOAUTH" = 401 ] || die "approve without the issuer token answered $NOAUTH, expected 401"
  APPR=$(curl -s -w '\n%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/approve" -H "authorization: Bearer $ISSUER_TOKEN")
  [ "$(echo "$APPR" | tail -1)" = 200 ] || die "approve answered: $APPR"
  APPR_TX=$(echo "$APPR" | sed '$d' | jq -r .tx_hash)
  mark "state:approved" "registry.approve tx $APPR_TX gas $(cast receipt "$APPR_TX" --rpc-url "$RPC_URL" gasUsed | xargs cast to-dec)"
fi

ELIG=$(cast call "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY_ID" "$REQUIRED_BITS" --rpc-url "$RPC_URL")
[ "$ELIG" = true ] || die "isEligible after approve is $ELIG"
SUB=$(cast send "$SUBSCRIPTION" "subscribe()" --rpc-url "$RPC_URL" --private-key "$INVESTOR_KEY" --json) || die "subscribe() reverted right after approve"
SUB_GAS=$(echo "$SUB" | jq -r .gasUsed | xargs cast to-dec)
BAL=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$INVESTOR" --rpc-url "$RPC_URL" | awk '{print $1}')
[ "$BAL" != "0" ] || die "FundToken balance is 0 after subscribe"
mark subscribe "isEligible true, subscribe() gas $SUB_GAS, balance $(cast from-wei "$BAL") NDF"

NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BRIDGE_URL/revoke" -H 'content-type: application/json' -d "{\"subject\":\"$INVESTOR\"}")
[ "$NOAUTH" = 401 ] || die "revoke without the issuer token answered $NOAUTH, expected 401"
REV=$(curl -s -w '\n%{http_code}' -X POST "$BRIDGE_URL/revoke" -H "authorization: Bearer $ISSUER_TOKEN" -H 'content-type: application/json' -d "{\"subject\":\"$INVESTOR\"}")
[ "$(echo "$REV" | tail -1)" = 200 ] || die "revoke answered: $REV"
mark revoke "tx $(echo "$REV" | sed '$d' | jq -r .tx_hash)"
[ "$(curl -sf "$BRIDGE_URL/sessions/$SID" | jq -r .state)" = revoked ] || die "session after revoke is not revoked"

ELIG2=$(cast call "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY_ID" "$REQUIRED_BITS" --rpc-url "$RPC_URL")
[ "$ELIG2" = false ] || die "isEligible after revoke is $ELIG2"
set +e
SUB2=$(cast send "$SUBSCRIPTION" "subscribe()" --rpc-url "$RPC_URL" --private-key "$INVESTOR_KEY" --json 2>&1); SUB2_RC=$?
set -e
[ $SUB2_RC -ne 0 ] || die "subscribe() succeeded after revoke"
SEL_TOKEN=$(cast sig "NotEligible(address)"); SEL_SUB=$(cast sig "NotEligible()")
echo "$SUB2" | grep -qiE "NotEligible|${SEL_TOKEN#0x}|${SEL_SUB#0x}" || die "subscribe() failed after revoke, but not with NotEligible: $SUB2"
REVERT_DATA=$(echo "$SUB2" | grep -oE '0x[0-9a-f]{8,}' | head -1)
mark subscribe-blocked "isEligible false, subscribe() reverts NotEligible (${REVERT_DATA:-see output})"

# Re-approval needs the issuer: approve reopens the revoked record, subscribe works again.
REAP=$(curl -s -w '\n%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/approve" -H "authorization: Bearer $ISSUER_TOKEN")
[ "$(echo "$REAP" | tail -1)" = 200 ] || die "re-approve answered: $REAP"
ELIG3=$(cast call "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY_ID" "$REQUIRED_BITS" --rpc-url "$RPC_URL")
[ "$ELIG3" = true ] || die "isEligible after re-approve is $ELIG3"
mark re-approve "registry.approve after revoke: isEligible true again, tx $(echo "$REAP" | sed '$d' | jq -r .tx_hash)"

# ---------------------------------------------------------------- summary
echo
echo "PASS ($MODE): timeline"
printf '  %s\n' "${TIMELINE[@]}"
jq -n --arg mode "$MODE" --arg chain "$CHAIN_ID" --arg block "$FORK_BLOCK" --arg registry "$REGISTRY" --arg token "$TOKEN" \
  --arg subscription "$SUBSCRIPTION" --arg verifier "$VERIFIER_CONTRACT" --arg issuer_key_hash "$ISSUER_KEY_HASH" --arg client_id "$CLIENT_ID" \
  --arg session "$SID" --arg attest_tx "$TX" --arg attest_gas "$GAS" --arg attest_path "$ATTEST_PATH" --arg subscribe_gas "$SUB_GAS" \
  --arg total "$(elapsed | tr -d ' ')" --argjson timeline "$(printf '%s\n' "${TIMELINE[@]}" | jq -R . | jq -s .)" \
  '{mode:$mode, chain_id:$chain, fork_block:$block, registry:$registry, fund_token:$token, subscription:$subscription, verifier_contract:$verifier,
    issuer_key_hash:$issuer_key_hash, verifier_client_id:$client_id, session:$session, attest_path:$attest_path, attest_tx:$attest_tx,
    attest_gas:($attest_gas|tonumber), subscribe_gas:($subscribe_gas|tonumber), total_seconds:($total|tonumber), timeline:$timeline}' \
  > "$RUN_DIR/summary-$MODE.json"
echo "summary: $RUN_DIR/summary-$MODE.json"
