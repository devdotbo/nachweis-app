#!/usr/bin/env bash
# Two-device flow on one machine: the browser binds a bridge session to the investor's wallet,
# the phone (here: the companion, or the Android emulator) proves and posts to that session.
#
#   anvil -> AttestationRegistry (Deploy.s.sol) -> HonkVerifier + NoirPidVerifier (DeployNoirVerifier.s.sol)
#   -> verifier-service in blind-relay mode -> nachweis-bridge (local mode, REQUIRE_ADDRESS_PROOF=true)
#   -> "browser": POST /sessions {bound_address}, cast wallet sign "nachweis:session:<id>" with the
#      investor key, POST /sessions/:id/address-proof, GET /sessions/:id/handoff
#   -> "phone":   companion handoff <handoff JSON> --stub-wallet (request with the SAME challenge, wait,
#      pickup, prove with bb, POST /sessions/<id>/noir-proof)
#   -> assert: GET /sessions/:id is attested (evidence only), isEligible(investor, POLICY, 3) is false;
#      POST /sessions/:id/approve with the issuer token; isEligible true, an unrelated address is false;
#      POST /sessions/:id/revoke closes it, approve again reopens it.
#
# Usage: scripts/two-device-local.sh [--keep] [--phone] [--phone-timeout SECS]
#   --keep    leave anvil, verifier and bridge running afterwards (URLs and pids are printed)
#   --phone   second part for the Android app: deploys a NoirPidVerifier pinned to the bundled test
#             vector's issuer (its private key is not in the repo), points the registry at it, restarts the
#             bridge with REQUIRE_ADDRESS_PROOF=false (the vector's address 0xf99e...55dc has no known key)
#             and handoff URLs the emulator reaches (10.0.2.2), creates the session bound to the vector's
#             address and challenge, prints the handoff, starts the app with it over adb, then polls the
#             session until attested (--phone-timeout, default 600). In the app: "Load test presentation",
#             "Derive circuit inputs", "Prove on this device", "Continue to submit", "Submit to bridge".
# Env: VERIFIER_REPO (default ../nachweis-verifier-relay next to this repo), RUN_DIR (default .e2e/two-device),
#      ANVIL_PORT 8545, VERIFIER_PORT 8091, BRIDGE_PORT 8788, ANDROID_SERIAL for adb.
# Nothing touches a public chain: every transaction goes to the local anvil.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFIER_REPO="${VERIFIER_REPO:-$(cd "$ROOT/.." && pwd)/nachweis-verifier-relay}"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/two-device}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
VERIFIER_PORT="${VERIFIER_PORT:-8091}"
BRIDGE_PORT="${BRIDGE_PORT:-8788}"
KEEP=0; PHONE=0; PHONE_TIMEOUT=600
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --phone) PHONE=1; shift ;;
    --phone-timeout) PHONE_TIMEOUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.foundry/bin:$HOME/.cargo/bin:$HOME/.bun/bin:$HOME/Library/Android/sdk/platform-tools:$PATH"
for tool in anvil forge cast cargo bun nargo bb jq curl; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, bridge operator
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor's wallet
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
STRANGER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                      # anvil 2, never attested
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
ISSUER_TOKEN="${BRIDGE_ISSUER_TOKEN:-local-issuer-token}"   # bearer token for the bridge's issuer routes (approve, revoke, attest-operator)
RPC="http://127.0.0.1:$ANVIL_PORT"
VERIFIER_URL="http://127.0.0.1:$VERIFIER_PORT"
BRIDGE_URL="http://127.0.0.1:$BRIDGE_PORT"

mkdir -p "$RUN_DIR"
PIDS="$RUN_DIR/pids"
T0=$(date +%s.%N)
now() { printf "%7.2f s" "$(echo "$(date +%s.%N) - $T0" | bc)"; }
say() { echo "[$(now)] $*"; }
die() { echo "FAIL: $*" >&2; [ $KEEP -eq 1 ] || stop_all; exit 1; }
stop_all() {
  if [ -f "$PIDS" ]; then
    while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDS"
    : > "$PIDS"
  fi
}
# A previous run of this script (only pids this script wrote).
stop_all
trap '[ $KEEP -eq 1 ] || stop_all' EXIT

wait_http() { # url, seconds
  for _ in $(seq 1 $(( $2 * 5 ))); do curl -fs "$1" >/dev/null 2>&1 && return 0; sleep 0.2; done
  return 1
}

# ------------------------------------------------------------------ 1. anvil
if curl -fs -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" >/dev/null 2>&1; then
  die "something already listens on $RPC (set ANVIL_PORT)"
fi
anvil --port "$ANVIL_PORT" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do curl -fs -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
say "anvil on $RPC"

# ------------------------------------------------------------------ 2. issuer key, contracts
ISSUER_JSON=$(cd "$ROOT/companion" && bun run src/cli.ts issuer-key "$RUN_DIR/issuer.json" 2>/dev/null)
ISSUER_HASH=$(echo "$ISSUER_JSON" | jq -r .issuer_key_hash)
say "test issuer key $RUN_DIR/issuer.json, hash $ISSUER_HASH"
DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] || die "no registry address in the deploy output"
deploy_noir() { # issuer hash -> NoirPidVerifier address, registered with setVerifier
  local out
  out=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY REGISTRY_ADDRESS=$REGISTRY PID_ISSUER_KEY_HASH=$1 \
    forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url "$RPC" --broadcast 2>&1) || { echo "$out" | tail -20; die "DeployNoirVerifier.s.sol failed"; }
  echo "$out" | awk '/NoirPidVerifier:/ {print $2}' | head -1
}
NOIR_VERIFIER=$(deploy_noir "$ISSUER_HASH")
say "AttestationRegistry $REGISTRY, NoirPidVerifier $NOIR_VERIFIER (issuer $ISSUER_HASH)"

# ------------------------------------------------------------------ 3. verifier-service (blind relay)
VERIFIER_BIN="$VERIFIER_REPO/target/debug/verifier-service"
[ -x "$VERIFIER_BIN" ] || VERIFIER_BIN="$VERIFIER_REPO/target/release/verifier-service"
# Always build: cargo is incremental, and a stale binary silently runs old code (seen 2026-09-08).
(cd "$VERIFIER_REPO" && cargo build --release -p verifier-service) || die "verifier-service build failed"; VERIFIER_BIN="$VERIFIER_REPO/target/release/verifier-service"
(cd "$VERIFIER_REPO" && exec env PORT=$VERIFIER_PORT PUBLIC_URL="$VERIFIER_URL/" "$VERIFIER_BIN" > "$RUN_DIR/verifier.log" 2>&1) & echo $! >> "$PIDS"
wait_http "$VERIFIER_URL/" 20 || wait_http "$VERIFIER_URL/relay/status/00000000-0000-0000-0000-000000000000" 5 || true
sleep 0.5
say "verifier-service (relay) on $VERIFIER_URL"

# ------------------------------------------------------------------ 4. bridge
BRIDGE_BIN="$ROOT/service/target/release/nachweis-bridge"
(cd "$ROOT/service" && cargo build --release) || die "bridge build failed"
BRIDGE_PID=""
start_bridge() { # require_address_proof, noir verifier, handoff verifier url, handoff bridge url
  [ -n "$BRIDGE_PID" ] && { kill "$BRIDGE_PID" 2>/dev/null || true; sleep 0.3; }
  BIND="127.0.0.1:$BRIDGE_PORT" RPC_URL="$RPC" OPERATOR_PRIVATE_KEY=$K0 REGISTRY=$REGISTRY NOIR_VERIFIER=$2 \
    POLICY_ID=nachweis.pid.over18.v1 REQUIRE_ADDRESS_PROOF=$1 HANDOFF_VERIFIER_URL="$3" HANDOFF_BRIDGE_URL="$4" \
    BRIDGE_ISSUER_TOKEN="$ISSUER_TOKEN" RUST_LOG=info "$BRIDGE_BIN" >> "$RUN_DIR/bridge.log" 2>&1 & BRIDGE_PID=$!
  echo $BRIDGE_PID >> "$PIDS"
  wait_http "$BRIDGE_URL/health" 20 || die "bridge did not come up ($RUN_DIR/bridge.log)"
}
start_bridge true "$NOIR_VERIFIER" "$VERIFIER_URL" "$BRIDGE_URL"
say "bridge on $BRIDGE_URL ($(basename "$(dirname "$BRIDGE_BIN")") build, REQUIRE_ADDRESS_PROOF=true)"

# ------------------------------------------------------------------ 5. the browser part, scripted
CREATED=$(curl -fs -X POST -H 'content-type: application/json' --data "{\"bound_address\":\"$INVESTOR\"}" "$BRIDGE_URL/sessions")
SID=$(echo "$CREATED" | jq -r .session_id)
NONCE=$(echo "$CREATED" | jq -r .nonce)
say "browser: bridge session $SID for $INVESTOR, nonce $NONCE"
# A handoff before the wallet signed still works (the phone just would not get past the 409).
SIG=$(cast wallet sign --private-key $K1 "nachweis:session:$SID")
AP=$(curl -fs -X POST -H 'content-type: application/json' --data "{\"signature\":\"$SIG\"}" "$BRIDGE_URL/sessions/$SID/address-proof")
[ "$(echo "$AP" | jq -r .address_verified)" = "true" ] || die "address proof not accepted: $AP"
say "browser: wallet signed nachweis:session:$SID (EIP-191, anvil key 1), bridge set address_verified"
HANDOFF=$(curl -fs "$BRIDGE_URL/sessions/$SID/handoff")
echo "$HANDOFF" > "$RUN_DIR/handoff.json"
[ "$(echo "$HANDOFF" | jq -r .nonce)" = "$NONCE" ] || die "handoff nonce differs: $HANDOFF"
say "browser: handoff $(echo "$HANDOFF" | jq -c '{session_id, bound_address, challenge_hex, nonce, verifier_url, bridge_url, expires_at}')"
say "browser: handoff URI $(echo "$HANDOFF" | jq -r .uri)"

# ------------------------------------------------------------------ 6. the phone part, companion with the stand-in wallet
say "phone (companion): request with the handoff's challenge, stub wallet, pickup, prove, submit to session $SID"
COMPANION_LOG="$RUN_DIR/companion.log"
(cd "$ROOT/companion" && bun run src/cli.ts handoff "$HANDOFF" --stub-wallet "$RUN_DIR/issuer.json" --session "$RUN_DIR/handoff-run.json" --no-qr > "$RUN_DIR/companion.out" 2> "$COMPANION_LOG") || { tail -20 "$COMPANION_LOG"; die "companion handoff failed"; }
say "phone (companion): done"
sed -n '/^timeline/,$p' "$COMPANION_LOG" | sed 's/^/    /'

# ------------------------------------------------------------------ 7. assertions, independent of the companion's own output
STATE=$(curl -fs "$BRIDGE_URL/sessions/$SID" | jq -r .state)
[ "$STATE" = "attested" ] || die "bridge session is $STATE, expected attested"
[ "$(curl -fs "$BRIDGE_URL/sessions/$SID" | jq -r .approved)" = "false" ] || die "session reports approved before the issuer approved"
TX=$(curl -fs "$BRIDGE_URL/sessions/$SID" | jq -r .tx_hash)
PS=$(curl -fs "$BRIDGE_URL/sessions/$SID" | jq -r .proof_system)
# Evidence only: the proof never opens a door by itself.
ELIGIBLE0=$(cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY" 3)
[ "$ELIGIBLE0" = "false" ] || die "isEligible($INVESTOR) is $ELIGIBLE0 before the issuer approved, expected false"
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/approve")
[ "$NOAUTH" = "401" ] || die "approve without the issuer token answered $NOAUTH, expected 401"
APPR=$(curl -fs -X POST -H "authorization: Bearer $ISSUER_TOKEN" "$BRIDGE_URL/sessions/$SID/approve") || die "approve failed"
say "assert: attested, isEligible(investor) false before approval; approve without token 401; issuer approved in $(echo "$APPR" | jq -r .tx_hash)"
[ "$(curl -fs "$BRIDGE_URL/sessions/$SID" | jq -r .state)" = "approved" ] || die "session is not approved after approve"
ELIGIBLE=$(cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY" 3)
[ "$ELIGIBLE" = "true" ] || die "isEligible($INVESTOR) is $ELIGIBLE after approve"
OTHER=$(cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$STRANGER" "$POLICY" 3)
[ "$OTHER" = "false" ] || die "isEligible($STRANGER) is $OTHER, expected false"
HO_AFTER=$(curl -s -o /dev/null -w '%{http_code}' "$BRIDGE_URL/sessions/$SID/handoff")
[ "$HO_AFTER" = "409" ] || die "handoff after attestation answered $HO_AFTER, expected 409"
GAS=$(cast receipt --rpc-url "$RPC" "$TX" gasUsed 2>/dev/null || echo "?")
say "assert: session $SID attested ($PS) in $TX, gas $GAS; after approve isEligible(investor) true, isEligible(stranger) false; handoff now 409"
# Revoke closes it; a proof cannot reopen it (registry: DecisionRevoked); re-approval needs the issuer.
curl -fs -X POST -H "authorization: Bearer $ISSUER_TOKEN" "$BRIDGE_URL/sessions/$SID/revoke" >/dev/null || die "revoke failed"
[ "$(cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY" 3)" = "false" ] || die "isEligible true after revoke"
[ "$(curl -fs "$BRIDGE_URL/sessions/$SID" | jq -r .state)" = "revoked" ] || die "session is not revoked after revoke"
curl -fs -X POST -H "authorization: Bearer $ISSUER_TOKEN" "$BRIDGE_URL/sessions/$SID/approve" >/dev/null || die "re-approve failed"
[ "$(cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY" 3)" = "true" ] || die "isEligible false after re-approve"
say "assert: revoke closes (isEligible false, session revoked); re-approve by the issuer reopens (isEligible true)"
PLAINTEXT=$( (grep -ci 'erika\|mustermann\|vp_token\|given_name\|eyJ' "$RUN_DIR/verifier.log" "$RUN_DIR/bridge.log" || true) | awk -F: '{s+=$2} END {print s+0}')
say "assert: plaintext markers in verifier and bridge logs: $PLAINTEXT"
[ "$PLAINTEXT" = "0" ] || die "a plaintext marker leaked into a server log"
echo "TWO-DEVICE (companion) OK"

# ------------------------------------------------------------------ 8. optional: the Android emulator as the phone
if [ $PHONE -eq 1 ]; then
  command -v adb >/dev/null || die "adb not found"
  adb get-state >/dev/null 2>&1 || die "no device or emulator attached (adb get-state)"
  adb shell pm list packages 2>/dev/null | grep -q org.nachweis.prover || die "org.nachweis.prover is not installed (adb install -r prover-android/app/build/outputs/apk/debug/app-debug.apk)"
  VEC_ADDR=$(jq -r .bound_address_hex "$ROOT/prover-sp1/fixtures/realistic-input.json")
  VEC_CH=$(jq -r .challenge_hex "$ROOT/prover-sp1/fixtures/realistic-input.json" | sed 's/^0x//')
  FIXTURE_ISSUER_HASH=$(grep -o 'FIXTURE_ISSUER_KEY_HASH = 0x[0-9a-fA-F]*' "$ROOT/contracts/script/DeployNoirVerifier.s.sol" | awk '{print $3}')
  say "phone (emulator): NoirPidVerifier pinned to the test vector's issuer $FIXTURE_ISSUER_HASH"
  NOIR_VERIFIER_PHONE=$(deploy_noir "$FIXTURE_ISSUER_HASH")
  say "phone (emulator): NoirPidVerifier $NOIR_VERIFIER_PHONE registered for the policy"
  start_bridge false "$NOIR_VERIFIER_PHONE" "http://10.0.2.2:$VERIFIER_PORT" "http://10.0.2.2:$BRIDGE_PORT"
  say "phone (emulator): bridge restarted with REQUIRE_ADDRESS_PROOF=false (the vector's address $VEC_ADDR has no known key)"
  CREATED2=$(curl -fs -X POST -H 'content-type: application/json' --data "{\"bound_address\":\"$VEC_ADDR\",\"challenge_hex\":\"$VEC_CH\"}" "$BRIDGE_URL/sessions")
  SID2=$(echo "$CREATED2" | jq -r .session_id)
  HANDOFF2=$(curl -fs "$BRIDGE_URL/sessions/$SID2/handoff")
  echo "$HANDOFF2" > "$RUN_DIR/handoff-phone.json"
  URI2=$(echo "$HANDOFF2" | jq -r .uri)
  say "browser: session $SID2 bound to $VEC_ADDR (vector challenge); handoff URI $URI2"
  adb shell am force-stop org.nachweis.prover
  adb shell am start -n org.nachweis.prover/.MainActivity --es handoff "'$URI2'" >/dev/null
  say "phone (emulator): app started with the handoff; now Load test presentation, Derive, Prove, Continue, Submit in the app"
  for _ in $(seq 1 "$PHONE_TIMEOUT"); do
    ST=$(curl -fs "$BRIDGE_URL/sessions/$SID2" | jq -r .state)
    [ "$ST" = "attested" ] && break
    [ "$ST" = "failed" ] && die "phone session failed: $(curl -fs "$BRIDGE_URL/sessions/$SID2" | jq -r .error)"
    sleep 1
  done
  [ "$ST" = "attested" ] || die "phone session is $ST after $PHONE_TIMEOUT s"
  TX2=$(curl -fs "$BRIDGE_URL/sessions/$SID2" | jq -r .tx_hash)
  EL2=$(cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$VEC_ADDR" "$POLICY" 3)
  [ "$EL2" = "false" ] || die "isEligible($VEC_ADDR) is $EL2 before the issuer approved"
  curl -fs -X POST -H "authorization: Bearer $ISSUER_TOKEN" "$BRIDGE_URL/sessions/$SID2/approve" >/dev/null || die "approve of the phone session failed"
  EL2=$(cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$VEC_ADDR" "$POLICY" 3)
  [ "$EL2" = "true" ] || die "isEligible($VEC_ADDR) is $EL2 after approve"
  say "assert: phone session $SID2 attested in $TX2, gas $(cast receipt --rpc-url "$RPC" "$TX2" gasUsed 2>/dev/null || echo '?'); isEligible($VEC_ADDR) false before and true after the issuer approved"
  echo "TWO-DEVICE (emulator) OK"
fi

if [ $KEEP -eq 1 ]; then
  echo "kept running: anvil $RPC, verifier $VERIFIER_URL, bridge $BRIDGE_URL (pids in $PIDS)"
fi
