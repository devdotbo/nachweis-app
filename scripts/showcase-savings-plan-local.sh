#!/usr/bin/env bash
# The attested savings plan on a local chain (docs/showcase/savings-plan.md): one decision, four doors,
# one revoke. Automation in local mode, no Privy app (evidence class L).
#
#   anvil -> Deploy.s.sol (registry, FundToken, Subscription; operator = anvil key 0)
#   -> DeploySecondIssuer.s.sol (FundToken B and Subscription B on the same registry; issuer B = anvil key 4)
#   -> EudiAllowlistChecker (forge create; the contract the Uniswap PermissionsAdapter calls before a swap)
#   -> automation/ (bun) with AUTOMATION_SIGNER=local: a dev key (anvil key 1) signs for investor A and the
#      rule JSON is applied by the evaluator in automation/src/policy.ts, "simulated Privy policy (local)"
#   -> attestByOperator for investor A (expiry = chain time + 180 s) and for investor B (anvil key 2,
#      "second investor attested by the operator for the demo")
#   -> two plan runs (POST /tick): 200 NDF
#   -> Issuer B: subscribe() on Subscription B from A's wallet: 50 NDF-B
#   -> transfer 20 NDF from A to B (attested): confirmed; to an unattested address: refused (NotEligible)
#   -> pool door: checker.checkAllowlist(A, NDF) = 0x0003 (swap and liquidity allowed)
#   -> revoke A: plan tick refused by the policy and by the chain, Issuer B refused, transfer to A refused,
#      checker 0x0000; one transaction, four doors
#   -> approve A again: tick OK (280 NDF), checker 0x0003
#   -> evm_increaseTime past the expiry: every door closed again, captioned "Expiry demonstrated on a local chain"
#   -> prints SHOWCASE-SAVINGS-PLAN-LOCAL PASS
#
# Usage: scripts/showcase-savings-plan-local.sh [--keep] [--app]
#   --keep    leave anvil and the automation running (URLs and pids printed)
#   --app     also start the Vite dev server with the dev signer and print /showcase/savings-plan (implies --keep)
# Env: RUN_DIR (default .e2e/showcase-savings-plan, gitignored), ANVIL_PORT (default 8554), AUTOMATION_PORT (default 8796), APP_PORT (default: a free port).
# Nothing touches a public chain: every transaction goes to the local anvil. No Privy call is made.
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/showcase-savings-plan}"
KEEP=0; APP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --app) APP=1; KEEP=1; shift ;;
    -h|--help) sed -n '2,27p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast bun jq curl python3; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, operator, issuer A
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: investor A (the automation's local key)
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a   # anvil 2: investor B (attested by the operator)
K4=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a   # anvil 4: issuer B
A=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
B=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
NOBODY=0x90F79bf6EB2c4f870365E785982E1f101E93b906                        # anvil 3: never attested
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
ZERO32=0x0000000000000000000000000000000000000000000000000000000000000000
free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
# Ports per the lead's allocation for the demo scripts (anvil 8554, automation 8796); the app port is free unless set.
ANVIL_PORT="${ANVIL_PORT:-8554}"; AUTOMATION_PORT="${AUTOMATION_PORT:-8796}"; APP_PORT="${APP_PORT:-$(free_port)}"
RPC="http://127.0.0.1:$ANVIL_PORT"
AUTO="http://127.0.0.1:$AUTOMATION_PORT"
APP_URL="http://127.0.0.1:$APP_PORT"

mkdir -p "$RUN_DIR"
PIDS="$RUN_DIR/pids"
T0=$(date +%s)
say() { echo "[$(( $(date +%s) - T0 )) s] $*"; }
die() { echo "FAIL: $*" >&2; [ $KEEP -eq 1 ] || stop_all; exit 1; }
stop_all() {
  if [ -f "$PIDS" ]; then
    while read -r pid; do [ -n "$pid" ] && { pkill -P "$pid" 2>/dev/null || true; kill "$pid" 2>/dev/null || true; }; done < "$PIDS"
    : > "$PIDS"
  fi
}
stop_all
trap 'echo "FAIL: exit $? at line $LINENO: $BASH_COMMAND" >&2' ERR
trap 'rc=$?; [ $KEEP -eq 1 ] || stop_all; [ $rc -eq 0 ] || echo "exit $rc; logs in $RUN_DIR" >&2' EXIT
wait_http() { for _ in $(seq 1 $(( $2 * 5 ))); do curl -fs "$1" >/dev/null 2>&1 && return 0; sleep 0.2; done; return 1; }

balance() { cast call --rpc-url "$RPC" "$1" "balanceOf(address)(uint256)" "$2" | awk '{print $1}'; }
eligible() { cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$1" "$POLICY" 3; }
checker_flags() { cast call --rpc-url "$RPC" "$CHECKER" "checkAllowlist(address,address)(bytes2)" "$1" "$TOKEN"; }
chain_time() { cast block latest --rpc-url "$RPC" -f timestamp; }
# refused: the chain's own answer (eth_call as `from`) must revert; the revert data is printed for the log
refused() { # from, to, sig, args... -> 0 when the call reverts
  local out; if out=$(cast call --rpc-url "$RPC" --from "$1" "$2" "${@:3}" 2>&1); then return 1; fi
  echo "$out" | tail -1 | cut -c1-140 > "$RUN_DIR/last-revert.txt"; return 0
}
TICK_N=0
tick() { # address -> writes $RUN_DIR/tick-N.json; the outcome is in $OUT
  TICK_N=$(( TICK_N + 1 ))
  curl -fs -X POST -H 'content-type: application/json' --data "{\"address\":\"$1\"}" "$AUTO/tick" > "$RUN_DIR/tick-$TICK_N.json" || die "POST /tick failed (automation log: $RUN_DIR/automation.log)"
  OUT=$(jq -r --arg a "$1" '.results[] | select(.address | ascii_downcase == ($a | ascii_downcase)) | .outcome' "$RUN_DIR/tick-$TICK_N.json")
  DETAIL=$(jq -r --arg a "$1" '.results[] | select(.address | ascii_downcase == ($a | ascii_downcase)) | .detail' "$RUN_DIR/tick-$TICK_N.json")
}
wait_policy() { for _ in $(seq 1 $(( $2 * 2 ))); do curl -fs "$AUTO/policy/$1" >/dev/null 2>&1 && return 0; sleep 0.5; done; return 1; }
wait_log() { for _ in $(seq 1 $(( $2 * 2 ))); do grep -q "$1" "$RUN_DIR/automation.log" 2>/dev/null && return 0; sleep 0.5; done; return 1; }
NOT_ELIGIBLE_SIG=$(cast sig "NotEligible(address)")
NOT_ELIGIBLE_SUB_SIG=$(cast sig "NotEligible()")

# ------------------------------------------------------------------ 1. anvil
anvil --port "$ANVIL_PORT" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || die "anvil did not come up ($RUN_DIR/anvil.log)"
say "anvil on $RPC"

# ------------------------------------------------------------------ 2. contracts: issuer A, issuer B, the checker
DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$TOKEN" ] && [ -n "$SUBSCRIPTION" ] || die "missing addresses in the Deploy.s.sol output"
DEPLOY_B=$(cd "$ROOT/contracts" && ISSUER_B_PRIVATE_KEY=$K4 REGISTRY_ADDRESS=$REGISTRY POLICY_ID=$POLICY forge script script/DeploySecondIssuer.s.sol:DeploySecondIssuer --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_B" | tail -20; die "DeploySecondIssuer.s.sol failed"; }
TOKEN_B=$(echo "$DEPLOY_B" | awk '/FundTokenB:/ {print $2}' | head -1)
SUBSCRIPTION_B=$(echo "$DEPLOY_B" | awk '/SubscriptionB:/ {print $2}' | head -1)
[ -n "$TOKEN_B" ] && [ -n "$SUBSCRIPTION_B" ] || die "missing addresses in the DeploySecondIssuer.s.sol output"
CHECKER_OUT=$(cd "$ROOT/contracts" && forge create src/uniswap/EudiAllowlistChecker.sol:EudiAllowlistChecker --rpc-url "$RPC" --private-key $K0 --broadcast --constructor-args "$REGISTRY" "$POLICY" 3 2>&1) || { echo "$CHECKER_OUT" | tail -10; die "forge create EudiAllowlistChecker failed"; }
CHECKER=$(echo "$CHECKER_OUT" | awk '/Deployed to:/ {print $3}' | head -1)
[ -n "$CHECKER" ] || die "missing checker address in the forge create output"
[ "$(cast call --rpc-url "$RPC" "$TOKEN_B" "registry()(address)")" = "$(cast to-check-sum-address "$REGISTRY")" ] || die "FundToken B does not read the shared registry"
say "issuer A: registry $REGISTRY, NDF $TOKEN, Subscription $SUBSCRIPTION"
say "issuer B: NDF-B $TOKEN_B, Subscription B $SUBSCRIPTION_B (same registry, same policy id; issuer B = anvil key 4)"
say "pool door: EudiAllowlistChecker $CHECKER (the adapter's read; no pool on this local chain)"

# ------------------------------------------------------------------ 3. automation, local mode
[ -d "$ROOT/automation/node_modules/viem" ] || (cd "$ROOT/automation" && bun install --silent) || die "bun install failed in automation/"
: > "$RUN_DIR/automation.log"
(cd "$ROOT/automation" && exec env AUTOMATION_SIGNER=local RPC_URL="$RPC" CHAIN_ID=31337 REGISTRY="$REGISTRY" SUBSCRIPTION="$SUBSCRIPTION" FUND_TOKEN="$TOKEN" \
  POLICY_ID="$POLICY" POLL_MS=1000 LOCAL_INVESTOR_KEYS="$K1" PORT="$AUTOMATION_PORT" bun run src/server.ts >> "$RUN_DIR/automation.log" 2>&1) & echo $! >> "$PIDS"
wait_http "$AUTO/health" 30 || die "automation did not come up ($RUN_DIR/automation.log)"
[ "$(curl -fs "$AUTO/status" | jq -r .mode)" = local ] || die "automation is not in local mode"
[ "$(curl -fs "$AUTO/status" | jq -r .planAmount)" = "100000000000000000000" ] || die "automation did not read demoAmount (planAmount)"
say "automation on $AUTO (local mode: simulated Privy policy, dev key = anvil key 1, plan amount 100 NDF per run)"

# ------------------------------------------------------------------ 4. attest A and B by the operator
EXPIRY=$(( $(chain_time) + 180 ))
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))" \
  "$A" "($POLICY,3,1,$EXPIRY,$ZERO32,false)" --json > "$RUN_DIR/attest-a.json" || die "attestByOperator (A) failed"
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))" \
  "$B" "($POLICY,3,1,$(( $(chain_time) + 86400 )),$ZERO32,false)" --json > "$RUN_DIR/attest-b.json" || die "attestByOperator (B) failed"
[ "$(eligible "$A")" = true ] && [ "$(eligible "$B")" = true ] || die "isEligible false after attestByOperator"
wait_policy "$A" 15 || die "the watcher did not create a policy for A within 15 s ($RUN_DIR/automation.log)"
curl -fs "$AUTO/policy/$A" > "$RUN_DIR/policy-a.json"
[ "$(jq -r '.rules | length' "$RUN_DIR/policy-a.json")" = 2 ] && [ "$(jq -r .delegated "$RUN_DIR/policy-a.json")" = true ] || die "policy for A is not the two-rule delegated policy: $(jq -c . "$RUN_DIR/policy-a.json")"
say "investor A attested and approved (expiry $EXPIRY); investor B attested by the operator for the demo; policy $(jq -r .policyId "$RUN_DIR/policy-a.json") mirrors A's decision"

# ------------------------------------------------------------------ 5. door one: two plan runs
for i in 1 2; do tick "$A"; [ "$OUT" = ok ] || die "plan run $i: $OUT ($DETAIL)"; done
[ "$(balance "$TOKEN" "$A")" = "200000000000000000000" ] || die "balance after two runs is not 200 NDF"
RUNS=$(curl -fs "$AUTO/runs/$A" | jq -r '[.runs[] | "\(.n):\(.outcome)"] | join(" ")')
[ "$RUNS" = "1:ok 2:ok" ] || die "run history: $RUNS"
say "door one, plan: two runs OK, balance 200 NDF, history $RUNS"

# ------------------------------------------------------------------ 6. door two: Issuer B's instrument
cast send --rpc-url "$RPC" --private-key $K1 "$SUBSCRIPTION_B" "subscribe()" --json > "$RUN_DIR/subscribe-b.json" || die "subscribe() on Subscription B failed"
[ "$(balance "$TOKEN_B" "$A")" = "50000000000000000000" ] || die "NDF-B balance is not 50"
refused "$NOBODY" "$SUBSCRIPTION_B" "subscribe()" || die "Subscription B accepted an unattested caller"
say "door two, Issuer B: subscribe confirmed $(jq -r .transactionHash "$RUN_DIR/subscribe-b.json" | cut -c1-12).., 50 NDF-B; an unattested caller is refused"

# ------------------------------------------------------------------ 7. door three: the pool's checker
[ "$(checker_flags "$A")" = 0x0003 ] || die "checker flags for A: $(checker_flags "$A"), expected 0x0003"
[ "$(checker_flags "$NOBODY")" = 0x0000 ] || die "checker flags for an unattested address: $(checker_flags "$NOBODY"), expected 0x0000"
say "door three, pool: checkAllowlist(A) = 0x0003 (swap and liquidity allowed); unattested = 0x0000"

# ------------------------------------------------------------------ 8. door four: transfer to a second attested wallet, refused for an unattested one
cast send --rpc-url "$RPC" --private-key $K1 "$TOKEN" "transfer(address,uint256)" "$B" 20000000000000000000 --json > "$RUN_DIR/transfer-ab.json" || die "transfer A -> B failed"
[ "$(balance "$TOKEN" "$A")" = "180000000000000000000" ] && [ "$(balance "$TOKEN" "$B")" = "20000000000000000000" ] || die "balances after the transfer are not 180 / 20"
refused "$A" "$TOKEN" "transfer(address,uint256)" "$NOBODY" 20000000000000000000 || die "a transfer to an unattested address went through"
grep -q "$NOT_ELIGIBLE_SIG" "$RUN_DIR/last-revert.txt" || die "the refusal is not NotEligible(address): $(cat "$RUN_DIR/last-revert.txt")"
say "door four, transfer: 20 NDF to B confirmed (A 180, B 20); to an unattested address refused with NotEligible(address)"

# ------------------------------------------------------------------ 9. revoke A: one transaction, four doors
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "revoke(address,bytes32)" "$A" "$POLICY" --json > "$RUN_DIR/revoke.json" || die "revoke failed"
wait_log "POLICY DENY-ALL ADDED" 15 || die "the watcher did not append the deny-all rule within 15 s"
[ "$(eligible "$A")" = false ] || die "isEligible still true after revoke"
tick "$A"; [ "$OUT" = denied-policy ] || die "plan run after revoke: $OUT ($DETAIL)"
echo "$DETAIL" | grep -q 'decision revoked' || die "the plan refusal is not by the deny-all rule: $DETAIL"
[ "$(jq -r --arg a "$A" '.results[] | select(.address | ascii_downcase == ($a | ascii_downcase)) | .chain.allows' "$RUN_DIR/tick-$TICK_N.json")" = false ] || die "the chain would still allow subscribe() after revoke"
refused "$A" "$SUBSCRIPTION_B" "subscribe()" || die "Issuer B accepted a revoked investor"
grep -q "$NOT_ELIGIBLE_SUB_SIG" "$RUN_DIR/last-revert.txt" || die "Issuer B's refusal is not NotEligible(): $(cat "$RUN_DIR/last-revert.txt")"
refused "$B" "$TOKEN" "transfer(address,uint256)" "$A" 1000000000000000000 || die "a transfer to the revoked wallet went through"
[ "$(checker_flags "$A")" = 0x0000 ] || die "checker still open after revoke"
[ "$(balance "$TOKEN" "$A")" = "180000000000000000000" ] || die "balance changed after refused runs"
say "revoke $(jq -r .transactionHash "$RUN_DIR/revoke.json" | cut -c1-12)..: plan run refused ($DETAIL), Issuer B refused (NotEligible), transfer to A refused, checker 0x0000. One transaction, four doors."

# ------------------------------------------------------------------ 10. reopen: approve again
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "approve(address,bytes32)" "$A" "$POLICY" --json > "$RUN_DIR/approve.json" || die "approve failed"
wait_log "POLICY DENY-ALL REMOVED" 15 || die "the watcher did not remove the deny-all rule within 15 s"
tick "$A"; [ "$OUT" = ok ] || die "plan run after re-approve: $OUT ($DETAIL)"
[ "$(balance "$TOKEN" "$A")" = "280000000000000000000" ] || die "balance after the re-approve run is not 280 NDF"
[ "$(checker_flags "$A")" = 0x0003 ] || die "checker closed after re-approve"
say "reopen (manual: issuer reopens): deny-all removed, plan run OK, balance 280 NDF, checker 0x0003"

# ------------------------------------------------------------------ 11. expiry, on the local chain only
cast rpc --rpc-url "$RPC" evm_increaseTime 200 >/dev/null && cast rpc --rpc-url "$RPC" evm_mine >/dev/null
NOW=$(chain_time); [ "$NOW" -ge "$EXPIRY" ] || die "chain time $NOW did not pass the expiry $EXPIRY"
[ "$(eligible "$A")" = false ] || die "isEligible still true after expiry"
tick "$A"; [ "$OUT" = denied-policy ] || die "plan run after expiry: $OUT ($DETAIL)"
echo "$DETAIL" | grep -q 'decision expired' || die "the plan refusal is not by the timestamp rule: $DETAIL"
refused "$A" "$SUBSCRIPTION_B" "subscribe()" || die "Issuer B accepted an expired decision"
refused "$B" "$TOKEN" "transfer(address,uint256)" "$A" 1000000000000000000 || die "a transfer to the expired wallet went through"
[ "$(checker_flags "$A")" = 0x0000 ] || die "checker still open after expiry"
[ "$(eligible "$B")" = true ] || die "investor B's decision should still be live (its own expiry)"
say "expiry demonstrated on a local chain: clock $NOW >= $EXPIRY; plan refused ($DETAIL), Issuer B refused, transfer to A refused, checker 0x0000; B's own decision unaffected"

# ------------------------------------------------------------------ done
RUNS=$(curl -fs "$AUTO/runs/$A" | jq -r '[.runs[] | "\(.n):\(.outcome)"] | join(" ")')
[ "$RUNS" = "1:ok 2:ok 3:denied-policy 4:ok 5:denied-policy" ] || die "run history: $RUNS"
jq -n --arg registry "$REGISTRY" --arg token "$TOKEN" --arg subscription "$SUBSCRIPTION" --arg tokenB "$TOKEN_B" --arg subscriptionB "$SUBSCRIPTION_B" --arg checker "$CHECKER" \
  --arg rpc "$RPC" --arg automation "$AUTO" --arg a "$A" --arg b "$B" --arg runs "$RUNS" \
  '{rpc:$rpc, automation:$automation, registry:$registry, fundToken:$token, subscription:$subscription, fundTokenB:$tokenB, subscriptionB:$subscriptionB, checker:$checker, investorA:$a, investorB:$b, runs:$runs}' > "$RUN_DIR/env.json"
say "run history for A: $RUNS; addresses in $RUN_DIR/env.json"
echo "SHOWCASE-SAVINGS-PLAN-LOCAL PASS"

if [ $APP -eq 1 ]; then
  [ -d "$ROOT/app/node_modules/vite" ] || (cd "$ROOT/app" && bun install --silent) || die "bun install failed in app/"
  # VITE_PRIVY_APP_ID is forced empty: with an app id the dev signer is not offered; the board then runs without Privy (class L).
  (cd "$ROOT/app" && exec env -u VITE_MOCK VITE_PRIVY_APP_ID= VITE_BRIDGE_URL= VITE_CHAIN_ID=31337 VITE_RPC_URL="$RPC" \
    VITE_REGISTRY="$REGISTRY" VITE_FUND_TOKEN="$TOKEN" VITE_SUBSCRIPTION="$SUBSCRIPTION" VITE_POLICY_ID="$POLICY" VITE_REQUIRED_BITS=3 \
    VITE_FUND_TOKEN_B="$TOKEN_B" VITE_SUBSCRIPTION_B="$SUBSCRIPTION_B" VITE_CHECKER="$CHECKER" VITE_SHOWCASE_SECOND_WALLET="$B" VITE_SHOWCASE_UNATTESTED="$NOBODY" \
    VITE_AUTOMATION_URL="$AUTO" VITE_DEV_PRIVATE_KEY="$K1" VITE_DEV_OPERATOR_KEY="$K0" \
    node node_modules/vite/bin/vite.js --port "$APP_PORT" --strictPort --host 127.0.0.1 > "$RUN_DIR/app.log" 2>&1) & echo $! >> "$PIDS"
  wait_http "$APP_URL/" 30 || die "vite did not come up ($RUN_DIR/app.log)"
  echo "app: $APP_URL/showcase/savings-plan (dev signer: investor A = anvil key 1, operator = anvil key 0; investor A is expired now: click Attest by operator with an empty recipient, or Re-approve after a fresh attest)"
fi
if [ $KEEP -eq 1 ]; then
  echo "kept running: anvil $RPC, automation $AUTO (pids in $PIDS; stop with: while read p; do kill \$p; done < $PIDS)"
fi
