#!/usr/bin/env bash
# The standing order on a local chain, automation in local mode (docs/privy-standing-order.md):
#
#   anvil -> Deploy.s.sol (registry, FundToken, Subscription; operator = anvil key 0)
#   -> automation/ (bun) with AUTOMATION_SIGNER=local: a dev key (anvil key 1) signs for the investor and
#      the rule JSON is applied by the evaluator in automation/src/policy.ts, captioned
#      "simulated Privy policy (local)". Nothing here talks to Privy.
#   -> attestByOperator for the investor with expiry = chain time + 120 s (the watcher sees Approved and
#      builds the two-rule policy from decisionOf)
#   -> three ticks: TICK OK each, balance 300 NDF
#   -> revoke: the watcher appends the deny-all rule; the tick logs TICK DENIED policy, then TICK DENIED chain
#   -> approve again: deny-all removed; tick OK, balance 400 NDF
#   -> evm_increaseTime past the expiry: tick DENIED policy (timestamp rule) and DENIED chain
#   -> a second investor without a local key is attested: the tick reports no delegated wallet for it
#   -> prints STANDING-ORDER-LOCAL PASS
#
# Usage: scripts/standing-order-local.sh [--keep]
#   --keep    leave anvil and the automation running (URLs and pids printed)
# Env: RUN_DIR (default .e2e/standing-order, gitignored), ANVIL_PORT, AUTOMATION_PORT (default: free ports).
# Nothing touches a public chain: every transaction goes to the local anvil.
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/standing-order}"
KEEP=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,21p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast bun jq curl python3; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, operator
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor's wallet (the automation's local key)
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
SECOND=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                        # anvil 2: attested, but the automation holds no key for it
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
ZERO32=0x0000000000000000000000000000000000000000000000000000000000000000
free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
ANVIL_PORT="${ANVIL_PORT:-$(free_port)}"; AUTOMATION_PORT="${AUTOMATION_PORT:-$(free_port)}"
RPC="http://127.0.0.1:$ANVIL_PORT"
AUTO="http://127.0.0.1:$AUTOMATION_PORT"

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

balance() { cast call --rpc-url "$RPC" "$TOKEN" "balanceOf(address)(uint256)" "$1" | awk '{print $1}'; }
eligible() { cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$1" "$POLICY" 3; }
chain_time() { cast block latest --rpc-url "$RPC" -f timestamp; }
TICK_N=0
tick() { # [address] -> writes $RUN_DIR/tick-N.json; the outcome list is in $OUT
  TICK_N=$(( TICK_N + 1 ))
  local body='{}'; [ $# -gt 0 ] && body="{\"address\":\"$1\"}"
  curl -fs -X POST -H 'content-type: application/json' --data "$body" "$AUTO/tick" > "$RUN_DIR/tick-$TICK_N.json" || die "POST /tick failed (automation log: $RUN_DIR/automation.log)"
  OUT=$(jq -r '[.results[] | "\(.address | .[0:10]) \(.outcome)"] | join("; ")' "$RUN_DIR/tick-$TICK_N.json")
}
outcome_of() { jq -r --arg a "$1" '.results[] | select(.address | ascii_downcase == ($a | ascii_downcase)) | .outcome' "$RUN_DIR/tick-$TICK_N.json"; }
detail_of() { jq -r --arg a "$1" '.results[] | select(.address | ascii_downcase == ($a | ascii_downcase)) | .detail' "$RUN_DIR/tick-$TICK_N.json"; }
wait_policy() { # address, seconds
  for _ in $(seq 1 $(( $2 * 2 ))); do curl -fs "$AUTO/policy/$1" >/dev/null 2>&1 && return 0; sleep 0.5; done
  return 1
}
wait_log() { # pattern, seconds: until the automation log carries the line
  for _ in $(seq 1 $(( $2 * 2 ))); do grep -q "$1" "$RUN_DIR/automation.log" 2>/dev/null && return 0; sleep 0.5; done
  return 1
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
[ -n "$REGISTRY" ] && [ -n "$TOKEN" ] && [ -n "$SUBSCRIPTION" ] || die "missing addresses in the Deploy.s.sol output"
say "AttestationRegistry $REGISTRY, FundToken $TOKEN, Subscription $SUBSCRIPTION"

# ------------------------------------------------------------------ 3. automation, local mode
[ -d "$ROOT/automation/node_modules/viem" ] || (cd "$ROOT/automation" && bun install --silent) || die "bun install failed in automation/"
: > "$RUN_DIR/automation.log"
(cd "$ROOT/automation" && exec env AUTOMATION_SIGNER=local RPC_URL="$RPC" CHAIN_ID=31337 REGISTRY="$REGISTRY" SUBSCRIPTION="$SUBSCRIPTION" FUND_TOKEN="$TOKEN" \
  POLICY_ID="$POLICY" POLL_MS=1000 LOCAL_INVESTOR_KEYS="$K1" PORT="$AUTOMATION_PORT" bun run src/server.ts >> "$RUN_DIR/automation.log" 2>&1) & echo $! >> "$PIDS"
wait_http "$AUTO/health" 30 || die "automation did not come up ($RUN_DIR/automation.log)"
[ "$(curl -fs "$AUTO/status" | jq -r .mode)" = local ] || die "automation is not in local mode"
say "automation on $AUTO (local mode: simulated Privy policy, dev key = anvil key 1, poll 1 s)"

# ------------------------------------------------------------------ 4. approve: attestByOperator with a short expiry
EXPIRY=$(( $(chain_time) + 120 ))
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))" \
  "$INVESTOR" "($POLICY,3,1,$EXPIRY,$ZERO32,false)" --json > "$RUN_DIR/attest.json" || die "attestByOperator failed"
[ "$(eligible "$INVESTOR")" = true ] || die "isEligible false after attestByOperator"
wait_policy "$INVESTOR" 15 || die "the watcher did not create a policy for $INVESTOR within 15 s ($RUN_DIR/automation.log)"
curl -fs "$AUTO/policy/$INVESTOR" > "$RUN_DIR/policy-1.json"
[ "$(jq -r '.rules | length' "$RUN_DIR/policy-1.json")" = 2 ] || die "expected 2 rules, got $(jq -c .rules "$RUN_DIR/policy-1.json")"
[ "$(jq -r '.expiry' "$RUN_DIR/policy-1.json")" = "$EXPIRY" ] || die "policy expiry $(jq -r .expiry "$RUN_DIR/policy-1.json") is not the decision's $EXPIRY"
[ "$(jq -r '.rules[0].action' "$RUN_DIR/policy-1.json")" = DENY ] && [ "$(jq -r '.rules[1].action' "$RUN_DIR/policy-1.json")" = ALLOW ] || die "rule actions are not DENY, ALLOW"
[ "$(jq -r '.rules[1].conditions[0].value' "$RUN_DIR/policy-1.json")" = "$(cast to-check-sum-address "$SUBSCRIPTION")" ] || die "the ALLOW rule does not point at the Subscription contract"
[ "$(jq -r '.delegated' "$RUN_DIR/policy-1.json")" = true ] || die "the automation does not see the local key as the delegated wallet"
say "approved: policy $(jq -r .policyId "$RUN_DIR/policy-1.json") with 2 rules, expiry $EXPIRY; plain words:"
jq -r '.plain[]' "$RUN_DIR/policy-1.json" | sed 's/^/        /'

# ------------------------------------------------------------------ 5. three ticks
for i in 1 2 3; do
  tick "$INVESTOR"
  [ "$(outcome_of "$INVESTOR")" = ok ] || die "tick $i: $OUT ($(detail_of "$INVESTOR"))"
done
B=$(balance "$INVESTOR")
[ "$B" = "300000000000000000000" ] || die "balance after three ticks is $B, expected 300 NDF"
[ "$(grep -c 'TICK OK' "$RUN_DIR/automation.log")" -ge 3 ] || die "fewer than three TICK OK lines in the automation log"
say "three ticks: TICK OK x3, balance 300 NDF, hashes $(jq -r '.results[0].hash' "$RUN_DIR/tick-1.json" | cut -c1-12).. $(jq -r '.results[0].hash' "$RUN_DIR/tick-2.json" | cut -c1-12).. $(jq -r '.results[0].hash' "$RUN_DIR/tick-3.json" | cut -c1-12).."

# ------------------------------------------------------------------ 6. revoke: deny-all appended, tick refused by the policy and by the chain
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "revoke(address,bytes32)" "$INVESTOR" "$POLICY" --json > "$RUN_DIR/revoke.json" || die "revoke failed"
wait_log "POLICY DENY-ALL ADDED" 15 || die "the watcher did not append the deny-all rule within 15 s"
[ "$(curl -fs "$AUTO/policy/$INVESTOR" | jq -r .denyAll)" = true ] || die "GET /policy does not show denyAll after revoke"
tick "$INVESTOR"
[ "$(outcome_of "$INVESTOR")" = denied-policy ] || die "tick after revoke: $OUT"
echo "$(detail_of "$INVESTOR")" | grep -q 'decision revoked' || die "the refusal is not by the deny-all rule: $(detail_of "$INVESTOR")"
P=$(grep -n 'TICK DENIED policy' "$RUN_DIR/automation.log" | tail -1 | cut -d: -f1); C=$(grep -n 'TICK DENIED chain' "$RUN_DIR/automation.log" | tail -1 | cut -d: -f1)
[ -n "$P" ] && [ -n "$C" ] && [ "$P" -lt "$C" ] || die "expected TICK DENIED policy then TICK DENIED chain in the log (policy line $P, chain line $C)"
[ "$(eligible "$INVESTOR")" = false ] || die "isEligible still true after revoke"
[ "$(balance "$INVESTOR")" = "300000000000000000000" ] || die "balance changed after a refused tick"
say "revoke: deny-all rule added; tick refused: $(detail_of "$INVESTOR"); then the chain: $(grep 'TICK DENIED chain' "$RUN_DIR/automation.log" | tail -1 | sed 's/.*TICK DENIED chain //' | cut -c1-90)"

# ------------------------------------------------------------------ 7. approve again: deny-all removed, tick OK
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "approve(address,bytes32)" "$INVESTOR" "$POLICY" --json > "$RUN_DIR/approve.json" || die "approve failed"
wait_log "POLICY DENY-ALL REMOVED" 15 || die "the watcher did not remove the deny-all rule within 15 s"
tick "$INVESTOR"
[ "$(outcome_of "$INVESTOR")" = ok ] || die "tick after re-approve: $OUT ($(detail_of "$INVESTOR"))"
[ "$(balance "$INVESTOR")" = "400000000000000000000" ] || die "balance after re-approve tick is not 400 NDF"
say "re-approve: deny-all removed, tick OK, balance 400 NDF"

# ------------------------------------------------------------------ 8. expiry: past the decision's expiry the timestamp rule and the chain both refuse
cast rpc --rpc-url "$RPC" evm_increaseTime 121 >/dev/null && cast rpc --rpc-url "$RPC" evm_mine >/dev/null
NOW=$(chain_time); [ "$NOW" -ge "$EXPIRY" ] || die "chain time $NOW did not pass the expiry $EXPIRY"
tick "$INVESTOR"
[ "$(outcome_of "$INVESTOR")" = denied-policy ] || die "tick after expiry: $OUT"
echo "$(detail_of "$INVESTOR")" | grep -q 'decision expired' || die "the refusal is not by the timestamp rule: $(detail_of "$INVESTOR")"
[ "$(jq -r --arg a "$INVESTOR" '.results[] | select(.address | ascii_downcase == ($a | ascii_downcase)) | .chain.allows' "$RUN_DIR/tick-$TICK_N.json")" = false ] || die "the chain would still allow subscribe() after expiry"
[ "$(eligible "$INVESTOR")" = false ] || die "isEligible still true after expiry"
say "expiry: chain time $NOW >= $EXPIRY; tick refused: $(detail_of "$INVESTOR"); chain refuses too (isEligible false)"

# ------------------------------------------------------------------ 9. a second investor the automation holds no key for: no delegated wallet
cast send --rpc-url "$RPC" --private-key $K0 "$REGISTRY" "attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))" \
  "$SECOND" "($POLICY,3,1,$(( $(chain_time) + 3600 )),$ZERO32,false)" --json > "$RUN_DIR/attest-2.json" || die "attestByOperator (second) failed"
wait_policy "$SECOND" 15 || die "no policy for the second investor within 15 s"
tick "$SECOND"
[ "$(outcome_of "$SECOND")" = no-delegated-wallet ] || die "tick for the second investor: $OUT"
say "second investor: policy created, tick reports no delegated wallet"

# ------------------------------------------------------------------ done
jq -c '{mode, simulated, pollMs, investors: [.investors[] | {address, policyId, denyAll, delegated, expiry}]}' <(curl -fs "$AUTO/status") > "$RUN_DIR/status.json"
say "status: $(cat "$RUN_DIR/status.json")"
echo "STANDING-ORDER-LOCAL PASS"
if [ $KEEP -eq 1 ]; then
  echo "kept running: anvil $RPC, automation $AUTO (pids in $PIDS; stop with: while read p; do kill \$p; done < $PIDS)"
fi
