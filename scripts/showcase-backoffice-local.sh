#!/usr/bin/env bash
# Showcase "backoffice" (WP38): the issuer's compliance desk on a local anvil, desk service in local mode.
#   anvil -> Deploy.s.sol with OPERATOR_ADDRESS = the desk's local operator (anvil account 3, not the
#   deployer) -> MockProofVerifier as the policy's verifier -> desk service (showcase/backoffice,
#   BACKOFFICE_MODE=local) -> attestWithProof from the investor (Attested event) -> the desk proposes an
#   approve -> compliance confirms (1 of 2, not eligible) -> operations confirms (2 of 2, approve mined,
#   isEligible true) -> three refusals (value transfer, attestByOperator, one signature) -> revoke proposed
#   and confirmed (isEligible false) -> approve for a stranger address reverts NoDecision.
#
# Evidence class L only (docs/process.md): the proof is a mock, the quorum and the policy are simulated by
# the desk. The privy mode (Privy server wallet, 2 of 2 key quorum, policy in the enclave) is described
# in docs/showcase/backoffice.md and needs the builder's Privy app.
#
# Usage: scripts/showcase-backoffice-local.sh [--keep]
#   --keep    leave anvil and the desk running and start the app (Vite) with the addresses, for clicking
# Env: ANVIL_PORT (default 8548), DESK_PORT (default 8794), APP_PORT (default 5179), RUN_DIR (default .e2e/showcase-backoffice)
# Nothing touches a public chain: every transaction goes to the local anvil.
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/showcase-backoffice}"
ANVIL_PORT="${ANVIL_PORT:-8548}"
DESK_PORT="${DESK_PORT:-8794}"
APP_PORT="${APP_PORT:-5179}"
RPC="http://127.0.0.1:$ANVIL_PORT"
DESK="http://127.0.0.1:$DESK_PORT"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast jq curl bun; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }; done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, registry owner (not an operator here)
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor's wallet
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
STRANGER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                      # anvil 2, never attested
K3=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6   # anvil 3: the desk's local operator (the Privy wallet's stand-in)
OPERATOR=0x90F79bf6EB2c4f870365E785982E1f101E93b906
POLICY=$(cast keccak "nachweis.pid.over18.v1")
CHAIN_ID=31337

mkdir -p "$RUN_DIR"
PIDS="$RUN_DIR/pids"
: > "$PIDS"
say() { printf '\033[1;36m[showcase-backoffice-local]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[showcase-backoffice-local] FAIL:\033[0m %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [ "$KEEP" = 1 ]; then echo "kept running: anvil $RPC, desk $DESK, app http://127.0.0.1:$APP_PORT/showcase/backoffice (pids in $PIDS)"; return; fi
  while read -r pid; do pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; done < "$PIDS"
}
trap cleanup EXIT

eligible() { cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$1" "$POLICY" 3; }
send() { cast send --rpc-url "$RPC" --private-key "$1" --json "${@:2}"; }
post() { curl -sS -X POST -H 'content-type: application/json' "$DESK$1" -d "${2:-{\}}"; }
# Polls GET /queue until the jq filter (over the array) is non-empty; prints the first match.
wait_queue() { local filter="$1" n="${2:-40}" out; for _ in $(seq 1 "$n"); do out=$(curl -sS "$DESK/queue" | jq -c "[.[] | select($filter)] | first // empty"); [ -n "$out" ] && { echo "$out"; return 0; }; sleep 0.5; done; return 1; }

# ------------------------------------------------------------------ 1. anvil and contracts
anvil --port "$ANVIL_PORT" --chain-id "$CHAIN_ID" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
say "anvil on $RPC"

DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 OPERATOR_ADDRESS=$OPERATOR POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$SUBSCRIPTION" ] || die "no addresses in the Deploy output"
[ "$(cast call --rpc-url "$RPC" "$REGISTRY" "isOperator(bytes32,address)(bool)" "$POLICY" "$OPERATOR")" = "true" ] || die "desk operator is not the registry operator"
[ "$(cast call --rpc-url "$RPC" "$REGISTRY" "isOperator(bytes32,address)(bool)" "$POLICY" "$(cast wallet address --private-key $K0)")" = "false" ] || die "deployer is still an operator"
MOCK=$(cd "$ROOT/contracts" && forge create src/test/MockProofVerifier.sol:MockProofVerifier --rpc-url "$RPC" --private-key $K0 --broadcast --constructor-args true 2>&1 | awk '/Deployed to:/ {print $3}' | head -1)
[ -n "$MOCK" ] || die "MockProofVerifier deployment failed"
send $K0 "$REGISTRY" "setVerifier(bytes32,address)" "$POLICY" "$MOCK" >/dev/null
say "registry $REGISTRY (operator $OPERATOR, anvil account 3; deployer is owner only), mock verifier $MOCK (simulated evidence)"

# ------------------------------------------------------------------ 2. the desk in local mode
[ -d "$ROOT/showcase/backoffice/node_modules" ] || (cd "$ROOT/showcase/backoffice" && bun install --frozen-lockfile >/dev/null)
(cd "$ROOT/showcase/backoffice" && BACKOFFICE_MODE=local OPERATOR_PRIVATE_KEY=$K3 RPC_URL=$RPC CHAIN_ID=$CHAIN_ID REGISTRY=$REGISTRY FUND_TOKEN=$TOKEN POLICY_ID=$POLICY PORT=$DESK_PORT POLL_MS=700 \
  bun run src/server.ts > "$RUN_DIR/desk.log" 2>&1) & echo $! >> "$PIDS"
for _ in $(seq 1 60); do curl -sf "$DESK/health" >/dev/null 2>&1 && break; sleep 0.25; done
curl -sf "$DESK/health" >/dev/null || { tail -20 "$RUN_DIR/desk.log"; die "desk did not start"; }
INFO=$(curl -sS "$DESK/desk")
[ "$(echo "$INFO" | jq -r .mode)" = "local" ] || die "desk mode: $(echo "$INFO" | jq -r .mode)"
[ "$(echo "$INFO" | jq -r .operator.address | tr 'A-F' 'a-f')" = "$(echo $OPERATOR | tr 'A-F' 'a-f')" ] || die "desk operator address mismatch"
[ "$(echo "$INFO" | jq -r .quorum.threshold)" = "2" ] || die "quorum threshold is not 2"
[ "$(echo "$INFO" | jq -r '.policy.rules | length')" = "2" ] || die "policy does not have two rules"
[ "$(echo "$INFO" | jq -r '.policy.rules[].action' | sort -u)" = "ALLOW" ] || die "policy rules are not ALLOW only"
say "desk up on $DESK: quorum 2 of 2 ($(echo "$INFO" | jq -r '.quorum.enforcedBy')), policy $(echo "$INFO" | jq -r '.policy.name') ($(echo "$INFO" | jq -r '.policy.enforcedBy')): $(echo "$INFO" | jq -r '[.policy.rules[].name] | join("; ")')"

# ------------------------------------------------------------------ 3. evidence: Attested from the investor's wallet
NOW=$(cast block --rpc-url "$RPC" latest -f timestamp)
EXPIRY=$((NOW + 2592000))
DECISION="($POLICY,3,1,$EXPIRY,0x0000000000000000000000000000000000000000000000000000000000000000,false)"
INPUTS="[$(cast to-uint256 $INVESTOR),$POLICY,$(cast to-uint256 3),$(cast to-uint256 $EXPIRY)]"
ATT=$(send $K1 "$REGISTRY" "attestWithProof(address,(bytes32,uint256,uint8,uint64,bytes32,bool),bytes,bytes32[])" "$INVESTOR" "$DECISION" 0x01 "$INPUTS") || die "attestWithProof reverted"
[ "$(eligible $INVESTOR)" = "false" ] || die "eligible before any approval"
say "assert: Attested for the investor (mock proof, simulated evidence), tx $(echo "$ATT" | jq -r .transactionHash); not eligible"

P=$(wait_queue ".kind == \"approve\" and (.subject | ascii_downcase) == \"$(echo $INVESTOR | tr 'A-F' 'a-f')\"") || die "the desk did not propose an approve from the Attested event"
PID=$(echo "$P" | jq -r .id)
[ "$(echo "$P" | jq -r .source)" = "attested-event" ] || die "proposal source: $(echo "$P" | jq -r .source)"
[ "$(echo "$P" | jq -r .evidence.txHash)" = "$(echo "$ATT" | jq -r .transactionHash)" ] || die "proposal evidence does not point at the Attested tx"
say "assert: desk proposed approve $PID from the Attested event (0 of 2)"

# ------------------------------------------------------------------ 4. four eyes
C1=$(post "/queue/$PID/confirm" '{"role":"compliance"}')
[ "$(echo "$C1" | jq -r .status)" = "proposed" ] || die "after one confirmation status is $(echo "$C1" | jq -r .status)"
[ "$(echo "$C1" | jq -r '.confirmations.compliance != null')" = "true" ] || die "compliance confirmation not recorded"
sleep 1
[ "$(eligible $INVESTOR)" = "false" ] || die "eligible after one confirmation"
say "assert: compliance confirmed (1 of 2); nothing sent, not eligible"

post "/queue/$PID/confirm" '{"role":"operations"}' >/dev/null
P=$(wait_queue ".id == \"$PID\" and .status == \"confirmed\"") || die "approve not confirmed on chain: $(curl -sS "$DESK/queue" | jq -c ".[] | select(.id == \"$PID\") | {status, error}")"
APR_TX=$(echo "$P" | jq -r .txHash)
[ "$(eligible $INVESTOR)" = "true" ] || die "not eligible after approve"
APPROVED_BY=$(cast logs --rpc-url "$RPC" --from-block 0 --address "$REGISTRY" "$(cast sig-event 'Approved(address,bytes32,address)')" --json | jq -r '.[-1].topics[3]')
[ "${APPROVED_BY: -40}" = "$(echo ${OPERATOR#0x} | tr 'A-F' 'a-f')" ] || die "Approved event operator $APPROVED_BY is not the desk operator"
BAL_BEFORE=$(cast call --rpc-url "$RPC" "$TOKEN" "balanceOf(address)(uint256)" "$INVESTOR" | awk '{print $1}')
send $K1 "$SUBSCRIPTION" "subscribe()" >/dev/null || die "subscribe() reverted after approve"
say "assert: operations confirmed (2 of 2); approve $APR_TX mined by the operator wallet ($(echo "$P" | jq -r .gasUsed) gas); isEligible true; subscribe() mined"

# ------------------------------------------------------------------ 5. refusals
R=$(post /probe '{"kind":"transfer"}')
[ "$(echo "$R" | jq -r .refused)" = "true" ] && [ "$(echo "$R" | jq -r .by)" = "simulated-policy" ] || die "value transfer not refused by the policy: $R"
say "assert: 1 wei transfer from the operator wallet refused: $(echo "$R" | jq -r .message) (simulated)"
R=$(post /probe '{"kind":"attestByOperator"}')
[ "$(echo "$R" | jq -r .refused)" = "true" ] && [ "$(echo "$R" | jq -r .by)" = "simulated-policy" ] || die "attestByOperator not refused by the policy: $R"
say "assert: attestByOperator from the operator wallet refused: $(echo "$R" | jq -r .message) (simulated)"
R=$(post /probe '{"kind":"single-signature"}')
[ "$(echo "$R" | jq -r .refused)" = "true" ] && [ "$(echo "$R" | jq -r .by)" = "simulated-quorum" ] || die "one-signature approve not refused by the quorum: $R"
say "assert: approve with one signature refused: $(echo "$R" | jq -r .message) (simulated)"

# ------------------------------------------------------------------ 6. manual withdrawal, four eyes again
RV=$(post /queue/propose "{\"kind\":\"revoke\",\"subject\":\"$INVESTOR\"}")
RID=$(echo "$RV" | jq -r .id)
post "/queue/$RID/confirm" '{"role":"operations"}' >/dev/null
post "/queue/$RID/confirm" '{"role":"compliance"}' >/dev/null
P=$(wait_queue ".id == \"$RID\" and .status == \"confirmed\"") || die "revoke not confirmed: $(curl -sS "$DESK/queue" | jq -c ".[] | select(.id == \"$RID\") | {status, error}")"
[ "$(eligible $INVESTOR)" = "false" ] || die "eligible after revoke"
set +e; SUB=$(cast send --rpc-url "$RPC" --private-key $K1 "$SUBSCRIPTION" "subscribe()" --json 2>&1); rc=$?; set -e
[ $rc -ne 0 ] || die "subscribe() succeeded after revoke"
say "assert: revoke $(echo "$P" | jq -r .txHash) mined after two confirmations (manual withdrawal); isEligible false; subscribe() refused"

# ------------------------------------------------------------------ 7. no evidence, no approval, even with two signatures
SV=$(post /queue/propose "{\"kind\":\"approve\",\"subject\":\"$STRANGER\"}")
SID=$(echo "$SV" | jq -r .id)
post "/queue/$SID/confirm" '{"role":"compliance"}' >/dev/null
post "/queue/$SID/confirm" '{"role":"operations"}' >/dev/null
P=$(wait_queue ".id == \"$SID\" and (.status == \"reverted\" or .status == \"refused\")") || die "stranger approve did not fail: $(curl -sS "$DESK/queue" | jq -c ".[] | select(.id == \"$SID\") | {status, error}")"
echo "$P" | jq -r .error | grep -q "NoDecision" || die "stranger approve failed without NoDecision: $(echo "$P" | jq -r .error)"
[ "$(eligible $STRANGER)" = "false" ] || die "stranger eligible"
say "assert: approve for a stranger address with two confirmations: $(echo "$P" | jq -r .status), $(echo "$P" | jq -r .error | head -c 120)"

echo "SHOWCASE-BACKOFFICE-LOCAL PASS"

if [ "$KEEP" = 1 ]; then
  (cd "$ROOT/app" && VITE_MOCK=0 VITE_CHAIN_ID=$CHAIN_ID VITE_RPC_URL=$RPC VITE_REGISTRY=$REGISTRY VITE_FUND_TOKEN=$TOKEN VITE_SUBSCRIPTION=$SUBSCRIPTION VITE_POLICY_ID=$POLICY VITE_BACKOFFICE_URL=$DESK \
    bun run dev -- --port "$APP_PORT" --strictPort > "$RUN_DIR/app.log" 2>&1) & echo $! >> "$PIDS"
  say "app starting: http://127.0.0.1:$APP_PORT/showcase/backoffice (log $RUN_DIR/app.log)"
  wait
fi
