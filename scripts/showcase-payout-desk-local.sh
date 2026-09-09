#!/usr/bin/env bash
# Showcase "contractor payout desk" on a local anvil, evidence class L (docs/process.md): no wallet, no device,
# no public chain, no Privy app. The treasury is anvil key 3 and the desk's local evaluator plays the Privy policy
# ("simulated Privy policy (local)").
#
#   anvil -> Deploy.s.sol (AttestationRegistry) -> DeployPayout.s.sol (MockStable mUSD, GatedPayout, 10,000 mUSD to
#   the treasury) -> contractor 1 attested and approved (attestByOperator), contractor 2 never attested ->
#   payout desk service in local mode (allowance for the gate set through the policy) ->
#   officer A proposes a run for both (100 mUSD each) -> officer A's second approval refused (403) ->
#   officer B approves: run executed, contractor 1 paid 100 mUSD, contractor 2 refused by GatedPayout with
#   NotEligible(address) -> revoke contractor 1 (operator) -> new run: refused by the gate, nothing paid ->
#   over-cap run refused by the (simulated) policy -> bypass attempts (transfer on the stablecoin, a registry call
#   from the treasury) refused by the (simulated) policy -> SHOWCASE-PAYOUT-DESK-LOCAL PASS
#
# Usage: scripts/showcase-payout-desk-local.sh [--keep]
#   --keep    leave anvil and the desk running afterwards (URLs and pids are printed; open the app at
#             /showcase/payout-desk with VITE_PAYOUT_DESK_URL=http://127.0.0.1:$DESK_PORT)
# Env: ANVIL_PORT (default 8550), DESK_PORT (default 8792), RUN_DIR (default .e2e/payout-desk-local)
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/payout-desk-local}"
ANVIL_PORT="${ANVIL_PORT:-8550}"
DESK_PORT="${DESK_PORT:-8792}"
RPC="http://127.0.0.1:$ANVIL_PORT"
DESK="http://127.0.0.1:$DESK_PORT"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast jq curl bun; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }; done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, operator (issuer desk)
K3=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6   # anvil 3: the company treasury
TREASURY=0x90F79bf6EB2c4f870365E785982E1f101E93b906
C1=0x70997970C51812dc3A010C7d01b50e0d17dc79C8                            # anvil 1: contractor 1, attested and approved
C2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                            # anvil 2: contractor 2, never attested
POLICY=$(cast keccak "nachweis.pid.over18.v1")
CHAIN_ID=31337
CAP=1000000000          # 1000 mUSD per run
AMOUNT=100000000        # 100 mUSD
TOKEN_A=officer-a
TOKEN_B=officer-b

mkdir -p "$RUN_DIR"
PIDS="$RUN_DIR/pids"
: > "$PIDS"
T0=$(date +%s)
say() { printf '\033[1;36m[payout-desk-local]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[payout-desk-local] FAIL:\033[0m %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [ "$KEEP" = 1 ]; then echo "kept running: anvil $RPC, desk $DESK (pids in $PIDS)"; return; fi
  while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDS"
}
trap cleanup EXIT

status_of() { cast call --rpc-url "$RPC" "$REGISTRY" "statusOf(address,bytes32)(bool,bool,bool,uint64)" "$1" "$POLICY" | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//'; }
eligible() { cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$1" "$POLICY" 3; }
balance() { cast call --rpc-url "$RPC" "$TOKEN" "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
post() { # officer-token path json
  curl -s -H "authorization: Bearer $1" -H 'content-type: application/json' -X POST --data "$3" "$DESK$2"
}
post_rc() { # officer-token path json -> prints status code, body in $RUN_DIR/last.json
  curl -s -o "$RUN_DIR/last.json" -w '%{http_code}' -H "authorization: Bearer $1" -H 'content-type: application/json' -X POST --data "$3" "$DESK$2"
}

# ------------------------------------------------------------------ 1. anvil and contracts
if curl -fs -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPC" >/dev/null 2>&1; then
  die "something already listens on $RPC (set ANVIL_PORT)"
fi
anvil --port "$ANVIL_PORT" --chain-id "$CHAIN_ID" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
say "anvil on $RPC"

DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] || die "no registry address in the Deploy.s.sol output"
PAYOUT_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY REGISTRY_ADDRESS=$REGISTRY TREASURY=$TREASURY \
  forge script script/DeployPayout.s.sol:DeployPayout --rpc-url "$RPC" --broadcast 2>&1) || { echo "$PAYOUT_OUT" | tail -20; die "DeployPayout.s.sol failed"; }
TOKEN=$(echo "$PAYOUT_OUT" | awk '/PayoutToken:/ {print $2}' | head -1)
GATE=$(echo "$PAYOUT_OUT" | awk '/GatedPayout:/ {print $2}' | head -1)
[ -n "$TOKEN" ] && [ -n "$GATE" ] || die "missing addresses in the DeployPayout.s.sol output"
say "AttestationRegistry $REGISTRY, mUSD $TOKEN, GatedPayout $GATE, treasury $TREASURY holds $(balance "$TREASURY") units"
[ "$(balance "$TREASURY")" = "10000000000" ] || die "treasury was not funded"

# ------------------------------------------------------------------ 2. contractors: one attested and approved, one not
EXPIRY=$(( $(date +%s) + 30 * 24 * 3600 ))
cast send --rpc-url "$RPC" --private-key "$K0" "$REGISTRY" \
  "attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))" "$C1" "($POLICY,3,1,$EXPIRY,$(cast keccak "status/c1"),false)" --json > "$RUN_DIR/attest-c1.json"
[ "$(eligible "$C1")" = "true" ] || die "contractor 1 is not eligible after attestByOperator: $(status_of "$C1")"
[ "$(eligible "$C2")" = "false" ] || die "contractor 2 should not be eligible"
say "contractor 1 $C1: attested and approved (operator path, captioned manual); contractor 2 $C2: no decision"

# ------------------------------------------------------------------ 3. the desk in local mode
if curl -fs "$DESK/health" >/dev/null 2>&1; then die "something already listens on $DESK (set DESK_PORT)"; fi
(cd "$ROOT/showcase/payout-desk" && [ -d node_modules ] || bun install --silent)
(cd "$ROOT/showcase/payout-desk" && exec env PAYOUT_SIGNER=local RPC_URL=$RPC CHAIN_ID=$CHAIN_ID REGISTRY=$REGISTRY GATED_PAYOUT=$GATE PAYOUT_TOKEN=$TOKEN \
  POLICY_ID=$POLICY REQUIRED_BITS=3 PAYOUT_CAP=$CAP LOCAL_TREASURY_KEY=$K3 OFFICER_A_TOKEN=$TOKEN_A OFFICER_B_TOKEN=$TOKEN_B PORT=$DESK_PORT \
  CONTRACTORS="Contractor 1:$C1,Contractor 2:$C2" bun src/server.ts > "$RUN_DIR/desk.log" 2>&1) & echo $! >> "$PIDS"
for _ in $(seq 1 100); do curl -fs "$DESK/health" >/dev/null 2>&1 && break; sleep 0.2; done
curl -fs "$DESK/health" >/dev/null || { tail -20 "$RUN_DIR/desk.log"; die "the desk did not start"; }
# the allowance for the gate is issued at startup through the (simulated) policy
for _ in $(seq 1 50); do [ "$(curl -fs "$DESK/state" | jq -r '.treasury.allowance')" != "0" ] && break; sleep 0.2; done
STATE=$(curl -fs "$DESK/state")
[ "$(echo "$STATE" | jq -r .mode)" = "local" ] || die "desk mode is not local"
[ "$(echo "$STATE" | jq -r '.treasury.allowance')" != "0" ] || { tail -20 "$RUN_DIR/desk.log"; die "allowance for the gate was not set"; }
[ "$(echo "$STATE" | jq -r '.contractors | length')" = "2" ] || die "expected two contractors"
[ "$(echo "$STATE" | jq -r '.contractors[0].eligible')" = "true" ] && [ "$(echo "$STATE" | jq -r '.contractors[1].eligible')" = "false" ] || die "contractor eligibility on the desk is wrong"
grep -q 'allowance for the gate set through the policy' "$RUN_DIR/desk.log" || die "allowance was not issued through the policy checker"
say "desk on $DESK (local mode): allowance for the gate set through the simulated policy; approval: $(echo "$STATE" | jq -r .approval.mode)"

# ------------------------------------------------------------------ 4. run 1: both contractors, officer A proposes, officer B approves
RUN1=$(post $TOKEN_A /runs "{\"items\":[{\"contractorId\":\"c1\",\"amount\":\"$AMOUNT\"},{\"contractorId\":\"c2\",\"amount\":\"$AMOUNT\"}]}")
RUN1_ID=$(echo "$RUN1" | jq -r .id)
[ "$(echo "$RUN1" | jq -r .state)" = "proposed" ] && [ "$(echo "$RUN1" | jq -r '.approvals|join(",")')" = "A" ] || die "run 1 not proposed: $RUN1"
RC=$(post_rc $TOKEN_A "/runs/$RUN1_ID/approve" '{}')
[ "$RC" = "403" ] || die "officer A approving their own run answered $RC, expected 403"
say "run $RUN1_ID proposed by officer A (1 of 2); officer A's own second approval refused (403: $(jq -r .error "$RUN_DIR/last.json" | cut -c1-70))"
RUN1=$(post $TOKEN_B "/runs/$RUN1_ID/approve" '{}')
[ "$(echo "$RUN1" | jq -r .state)" = "executed" ] || { echo "$RUN1"; tail -20 "$RUN_DIR/desk.log"; die "run 1 did not execute"; }
TX1=$(echo "$RUN1" | jq -r .txHash)
[ "$(echo "$RUN1" | jq -r '.items[0].verdict')" = "eligible" ] || die "contractor 1 was not paid"
[ "$(echo "$RUN1" | jq -r '.items[1].verdict')" = "refused" ] || die "contractor 2 was not refused"
REASON2=$(echo "$RUN1" | jq -r '.items[1].reason')
[[ "$REASON2" == NotEligible\(* ]] || die "contractor 2's refusal is not the gate's NotEligible: $REASON2"
[ "$(balance "$C1")" = "$AMOUNT" ] || die "contractor 1 balance $(balance "$C1"), expected $AMOUNT"
[ "$(balance "$C2")" = "0" ] || die "contractor 2 balance $(balance "$C2"), expected 0"
[ "$(echo "$RUN1" | jq -r .paidTotal)" = "$AMOUNT" ] || die "paidTotal wrong"
RECEIPTS=$(curl -fs "$DESK/state" | jq '.receipts | length')
[ "$RECEIPTS" = "1" ] || die "expected 1 receipt, got $RECEIPTS"
say "run $RUN1_ID executed by officer B (2 of 2): contractor 1 paid 100 mUSD (tx $TX1), contractor 2 refused by GatedPayout: $REASON2"

# ------------------------------------------------------------------ 5. revoke contractor 1 (issuer desk, manual), run 2 refused by the gate
cast send --rpc-url "$RPC" --private-key "$K0" "$REGISTRY" "revoke(address,bytes32)" "$C1" "$POLICY" --json > "$RUN_DIR/revoke-c1.json"
[ "$(eligible "$C1")" = "false" ] || die "contractor 1 still eligible after revoke"
RUN2=$(post $TOKEN_A /runs "{\"items\":[{\"contractorId\":\"c1\",\"amount\":\"$AMOUNT\"}]}")
RUN2_ID=$(echo "$RUN2" | jq -r .id)
RUN2=$(post $TOKEN_B "/runs/$RUN2_ID/approve" '{}')
[ "$(echo "$RUN2" | jq -r .state)" = "refused" ] && [ "$(echo "$RUN2" | jq -r .refusedBy)" = "gate" ] || { echo "$RUN2"; die "run 2 was not refused by the gate"; }
[[ "$(echo "$RUN2" | jq -r .error)" == NotEligible\(* ]] || die "run 2 refusal text: $(echo "$RUN2" | jq -r .error)"
[ "$(balance "$C1")" = "$AMOUNT" ] || die "contractor 1 was paid after revoke"
[ "$(curl -fs "$DESK/state" | jq -r '.contractors[0].status.revoked')" = "true" ] || die "desk does not show contractor 1 as revoked"
say "revoked contractor 1 (manual, operator key); run $RUN2_ID refused by GatedPayout: $(echo "$RUN2" | jq -r .error); nothing paid"

# ------------------------------------------------------------------ 6. over the cap: refused by the (simulated) policy
cast send --rpc-url "$RPC" --private-key "$K0" "$REGISTRY" "approve(address,bytes32)" "$C1" "$POLICY" --json > "$RUN_DIR/reapprove-c1.json"
[ "$(eligible "$C1")" = "true" ] || die "contractor 1 not eligible after re-approve"
RUN3=$(post $TOKEN_B /runs "{\"items\":[{\"contractorId\":\"c1\",\"amount\":\"$((CAP + 1))\"}]}")
RUN3_ID=$(echo "$RUN3" | jq -r .id)
RUN3=$(post $TOKEN_A "/runs/$RUN3_ID/approve" '{}')
[ "$(echo "$RUN3" | jq -r .state)" = "refused" ] && [ "$(echo "$RUN3" | jq -r .refusedBy)" = "policy" ] || { echo "$RUN3"; die "over-cap run was not refused by the policy"; }
echo "$RUN3" | jq -r .error | grep -q 'simulated Privy policy (local)' || die "over-cap refusal is not captioned simulated: $(echo "$RUN3" | jq -r .error)"
[ "$(balance "$C1")" = "$AMOUNT" ] || die "contractor 1 was paid over the cap"
say "re-approved contractor 1; run $RUN3_ID over the cap refused: $(echo "$RUN3" | jq -r .error)"

# ------------------------------------------------------------------ 7. outside the gate: refused by the (simulated) policy
BP1=$(post $TOKEN_A /bypass "{\"kind\":\"transfer\",\"address\":\"$C1\",\"amount\":\"$AMOUNT\"}")
[ "$(echo "$BP1" | jq -r .refused)" = "true" ] && [ "$(echo "$BP1" | jq -r .refusedBy)" = "policy" ] || { echo "$BP1"; die "direct transfer was not refused by the policy"; }
BP2=$(post $TOKEN_A /bypass "{\"kind\":\"registry\",\"address\":\"$C2\"}")
[ "$(echo "$BP2" | jq -r .refused)" = "true" ] && [ "$(echo "$BP2" | jq -r .refusedBy)" = "policy" ] || { echo "$BP2"; die "registry call was not refused by the policy"; }
[ "$(balance "$C1")" = "$AMOUNT" ] || die "the direct transfer moved money"
[ "$(eligible "$C2")" = "false" ] || die "the treasury approved a contractor"
say "bypass 1 (transfer on the stablecoin): $(echo "$BP1" | jq -r .reason)"
say "bypass 2 (approve on the registry from the treasury): $(echo "$BP2" | jq -r .reason)"

# ------------------------------------------------------------------ 8. the desk never saw a name
NAMES=$( (grep -ci 'erika\|mustermann\|given_name\|family_name' "$RUN_DIR/desk.log" || true) | tail -1)
[ "${NAMES:-0}" = "0" ] || die "a name marker appears in the desk log"

jq -n --arg registry "$REGISTRY" --arg token "$TOKEN" --arg gate "$GATE" --arg treasury "$TREASURY" --arg run1 "$RUN1_ID" --arg tx1 "$TX1" --arg run2 "$RUN2_ID" --arg run3 "$RUN3_ID" \
  --arg total "$(( $(date +%s) - T0 ))" \
  '{registry:$registry, token:$token, gate:$gate, treasury:$treasury, run1:$run1, run1_tx:$tx1, run2_refused:$run2, run3_over_cap:$run3, total_seconds:($total|tonumber)}' > "$RUN_DIR/summary.json"
say "summary in $RUN_DIR/summary.json"
echo "SHOWCASE-PAYOUT-DESK-LOCAL PASS ($(( $(date +%s) - T0 )) s: paid 100 mUSD to the attested contractor, refused the unattested one, refused after revoke, refused over the cap, refused outside the gate)"
if [ "$KEEP" = 1 ]; then
  echo "app: cd app && VITE_PAYOUT_DESK_URL=$DESK VITE_RPC_URL=$RPC VITE_CHAIN_ID=$CHAIN_ID VITE_REGISTRY=$REGISTRY bun run dev, then open /showcase/payout-desk"
fi
