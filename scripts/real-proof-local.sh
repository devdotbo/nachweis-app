#!/usr/bin/env bash
# The main route on a local chain with a REAL presentation: a companion session file that holds the
# official wallet's presentation and (usually) the cached Noir proof over it.
#
#   session file (read; the presentation never leaves it)
#   -> companion `prove` only when the session carries no proof yet (writes the proof back into the
#      same session file, its work dir proof-<id8>/ next to it; the companion's normal behaviour)
#   -> anvil -> AttestationRegistry, FundToken, Subscription (Deploy.s.sol)
#   -> HonkVerifier + NoirPidVerifier pinned to the proof's issuer_key_hash (DeployNoirVerifier.s.sol)
#   -> EudiAllowlistChecker(registry, POLICY, 3), the Uniswap permissioned-pool door
#   -> nachweis-bridge in local mode, REQUIRE_ADDRESS_PROOF=true, a fresh BRIDGE_ISSUER_TOKEN
#   -> "browser": POST /sessions {bound_address, challenge_hex} with the session's OWN challenge, so the
#      bridge nonce equals the nonce inside the proof; the wallet signs "nachweis:session:<id>" (EIP-191)
#   -> "phone":   POST /sessions/:id/noir-proof {proof_hex, public_inputs_hex, tier}, the body the
#      companion's `submit` sends (the bridge never receives the presentation on this route)
#   -> assert: refusals (proof before the address proof 409, approve without token 401), statusOf has evidence and no approval, isEligible false, subscribe reverts,
#      checker denies; approve; isEligible true, subscribe succeeds, checker allows; revoke closes all
#      three; re-approve reopens; a replay of the same proof is refused (NonceConsumed); the bridge log
#      holds no plaintext marker.
#
# Usage: SESSION=/path/to/session.json scripts/real-proof-local.sh [--keep]
#   SESSION   required; the companion session file (0600, outside the repo). There is no default on
#             purpose: the real presentation lives in a private directory, see docs/two-device.md.
#   --keep    leave anvil and the bridge running afterwards (URLs and pids are printed)
# Env: RUN_DIR (default .e2e/real-proof, gitignored), ANVIL_PORT 8545, BRIDGE_PORT 8788,
#      PID_ISSUER_KEY_HASH (default: the proof's decoded issuer_key_hash, cross-checked against
#      sha256 of the SEC1 key the companion recorded), BRIDGE_ISSUER_TOKEN (default: fresh random),
#      WALLET_KEY (default anvil key 1; must be the key of the session's bound address),
#      PROVE_FLAGS (extra flags for companion prove, e.g. "--kb-window 0" for a stale KB-JWT).
# Nothing touches a public chain: every transaction goes to the local anvil.
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/real-proof}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
BRIDGE_PORT="${BRIDGE_PORT:-8788}"
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,32p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.foundry/bin:$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast cargo bun jq curl openssl xxd shasum bc; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, bridge operator
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor's wallet
WALLET_KEY="${WALLET_KEY:-$K1}"
INVESTOR_KEY="$WALLET_KEY"
STRANGER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                      # anvil 2, never attested
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
REQUIRED_BITS=3
ISSUER_TOKEN="${BRIDGE_ISSUER_TOKEN:-$(openssl rand -hex 16)}"
RPC="http://127.0.0.1:$ANVIL_PORT"
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
stop_all   # a previous run of this script (only pids this script wrote)
trap 'echo "FAIL: exit $? at line $LINENO: $BASH_COMMAND" >&2' ERR
trap 'rc=$?; [ $KEEP -eq 1 ] || stop_all; [ $rc -eq 0 ] || echo "exit $rc; logs in $RUN_DIR" >&2' EXIT
wait_http() { # url, seconds
  for _ in $(seq 1 $(( $2 * 5 ))); do curl -fs "$1" >/dev/null 2>&1 && return 0; sleep 0.2; done
  return 1
}
# Contract reads. cast prints bools as true/false, bytes2 as 0x...., big integers with a [1.79e9] annotation
# (dropped by awk); gas is a decimal after to-dec.
eligible() { cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$1" "$POLICY" $REQUIRED_BITS; }
status_of() { cast call --rpc-url "$RPC" "$REGISTRY" "statusOf(address,bytes32)(bool,bool,bool,uint64)" "$INVESTOR" "$POLICY" | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//'; }
checker() { cast call --rpc-url "$RPC" "$CHECKER" "checkAllowlist(address,address)(bytes2)" "$1" "$TOKEN"; }
gas_of() { cast receipt --rpc-url "$RPC" "$1" gasUsed | xargs cast to-dec; }
subscribe_rc() { # 0 when subscribe() mines, 1 when it reverts; output in $SUB_OUT
  set +e; SUB_OUT=$(cast send --rpc-url "$RPC" --private-key "$INVESTOR_KEY" "$SUBSCRIPTION" "subscribe()" --json 2>&1); local rc=$?; set -e
  return $rc
}
bridge_state() { curl -fs "$BRIDGE_URL/sessions/$1" | jq -r "$2"; }

# ------------------------------------------------------------------ 0. the session file
[ -n "${SESSION:-}" ] || die "SESSION=/path/to/session.json is required (the companion session file with the real presentation)"
[ -f "$SESSION" ] || die "session file $SESSION does not exist"
case "$(cd "$(dirname "$SESSION")" && pwd)/" in
  "$ROOT/.e2e/"*) ;;
  "$ROOT/"*) die "the session file lies inside the repository; keep the presentation out of every worktree" ;;
esac
# Only these fields are read into the shell; the presentation and the client key are never touched.
INVESTOR=$(jq -r .bound_address "$SESSION" | tr 'A-F' 'a-f')
CHALLENGE=$(jq -r .challenge_hex "$SESSION" | sed 's/^0x//')
NONCE=$(jq -r .nonce "$SESSION" | sed 's/^0x//' | tr 'A-F' 'a-f')
RELAY_SID=$(jq -r .session_id "$SESSION")
[ "${#CHALLENGE}" = 64 ] && [ "${#NONCE}" = 64 ] || die "session file has no 32-byte challenge_hex and nonce"
WALLET_ADDR=$(cast wallet address --private-key "$WALLET_KEY" | tr 'A-F' 'a-f')
[ "$WALLET_ADDR" = "$INVESTOR" ] || die "WALLET_KEY is for $WALLET_ADDR, the session is bound to $INVESTOR"
say "session $RELAY_SID: bound to $INVESTOR, challenge ${CHALLENGE:0:16}.., nonce ${NONCE:0:16}.. (presentation not read)"

# ------------------------------------------------------------------ 1. the proof (cached, or companion prove)
if [ "$(jq -r '.proof.proof_hex // empty | length' "$SESSION")" -gt 0 ] 2>/dev/null; then
  say "proof cached in the session file (bb prove $(jq -r '.proof.timings_ms.bb_prove_ms // "?"' "$SESSION") ms when it was made)"
else
  [ -d "$ROOT/companion/node_modules/viem" ] || (cd "$ROOT/companion" && bun install --silent) || die "bun install failed in companion/"
  say "no proof in the session: companion prove (nargo execute, bb prove; the proof is written into the session file)"
  # shellcheck disable=SC2086
  (cd "$ROOT/companion" && bun run src/cli.ts prove --session "$SESSION" ${PROVE_FLAGS:-} > "$RUN_DIR/prove.out" 2> "$RUN_DIR/prove.log") \
    || { grep -v -i 'given_name\|family_name' "$RUN_DIR/prove.log" | tail -15; die "companion prove failed (see $RUN_DIR/prove.log)"; }
  say "proved: $(jq -c '{proof_bytes, timings_ms}' "$RUN_DIR/prove.out")"
fi
# The proof's public inputs, decoded by the companion (no personal data: subject, issuer hash, flags, expiry, nonce).
jq -c .proof.decoded "$SESSION" > "$RUN_DIR/public-inputs.json"
[ "$(jq -r .subject "$RUN_DIR/public-inputs.json" | tr 'A-F' 'a-f')" = "$INVESTOR" ] || die "the proof's subject is not the bound address"
[ "$(jq -r .nonce "$RUN_DIR/public-inputs.json" | sed 's/^0x//')" = "$NONCE" ] || die "the proof's nonce is not the session nonce"
[ "$(jq -r .over18 "$RUN_DIR/public-inputs.json")" = 1 ] || die "the proof does not assert over18"
EXPIRY=$(jq -r .expiry "$RUN_DIR/public-inputs.json")
PROOF_HASH=$(jq -r .proof.decoded.issuer_key_hash "$SESSION")
SEC1_HASH="0x$(jq -r .proof.issuer_key_sec1_hex "$SESSION" | sed 's/^0x//' | xxd -r -p | shasum -a 256 | awk '{print $1}')"
[ "$PROOF_HASH" = "$SEC1_HASH" ] || die "issuer_key_hash in the public inputs ($PROOF_HASH) is not sha256 of the recorded SEC1 key ($SEC1_HASH)"
ISSUER_HASH="${PID_ISSUER_KEY_HASH:-$PROOF_HASH}"
[ "$ISSUER_HASH" = "$PROOF_HASH" ] || say "warning: PID_ISSUER_KEY_HASH $ISSUER_HASH differs from the proof's $PROOF_HASH; the verifier will refuse the proof"
# The body of POST /sessions/:id/noir-proof, exactly what the companion's `submit` sends.
jq -c '{proof_hex: .proof.proof_hex, public_inputs_hex: .proof.public_inputs_hex, tier: 1}' "$SESSION" > "$RUN_DIR/noir-proof-body.json"
say "public inputs: over18 1, expiry $EXPIRY, issuer_key_hash $ISSUER_HASH, $(jq -r '.public_inputs_hex | length' "$RUN_DIR/noir-proof-body.json") field elements, proof $(( ($(jq -r '.proof_hex | length' "$RUN_DIR/noir-proof-body.json") - 2) / 2 )) bytes"

# ------------------------------------------------------------------ 2. anvil
if curl -fs -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" >/dev/null 2>&1; then
  die "something already listens on $RPC (set ANVIL_PORT)"
fi
anvil --port "$ANVIL_PORT" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do curl -fs -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
say "anvil on $RPC"

# ------------------------------------------------------------------ 3. contracts
DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$TOKEN" ] && [ -n "$SUBSCRIPTION" ] || die "missing addresses in the Deploy.s.sol output"
NOIR_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY REGISTRY_ADDRESS=$REGISTRY PID_ISSUER_KEY_HASH=$ISSUER_HASH \
  forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url "$RPC" --broadcast 2>&1) || { echo "$NOIR_OUT" | tail -20; die "DeployNoirVerifier.s.sol failed"; }
NOIR_VERIFIER=$(echo "$NOIR_OUT" | awk '/NoirPidVerifier:/ {print $2}' | head -1)
[ -n "$NOIR_VERIFIER" ] || die "no NoirPidVerifier address in the deploy output"
CHECKER_OUT=$(cd "$ROOT/contracts" && forge create src/uniswap/EudiAllowlistChecker.sol:EudiAllowlistChecker --rpc-url "$RPC" --private-key $K0 --broadcast \
  --constructor-args "$REGISTRY" "$POLICY" $REQUIRED_BITS 2>&1) || { echo "$CHECKER_OUT" | tail -20; die "EudiAllowlistChecker deploy failed"; }
CHECKER=$(echo "$CHECKER_OUT" | awk '/Deployed to:/ {print $3}' | head -1)
[ -n "$CHECKER" ] || die "no checker address in the forge create output"
say "AttestationRegistry $REGISTRY, FundToken $TOKEN, Subscription $SUBSCRIPTION"
say "NoirPidVerifier $NOIR_VERIFIER pinned to issuer $ISSUER_HASH; EudiAllowlistChecker $CHECKER"

# ------------------------------------------------------------------ 4. bridge, local mode
BRIDGE_BIN="$ROOT/service/target/release/nachweis-bridge"
(cd "$ROOT/service" && cargo build --release >"$RUN_DIR/build-bridge.log" 2>&1) || die "bridge build failed, see $RUN_DIR/build-bridge.log"
: > "$RUN_DIR/bridge.log"
BIND="127.0.0.1:$BRIDGE_PORT" RPC_URL="$RPC" OPERATOR_PRIVATE_KEY=$K0 REGISTRY=$REGISTRY NOIR_VERIFIER=$NOIR_VERIFIER \
  POLICY_ID=nachweis.pid.over18.v1 REQUIRE_ADDRESS_PROOF=true BRIDGE_ISSUER_TOKEN="$ISSUER_TOKEN" RUST_LOG=info \
  "$BRIDGE_BIN" >> "$RUN_DIR/bridge.log" 2>&1 & echo $! >> "$PIDS"
wait_http "$BRIDGE_URL/health" 20 || die "bridge did not come up ($RUN_DIR/bridge.log)"
say "bridge on $BRIDGE_URL (local mode, REQUIRE_ADDRESS_PROOF=true, fresh issuer token)"

# ------------------------------------------------------------------ 5. browser: session with the SAME challenge, wallet signature
CREATED=$(curl -fs -X POST -H 'content-type: application/json' --data "{\"bound_address\":\"$INVESTOR\",\"challenge_hex\":\"$CHALLENGE\"}" "$BRIDGE_URL/sessions")
SID=$(echo "$CREATED" | jq -r .session_id)
BNONCE=$(echo "$CREATED" | jq -r .nonce | sed 's/^0x//' | tr 'A-F' 'a-f')
[ "$BNONCE" = "$NONCE" ] || die "bridge nonce $BNONCE differs from the session nonce $NONCE"
say "browser: bridge session $SID bound to $INVESTOR with the session's challenge; nonce matches the proof"
# Refusal 1: the proof before the wallet signed is a 409 (REQUIRE_ADDRESS_PROOF).
EARLY=$(curl -s -o "$RUN_DIR/early.json" -w '%{http_code}' -X POST -H 'content-type: application/json' --data @"$RUN_DIR/noir-proof-body.json" "$BRIDGE_URL/sessions/$SID/noir-proof")
[ "$EARLY" = "409" ] || die "noir-proof before the address proof answered $EARLY, expected 409: $(cat "$RUN_DIR/early.json")"
SIG=$(cast wallet sign --private-key "$WALLET_KEY" "nachweis:session:$SID")
AP=$(curl -fs -X POST -H 'content-type: application/json' --data "{\"signature\":\"$SIG\"}" "$BRIDGE_URL/sessions/$SID/address-proof")
[ "$(echo "$AP" | jq -r .address_verified)" = "true" ] || die "address proof not accepted: $AP"
say "browser: noir-proof before the signature 409; wallet signed nachweis:session:$SID (EIP-191), address_verified"

# ------------------------------------------------------------------ 6. phone: the real proof to the bridge
T_SUB=$(date +%s.%N)
CODE=$(curl -s -o "$RUN_DIR/noir-proof-response.json" -w '%{http_code}' -X POST -H 'content-type: application/json' --data @"$RUN_DIR/noir-proof-body.json" "$BRIDGE_URL/sessions/$SID/noir-proof")
[ "$CODE" = "200" ] || die "noir-proof answered $CODE: $(cat "$RUN_DIR/noir-proof-response.json")"
TX=$(jq -r .tx_hash "$RUN_DIR/noir-proof-response.json")
ATTEST_GAS=$(gas_of "$TX")
say "phone: noir-proof accepted in $(printf '%.2f' "$(echo "$(date +%s.%N) - $T_SUB" | bc)") s (verify dry run + attestWithProof), tx $TX, gas $ATTEST_GAS"
[ "$(bridge_state "$SID" .state)" = "attested" ] || die "bridge session is $(bridge_state "$SID" .state), expected attested"
[ "$(bridge_state "$SID" .proof_system)" = "noir-ultrahonk" ] || die "proof_system is not noir-ultrahonk"
[ "$(bridge_state "$SID" .approved)" = "false" ] || die "session reports approved before the issuer approved"

# ------------------------------------------------------------------ 7. evidence only: nothing opens yet
ST=$(status_of)
[ "$ST" = "true false false $EXPIRY" ] || die "statusOf after attest is ($ST), expected (true false false $EXPIRY)"
[ "$(eligible "$INVESTOR")" = "false" ] || die "isEligible true before approval"
subscribe_rc && die "subscribe() succeeded before the issuer approved"
[ "$(checker "$INVESTOR")" = "0x0000" ] || die "checker allows before approval: $(checker "$INVESTOR")"
say "assert: statusOf (hasDecision true, approved false, revoked false, expiry $EXPIRY); isEligible false; subscribe reverts; checker 0x0000"
# Refusal 3: approval needs the issuer token.
NOAUTH=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BRIDGE_URL/sessions/$SID/approve")
[ "$NOAUTH" = "401" ] || die "approve without the issuer token answered $NOAUTH, expected 401"

# ------------------------------------------------------------------ 8. the issuer approves: both doors open
APPR=$(curl -fs -X POST -H "authorization: Bearer $ISSUER_TOKEN" "$BRIDGE_URL/sessions/$SID/approve") || die "approve failed"
APPR_TX=$(echo "$APPR" | jq -r .tx_hash)
APPR_GAS=$(gas_of "$APPR_TX")
[ "$(bridge_state "$SID" .state)" = "approved" ] || die "session is not approved after approve"
ST=$(status_of)
[ "$ST" = "true true false $EXPIRY" ] || die "statusOf after approve is ($ST)"
[ "$(eligible "$INVESTOR")" = "true" ] || die "isEligible false after approve"
[ "$(eligible "$STRANGER")" = "false" ] || die "isEligible($STRANGER) true"
subscribe_rc || die "subscribe() reverted after approve: $SUB_OUT"
SUB_GAS=$(echo "$SUB_OUT" | jq -r .gasUsed | xargs cast to-dec)
BAL=$(cast call --rpc-url "$RPC" "$TOKEN" "balanceOf(address)(uint256)" "$INVESTOR" | awk '{print $1}')
[ "$BAL" != "0" ] || die "FundToken balance is 0 after subscribe"
[ "$(checker "$INVESTOR")" = "0x0003" ] || die "checker after approve: $(checker "$INVESTOR"), expected 0x0003 (swap | liquidity)"
[ "$(checker "$STRANGER")" = "0x0000" ] || die "checker allows the stranger"
say "assert: approve without token 401; approve tx $APPR_TX gas $APPR_GAS; statusOf (true true false $EXPIRY); isEligible true (stranger false)"
say "assert: subscribe() mined, gas $SUB_GAS, balance $(cast from-wei "$BAL") NDF; checker 0x0003 for the investor, 0x0000 for the stranger"

# ------------------------------------------------------------------ 9. revoke closes everything, re-approve reopens
REV=$(curl -fs -X POST -H "authorization: Bearer $ISSUER_TOKEN" "$BRIDGE_URL/sessions/$SID/revoke") || die "revoke failed"
REV_TX=$(echo "$REV" | jq -r .tx_hash)
[ "$(bridge_state "$SID" .state)" = "revoked" ] || die "session is not revoked after revoke"
ST=$(status_of)
[ "$ST" = "true false true $EXPIRY" ] || die "statusOf after revoke is ($ST), expected (true false true $EXPIRY): revoke clears the approval too"
[ "$(eligible "$INVESTOR")" = "false" ] || die "isEligible true after revoke"
subscribe_rc && die "subscribe() succeeded after revoke"
SEL_TOKEN=$(cast sig "NotEligible(address)"); SEL_SUB=$(cast sig "NotEligible()")
echo "$SUB_OUT" | grep -qiE "NotEligible|${SEL_TOKEN#0x}|${SEL_SUB#0x}" || die "subscribe() failed after revoke, but not with NotEligible: $SUB_OUT"
[ "$(checker "$INVESTOR")" = "0x0000" ] || die "checker allows after revoke"
say "assert: revoke tx $REV_TX gas $(gas_of "$REV_TX"); statusOf (true false true $EXPIRY); isEligible false; subscribe reverts NotEligible; checker 0x0000"
REAP=$(curl -fs -X POST -H "authorization: Bearer $ISSUER_TOKEN" "$BRIDGE_URL/sessions/$SID/approve") || die "re-approve failed"
[ "$(eligible "$INVESTOR")" = "true" ] || die "isEligible false after re-approve"
[ "$(checker "$INVESTOR")" = "0x0003" ] || die "checker denies after re-approve"
subscribe_rc || die "subscribe() reverted after re-approve: $SUB_OUT"
say "assert: re-approve tx $(echo "$REAP" | jq -r .tx_hash): isEligible true, checker 0x0003, subscribe() mined again"

# ------------------------------------------------------------------ 10. refusal: the same proof again
# A second session with the same challenge, signed again, fails at the registry, whose nonce for this
# policy is consumed: the bridge's dry run passes (verify is stateless), attestWithProof reverts with
# NonceConsumed. Last on purpose: after the reverted send the bridge's operator nonce cache is one ahead
# of the chain (alloy's cached nonce filler), so its next transaction is queued with a nonce gap and its
# receipt never comes (seen 2026-09-08: chain nonce 14, revoke queued at 15, the script hung on approve
# when this check ran earlier). A bridge restart resets the cache.
CREATED2=$(curl -fs -X POST -H 'content-type: application/json' --data "{\"bound_address\":\"$INVESTOR\",\"challenge_hex\":\"$CHALLENGE\"}" "$BRIDGE_URL/sessions")
SID2=$(echo "$CREATED2" | jq -r .session_id)
SIG2=$(cast wallet sign --private-key "$WALLET_KEY" "nachweis:session:$SID2")
curl -fs -X POST -H 'content-type: application/json' --data "{\"signature\":\"$SIG2\"}" "$BRIDGE_URL/sessions/$SID2/address-proof" >/dev/null
REPLAY=$(curl -s -o "$RUN_DIR/replay.json" -w '%{http_code}' -X POST -H 'content-type: application/json' --data @"$RUN_DIR/noir-proof-body.json" "$BRIDGE_URL/sessions/$SID2/noir-proof")
[ "$REPLAY" != "200" ] || die "the replayed proof was accepted a second time"
[ "$(status_of)" = "true true false $EXPIRY" ] || die "statusOf changed after the replay: $(status_of)"
say "assert: replay of the same proof (after re-approve) on a second session answered $REPLAY ($(jq -r '.error // .message // .' "$RUN_DIR/replay.json" | cut -c1-90)); registry unchanged"
# ------------------------------------------------------------------ 11. the bridge never saw the presentation
PLAINTEXT=$( (grep -ci 'erika\|mustermann\|vp_token\|given_name\|family_name\|eyJ' "$RUN_DIR/bridge.log" || true) | awk '{s+=$1} END {print s+0}')
[ "$PLAINTEXT" = "0" ] || die "a plaintext marker appears in the bridge log"
say "assert: plaintext markers in the bridge log: $PLAINTEXT ($(wc -l < "$RUN_DIR/bridge.log" | tr -d ' ') lines)"

TOTAL=$(echo "$(date +%s.%N) - $T0" | bc)
jq -n --arg session "$RELAY_SID" --arg bridge_session "$SID" --arg registry "$REGISTRY" --arg verifier "$NOIR_VERIFIER" --arg checker "$CHECKER" \
  --arg issuer_key_hash "$ISSUER_HASH" --arg attest_tx "$TX" --arg attest_gas "$ATTEST_GAS" --arg approve_gas "$APPR_GAS" --arg subscribe_gas "$SUB_GAS" \
  --arg expiry "$EXPIRY" --arg total "$TOTAL" \
  '{session:$session, bridge_session:$bridge_session, registry:$registry, noir_verifier:$verifier, checker:$checker, issuer_key_hash:$issuer_key_hash,
    attest_tx:$attest_tx, attest_gas:($attest_gas|tonumber), approve_gas:($approve_gas|tonumber), subscribe_gas:($subscribe_gas|tonumber),
    expiry:($expiry|tonumber), total_seconds:($total|tonumber)}' > "$RUN_DIR/summary.json"
say "summary in $RUN_DIR/summary.json"
echo "REAL-PROOF-LOCAL PASS ($(printf '%.1f' "$TOTAL") s: attestWithProof gas $ATTEST_GAS, approve gas $APPR_GAS, subscribe gas $SUB_GAS)"
if [ $KEEP -eq 1 ]; then
  echo "kept running: anvil $RPC, bridge $BRIDGE_URL, issuer token $ISSUER_TOKEN (pids in $PIDS)"
fi
