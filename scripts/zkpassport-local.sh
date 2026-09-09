#!/usr/bin/env bash
# zkPassport route (WP33) on a local anvil with MockZkPassportRoot standing in for zkPassport's
# root verifier. Exercises the registry flow end to end with the adapter and the router in front of
# the policy: attestWithProof (passport route, tagged proof) -> approve -> isEligible and subscribe()
# -> revoke -> subscribe() refused -> replay refused. A second, untagged proof goes through the
# router to a stub EUDI verifier to show both routes share one policy.
#
# Evidence class L only (docs/process.md): nothing here is a wallet, device or passport run. The real
# phone run is described in docs/zkpassport.md.
#
# Usage: scripts/zkpassport-local.sh [--keep]
#   --keep    leave anvil running afterwards (URL and pid are printed)
# Env: ANVIL_PORT (default 8547), RUN_DIR (default .e2e/zkpassport-local)
# Nothing touches a public chain: every transaction goes to the local anvil.
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/zkpassport-local}"
ANVIL_PORT="${ANVIL_PORT:-8547}"
RPC="http://127.0.0.1:$ANVIL_PORT"
KEEP=0
[ "${1:-}" = "--keep" ] && KEEP=1

for tool in anvil forge cast jq; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }; done

K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, operator
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor's wallet
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
STRANGER=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC                      # anvil 2, never attested
POLICY=$(cast keccak "nachweis.pid.over18.v1")
DOMAIN=localhost
SCOPE=attestat-over18
TTL=2592000
CHAIN_ID=31337

mkdir -p "$RUN_DIR"
PIDS="$RUN_DIR/pids"
: > "$PIDS"
say() { printf '\033[1;36m[zkpassport-local]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[zkpassport-local] FAIL:\033[0m %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [ "$KEEP" = 1 ]; then echo "kept running: anvil $RPC (pids in $PIDS)"; return; fi
  while read -r pid; do kill "$pid" 2>/dev/null || true; done < "$PIDS"
}
trap cleanup EXIT

status_of() { cast call --rpc-url "$RPC" "$REGISTRY" "statusOf(address,bytes32)(bool,bool,bool,uint64)" "$1" "$POLICY" | awk '{print $1}' | tr '\n' ' ' | sed 's/ *$//'; }
eligible() { cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$1" "$POLICY" 3; }
send() { cast send --rpc-url "$RPC" --private-key "$1" --json "${@:2}"; }
subscribe_rc() { set +e; SUB_OUT=$(cast send --rpc-url "$RPC" --private-key "$K1" "$SUBSCRIPTION" "subscribe()" --json 2>&1); local rc=$?; set -e; return $rc; }

# ------------------------------------------------------------------ 1. anvil and contracts
anvil --port "$ANVIL_PORT" --chain-id "$CHAIN_ID" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
say "anvil on $RPC"

DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$SUBSCRIPTION" ] || die "no addresses in the Deploy output"

MOCK_ROOT=$(cd "$ROOT/contracts" && forge create test/zkpassport/MockZkPassportRoot.sol:MockZkPassportRoot --rpc-url "$RPC" --private-key $K0 --broadcast 2>&1 | awk '/Deployed to:/ {print $3}' | head -1)
[ -n "$MOCK_ROOT" ] || die "MockZkPassportRoot deployment failed"
# Stand-in for NoirPidVerifier behind the router: accepts anything, nonce keccak256("stub"). Only in this local run.
STUB=$(cd "$ROOT/contracts" && forge create test/zkpassport/ZkPassportVerifier.t.sol:StubVerifier --rpc-url "$RPC" --private-key $K0 --broadcast --constructor-args "$(cast keccak stub)" 2>&1 | awk '/Deployed to:/ {print $3}' | head -1)
[ -n "$STUB" ] || die "StubVerifier deployment failed"

ZK_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY REGISTRY_ADDRESS=$REGISTRY ZKPASSPORT_ROOT=$MOCK_ROOT ZKPASSPORT_DOMAIN=$DOMAIN ZKPASSPORT_SCOPE=$SCOPE ZKPASSPORT_DEV_MODE=true DECISION_TTL=$TTL FALLBACK_VERIFIER=$STUB \
  forge script script/DeployZkPassportVerifier.s.sol:DeployZkPassportVerifier --rpc-url "$RPC" --broadcast 2>&1) || { echo "$ZK_OUT" | tail -20; die "DeployZkPassportVerifier.s.sol failed"; }
VERIFIER=$(echo "$ZK_OUT" | awk '/ZkPassportVerifier:/ {print $2}' | head -1)
ROUTER=$(echo "$ZK_OUT" | awk '/EvidenceRouter:/ {print $2}' | head -1)
[ -n "$VERIFIER" ] && [ -n "$ROUTER" ] || die "no verifier or router address in the deploy output"
[ "$(cast call --rpc-url "$RPC" "$REGISTRY" "verifierOf(bytes32)(address)" "$POLICY")" = "$ROUTER" ] || die "registry does not point at the router"
say "registry $REGISTRY, router $ROUTER -> zkPassport adapter $VERIFIER (mock root $MOCK_ROOT) | fallback stub $STUB"

# ------------------------------------------------------------------ 2. a "proof" the mock accepts
NOW=$(cast block --rpc-url "$RPC" latest -f timestamp)
PROOF_TS=$((NOW - 60))
EXPIRY=$((PROOF_TS + TTL))
TAG=$(cast keccak "nachweis.zkpassport.v1")
VALID=$(cast from-utf8 valid)
# publicInputs of the zk proof: [2] = proof date, [8] nullifier type, [9] unique identifier (11 entries like the real layout)
Z=$(cast to-uint256 0)
PI="[$Z,$Z,$(cast to-uint256 $PROOF_TS),$Z,$Z,$Z,$Z,$Z,$Z,$(cast keccak mock-passport-1),$Z]"
COMMITTED=$(cast abi-encode "f(address,uint256,uint8,bool)" "$INVESTOR" "$CHAIN_ID" 18 true)
PARAMS=$(cast abi-encode "f((bytes32,(bytes32,bytes,bytes32[]),bytes,(uint256,string,string,bool)))" "($(cast to-uint256 20),($(cast keccak vkey),$VALID,$PI),$COMMITTED,(1,attacker.example,other,false))")
PROOF="${TAG}${PARAMS#0x}"
DECISION="($POLICY,7,1,$EXPIRY,0x0000000000000000000000000000000000000000000000000000000000000000,false)"
INPUTS="[$(cast to-uint256 $INVESTOR),$POLICY,$(cast to-uint256 7),$(cast to-uint256 $EXPIRY)]"
[ "$(cast call --rpc-url "$RPC" "$ROUTER" "route(bytes)(address)" "$PROOF")" = "$VERIFIER" ] || die "router does not dispatch the tagged proof to the adapter"

# ------------------------------------------------------------------ 3. the flow
[ "$(status_of $INVESTOR)" = "false false false 0" ] || die "investor has a decision before the run"
ATT=$(send $K1 "$REGISTRY" "attestWithProof(address,(bytes32,uint256,uint8,uint64,bytes32,bool),bytes,bytes32[])" "$INVESTOR" "$DECISION" "$PROOF" "$INPUTS") || die "attestWithProof (passport route) reverted: $ATT"
ATT_GAS=$(cast to-dec "$(echo "$ATT" | jq -r .gasUsed)")
[ "$(status_of $INVESTOR)" = "true false false $EXPIRY" ] || die "after attest: $(status_of $INVESTOR)"
[ "$(eligible $INVESTOR)" = "false" ] || die "eligible before approval"
subscribe_rc && die "subscribe() succeeded before the issuer approved"
say "assert: passport-route evidence stored from the investor's own wallet (attestWithProof $ATT_GAS gas, tx $(echo "$ATT" | jq -r .transactionHash)); not eligible, subscribe refused"

set +e; REPLAY=$(cast send --rpc-url "$RPC" --private-key $K1 "$REGISTRY" "attestWithProof(address,(bytes32,uint256,uint8,uint64,bytes32,bool),bytes,bytes32[])" "$INVESTOR" "$DECISION" "$PROOF" "$INPUTS" --json 2>&1); rc=$?; set -e
[ $rc -ne 0 ] || die "replay of the same proof was accepted"
echo "$REPLAY" | grep -qi "NonceConsumed\|$(cast sig 'NonceConsumed(bytes32,bytes32)' | cut -c3-)" || die "replay refused, but not with NonceConsumed: $REPLAY"
say "assert: replay refused with NonceConsumed"

APR=$(send $K0 "$REGISTRY" "approve(address,bytes32)" "$INVESTOR" "$POLICY") || die "approve reverted"
[ "$(eligible $INVESTOR)" = "true" ] || die "not eligible after approve"
subscribe_rc || die "subscribe() reverted after approve: $SUB_OUT"
BAL=$(cast call --rpc-url "$RPC" "$TOKEN" "balanceOf(address)(uint256)" "$INVESTOR" | awk '{print $1}')
[ "$BAL" != "0" ] || die "no fund tokens after subscribe"
say "assert: approve $(echo "$APR" | jq -r .transactionHash); isEligible(bits 3) true with a 0x7 decision; subscribe() mined, balance $(cast from-wei "$BAL") NDF"

REV=$(send $K0 "$REGISTRY" "revoke(address,bytes32)" "$INVESTOR" "$POLICY") || die "revoke reverted"
[ "$(eligible $INVESTOR)" = "false" ] || die "eligible after revoke"
subscribe_rc && die "subscribe() succeeded after revoke"
say "assert: revoke $(echo "$REV" | jq -r .transactionHash); subscribe() refused"
[ "$(eligible $STRANGER)" = "false" ] || die "stranger eligible"

# ------------------------------------------------------------------ 4. the other route through the same router
UNTAGGED=$(cast abi-encode "f(bytes,bytes32[])" 0x686f6e6b "[]")
[ "$(cast call --rpc-url "$RPC" "$ROUTER" "route(bytes)(address)" "$UNTAGGED")" = "$STUB" ] || die "router does not dispatch an untagged proof to the fallback"
EXP2=$((NOW + TTL))
D2="($POLICY,3,1,$EXP2,0x0000000000000000000000000000000000000000000000000000000000000000,false)"
I2="[$(cast to-uint256 $STRANGER),$POLICY,$(cast to-uint256 3),$(cast to-uint256 $EXP2)]"
send $K0 "$REGISTRY" "attestWithProof(address,(bytes32,uint256,uint8,uint64,bytes32,bool),bytes,bytes32[])" "$STRANGER" "$D2" "$UNTAGGED" "$I2" >/dev/null || die "untagged proof through the router reverted"
[ "$(status_of $STRANGER)" = "true false false $EXP2" ] || die "fallback route did not store: $(status_of $STRANGER)"
say "assert: an untagged (EUDI-style) proof reaches the fallback verifier under the same policy"

echo "ZKPASSPORT-LOCAL PASS (mock root verifier, evidence class L): attest $ATT_GAS gas, approve, subscribe, revoke, replay refused, both routes on one policy"
