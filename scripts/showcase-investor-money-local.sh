#!/usr/bin/env bash
# Showcase, investor money, on a local chain (docs/showcase/investor-money.md), evidence class L:
#
#   anvil -> DeployFundDesk.s.sol (registry, MockStable mUSD, FundDesk, FundToken with issuer = desk;
#            operator and desk owner = anvil key 0)
#   -> mint 1,000 mUSD to the investor (anvil key 1) and to the operator's treasury
#   -> attest and approve the investor (attestByOperator, expiry chain time + 1 h)
#   -> subscribe 100 mUSD (approve, subscribe): 900 mUSD, 100 NDF
#   -> the operator pays a distribution of 10 mUSD (approve, distribute): claimable 10 mUSD
#   -> claim: 910 mUSD
#   -> redeem 50 NDF (approve, redeem): 960 mUSD, 50 NDF, the desk holds 50 NDF as inventory
#   -> revoke: isEligible false; subscribe, claim and redeem are refused with NotEligible (eth_call, nothing sent)
#   -> approve again: subscribe 100 mUSD once more, 50 NDF from the desk's inventory and 50 minted: 860 mUSD, 150 NDF
#   -> prints SHOWCASE-INVESTOR-MONEY-LOCAL PASS
#
# Usage: scripts/showcase-investor-money-local.sh [--keep] [--app] [--test]
#   --keep    leave anvil running (URL and pid printed) with the addresses in RUN_DIR/env.json
#   --app     after the flow, also deploy Deploy.s.sol and start the Vite dev server with the dev signer keys,
#             VITE_DESK and the addresses, for hand-clicking /showcase/investor-money and /issuer on anvil
#             (implies --keep; the investor is then approved and holds 860 mUSD and 150 NDF when the page opens)
#   --test    browser run instead of the cast flow: deploy, mint the operator's treasury, start the app, then
#             `bunx playwright test e2e/showcase-investor-money.spec.ts` clicks the beats above from a fresh
#             investor (attest, revoke and approve by cast, the operator's action), then stop (exit code = test result)
# Env: RUN_DIR (default .e2e/showcase-investor-money, gitignored), ANVIL_PORT, APP_PORT (default: free ports).
# Nothing touches a public chain: every transaction goes to the local anvil. No Privy app is involved
# (the page then offers the dev signer; with VITE_PRIVY_APP_ID it would offer email sign-in instead).
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUN_DIR:-$ROOT/.e2e/showcase-investor-money}"
KEEP=0; APP=0; TEST=0
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) KEEP=1; shift ;;
    --app) APP=1; KEEP=1; shift ;;
    --test) TEST=1; shift ;;
    -h|--help) sed -n '2,28p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.foundry/bin:$HOME/.bun/bin:$PATH"
for tool in anvil forge cast jq python3 node bun; do
  command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }
done

# anvil's well-known dev keys: local testing only, never a real chain.
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0: deployer, registry operator, desk owner (the issuer)
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1: the investor
OPERATOR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
INVESTOR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
ZERO32=0x0000000000000000000000000000000000000000000000000000000000000000
MUSD_1000=1000000000   # 6 decimals
MUSD_100=100000000
MUSD_10=10000000
NDF_50=50000000000000000000   # 18 decimals
free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
ANVIL_PORT="${ANVIL_PORT:-$(free_port)}"
RPC="http://127.0.0.1:$ANVIL_PORT"

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

send() { # key, to, sig, args... -> receipt json in $RUN_DIR/tx-N.json, hash in $HASH
  local key="$1" to="$2"; shift 2
  TX_N=$(( ${TX_N:-0} + 1 ))
  cast send --rpc-url "$RPC" --private-key "$key" "$to" "$@" --json > "$RUN_DIR/tx-$TX_N.json" || return 1
  HASH=$(jq -r .transactionHash "$RUN_DIR/tx-$TX_N.json")
  [ "$(jq -r .status "$RUN_DIR/tx-$TX_N.json")" = "0x1" ] || return 1
}
num() { awk '{print $1}'; }
stable_of() { cast call --rpc-url "$RPC" "$STABLE" "balanceOf(address)(uint256)" "$1" | num; }
units_of() { cast call --rpc-url "$RPC" "$TOKEN" "balanceOf(address)(uint256)" "$1" | num; }
claimable_of() { cast call --rpc-url "$RPC" "$DESK" "claimableTotal(address)(uint256)" "$1" | num; }
eligible() { cast call --rpc-url "$RPC" "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$1" "$POLICY" 3; }
chain_time() { cast block latest --rpc-url "$RPC" -f timestamp; }
expect() { # label, got, want
  [ "$2" = "$3" ] || die "$1: got $2, expected $3"
}
NOT_ELIGIBLE_SIG=$(cast sig "NotEligible(address)")
refused() { # from, sig, args...: eth_call must revert with NotEligible; nothing is sent
  local from="$1"; shift
  local out
  if out=$(cast call --rpc-url "$RPC" --from "$from" "$DESK" "$@" 2>&1); then
    die "expected NotEligible for $1, but the call succeeded: $out"
  fi
  echo "$out" | grep -qi "NotEligible\|$NOT_ELIGIBLE_SIG" || die "expected NotEligible for $1, got: $(echo "$out" | head -3)"
}

# ------------------------------------------------------------------ 1. anvil
anvil --port "$ANVIL_PORT" --silent > "$RUN_DIR/anvil.log" 2>&1 & echo $! >> "$PIDS"
for _ in $(seq 1 50); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 0.2; done
cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 || die "anvil did not come up ($RUN_DIR/anvil.log)"
say "anvil on $RPC"

# ------------------------------------------------------------------ 2. contracts: the desk layout
DEPLOY_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/DeployFundDesk.s.sol:DeployFundDesk --rpc-url "$RPC" --broadcast 2>&1) || { echo "$DEPLOY_OUT" | tail -20; die "DeployFundDesk.s.sol failed"; }
echo "$DEPLOY_OUT" > "$RUN_DIR/deploy.log"
REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
STABLE=$(echo "$DEPLOY_OUT" | awk '/MockStable:/ {print $2}' | head -1)
DESK=$(echo "$DEPLOY_OUT" | awk '/FundDesk:/ {print $2}' | head -1)
TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
[ -n "$REGISTRY" ] && [ -n "$STABLE" ] && [ -n "$DESK" ] && [ -n "$TOKEN" ] || die "missing addresses in the DeployFundDesk.s.sol output ($RUN_DIR/deploy.log)"
expect "FundToken.issuer is the desk" "$(cast call --rpc-url "$RPC" "$TOKEN" "issuer()(address)")" "$DESK"
expect "FundDesk.token" "$(cast call --rpc-url "$RPC" "$DESK" "token()(address)")" "$TOKEN"
say "AttestationRegistry $REGISTRY, MockStable $STABLE, FundDesk $DESK, FundToken $TOKEN (issuer = desk)"

start_app() { # deploys the product layout too, writes RUN_DIR/env.json (mode, appUrl, addresses) and starts Vite with the dev signer keys
  # Deploy.s.sol (its own registry, FundToken, Subscription) so the investor portal and the issuer console are configured;
  # the app points at the desk's registry, where the investor is approved. Only the desk's doors matter on this run.
  MAIN_OUT=$(cd "$ROOT/contracts" && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) || { echo "$MAIN_OUT" | tail -20; die "Deploy.s.sol failed"; }
  MAIN_TOKEN=$(echo "$MAIN_OUT" | awk '/FundToken:/ {print $2}' | head -1)
  SUBSCRIPTION=$(echo "$MAIN_OUT" | awk '/Subscription:/ {print $2}' | head -1)
  MAIN_REGISTRY=$(echo "$MAIN_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
  APP_PORT="${APP_PORT:-$(free_port)}"
  APP_URL="http://127.0.0.1:$APP_PORT"
  [ -d "$ROOT/app/node_modules/vite" ] || (cd "$ROOT/app" && bun install --silent) || die "bun install failed in app/"
  (cd "$ROOT/app" && exec env -u VITE_MOCK -u VITE_PRIVY_APP_ID -u VITE_AUTOMATION_URL VITE_CHAIN_ID=31337 VITE_RPC_URL="$RPC" VITE_REGISTRY="$REGISTRY" VITE_DESK="$DESK" \
    VITE_FUND_TOKEN="$MAIN_TOKEN" VITE_SUBSCRIPTION="$SUBSCRIPTION" VITE_DEV_PRIVATE_KEY=$K1 VITE_DEV_OPERATOR_KEY=$K0 \
    node node_modules/vite/bin/vite.js --port "$APP_PORT" --strictPort --host 127.0.0.1 > "$RUN_DIR/app.log" 2>&1) & echo $! >> "$PIDS"
  for _ in $(seq 1 200); do curl -fs -m 5 "$APP_URL/" >/dev/null 2>&1 && break; sleep 0.3; done
  curl -fs -m 5 "$APP_URL/" >/dev/null 2>&1 || die "the app did not come up ($RUN_DIR/app.log)"
  jq -n --arg mode showcase-investor-money --arg appUrl "$APP_URL" --arg rpcUrl "$RPC" --arg registry "$REGISTRY" --arg stable "$STABLE" --arg desk "$DESK" --arg token "$TOKEN" \
    --arg operator "$OPERATOR" --arg investor "$INVESTOR" --arg policyId "$POLICY" --arg operatorKey "$K0" --arg runDir "$RUN_DIR" \
    '$ARGS.named + {chainId: 31337}' > "$RUN_DIR/env.json"
}

if [ $TEST -eq 1 ]; then
  # Browser run: the spec clicks the beats from a fresh investor; only the operator's treasury is minted here.
  send $K0 "$STABLE" "mint(address,uint256)" "$OPERATOR" $MUSD_1000 || die "mint to the operator failed"
  start_app
  say "app on $APP_URL, env for the spec: $RUN_DIR/env.json"
  set +e; trap - ERR
  (cd "$ROOT/app" && APP_E2E_ENV="$RUN_DIR/env.json" bunx playwright test e2e/showcase-investor-money.spec.ts)
  rc=$?
  set -e
  [ $KEEP -eq 1 ] || stop_all
  [ $rc -eq 0 ] && say "BROWSER SHOWCASE (investor-money) OK" || say "BROWSER SHOWCASE (investor-money) FAILED (exit $rc); logs in $RUN_DIR"
  exit $rc
fi

# ------------------------------------------------------------------ 3. test stablecoin: 1,000 mUSD each to the investor and the operator's treasury
send $K0 "$STABLE" "mint(address,uint256)" "$INVESTOR" $MUSD_1000 || die "mint to the investor failed"
send $K0 "$STABLE" "mint(address,uint256)" "$OPERATOR" $MUSD_1000 || die "mint to the operator failed"
expect "investor mUSD after mint" "$(stable_of "$INVESTOR")" $MUSD_1000
say "minted 1,000 mUSD to the investor and 1,000 mUSD to the operator's treasury (test stablecoin, anyone can mint)"

# ------------------------------------------------------------------ 4. before approval: subscribe is refused
expect "isEligible before attest" "$(eligible "$INVESTOR")" false
refused "$INVESTOR" "subscribe(uint256)" $MUSD_100
say "before approval: subscribe refused with NotEligible (eth_call, nothing sent)"

# ------------------------------------------------------------------ 5. attest and approve (operator route, simulated presentation)
EXPIRY=$(( $(chain_time) + 3600 ))
send $K0 "$REGISTRY" "attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))" "$INVESTOR" "($POLICY,3,1,$EXPIRY,$ZERO32,false)" || die "attestByOperator failed"
ATTEST_HASH=$HASH
expect "isEligible after attestByOperator" "$(eligible "$INVESTOR")" true
say "attested and approved by the operator (simulated presentation), expiry $EXPIRY, hash ${ATTEST_HASH:0:12}.."

# ------------------------------------------------------------------ 6. subscribe 100 mUSD
send $K1 "$STABLE" "approve(address,uint256)" "$DESK" $MUSD_100 || die "investor approve failed"
send $K1 "$DESK" "subscribe(uint256)" $MUSD_100 || die "subscribe failed"
SUBSCRIBE_HASH=$HASH
expect "investor mUSD after subscribe" "$(stable_of "$INVESTOR")" 900000000
expect "investor NDF after subscribe" "$(units_of "$INVESTOR")" 100000000000000000000
expect "desk mUSD after subscribe" "$(stable_of "$DESK")" $MUSD_100
say "subscribe 100 mUSD: 900 mUSD, 100 NDF, hash ${SUBSCRIBE_HASH:0:12}.."

# ------------------------------------------------------------------ 7. the operator pays a distribution of 10 mUSD
send $K0 "$STABLE" "approve(address,uint256)" "$DESK" $MUSD_10 || die "operator approve failed"
send $K0 "$DESK" "distribute(uint256)" $MUSD_10 || die "distribute failed"
DISTRIBUTE_HASH=$HASH
expect "distributionCount" "$(cast call --rpc-url "$RPC" "$DESK" "distributionCount()(uint256)" | num)" 1
expect "claimable after distribution" "$(claimable_of "$INVESTOR")" $MUSD_10
say "distribution 10 mUSD paid in by the operator: claimable 10 mUSD, hash ${DISTRIBUTE_HASH:0:12}.."

# ------------------------------------------------------------------ 8. claim
send $K1 "$DESK" "claimAll()" || die "claimAll failed"
CLAIM_HASH=$HASH
expect "investor mUSD after claim" "$(stable_of "$INVESTOR")" 910000000
expect "claimable after claim" "$(claimable_of "$INVESTOR")" 0
say "claim: 910 mUSD, hash ${CLAIM_HASH:0:12}.."

# ------------------------------------------------------------------ 9. redeem 50 NDF
send $K1 "$TOKEN" "approve(address,uint256)" "$DESK" $NDF_50 || die "investor NDF approve failed"
send $K1 "$DESK" "redeem(uint256)" $NDF_50 || die "redeem failed"
REDEEM_HASH=$HASH
expect "investor mUSD after redeem" "$(stable_of "$INVESTOR")" 960000000
expect "investor NDF after redeem" "$(units_of "$INVESTOR")" 50000000000000000000
expect "desk NDF inventory after redeem" "$(units_of "$DESK")" $NDF_50
say "redeem 50 NDF: 960 mUSD, 50 NDF; the desk holds 50 NDF as inventory, hash ${REDEEM_HASH:0:12}.."

# ------------------------------------------------------------------ 10. revoke: every door refused
send $K0 "$REGISTRY" "revoke(address,bytes32)" "$INVESTOR" "$POLICY" || die "revoke failed"
REVOKE_HASH=$HASH
expect "isEligible after revoke" "$(eligible "$INVESTOR")" false
send $K1 "$STABLE" "approve(address,uint256)" "$DESK" $MUSD_100 || die "investor approve failed"
refused "$INVESTOR" "subscribe(uint256)" $MUSD_100
refused "$INVESTOR" "claimAll()"
refused "$INVESTOR" "redeem(uint256)" $NDF_50
expect "investor mUSD unchanged after refusals" "$(stable_of "$INVESTOR")" 960000000
expect "investor NDF unchanged after refusals" "$(units_of "$INVESTOR")" 50000000000000000000
say "revoke (manual, by the issuer), hash ${REVOKE_HASH:0:12}..: subscribe, claim and redeem refused with NotEligible; balances unchanged"

# ------------------------------------------------------------------ 11. approve again: subscribe reopens, inventory first
send $K0 "$REGISTRY" "approve(address,bytes32)" "$INVESTOR" "$POLICY" || die "approve failed"
APPROVE_HASH=$HASH
expect "isEligible after re-approve" "$(eligible "$INVESTOR")" true
send $K1 "$DESK" "subscribe(uint256)" $MUSD_100 || die "subscribe after re-approve failed"
SUBSCRIBE2_HASH=$HASH
expect "investor mUSD after second subscribe" "$(stable_of "$INVESTOR")" 860000000
expect "investor NDF after second subscribe" "$(units_of "$INVESTOR")" 150000000000000000000
expect "desk NDF inventory after second subscribe" "$(units_of "$DESK")" 0
expect "NDF total supply" "$(cast call --rpc-url "$RPC" "$TOKEN" "totalSupply()(uint256)" | num)" 150000000000000000000
say "re-approve, hash ${APPROVE_HASH:0:12}..: subscribe 100 mUSD again (50 NDF from inventory, 50 minted): 860 mUSD, 150 NDF, hash ${SUBSCRIBE2_HASH:0:12}.."

# ------------------------------------------------------------------ done
jq -n --arg rpcUrl "$RPC" --arg registry "$REGISTRY" --arg stable "$STABLE" --arg desk "$DESK" --arg token "$TOKEN" --arg operator "$OPERATOR" --arg investor "$INVESTOR" \
  --arg attest "$ATTEST_HASH" --arg subscribe "$SUBSCRIBE_HASH" --arg distribute "$DISTRIBUTE_HASH" --arg claim "$CLAIM_HASH" --arg redeem "$REDEEM_HASH" --arg revoke "$REVOKE_HASH" --arg approve "$APPROVE_HASH" --arg subscribe2 "$SUBSCRIBE2_HASH" \
  '{chainId: 31337, rpcUrl: $rpcUrl, registry: $registry, stable: $stable, desk: $desk, token: $token, operator: $operator, investor: $investor, hashes: {attest: $attest, subscribe: $subscribe, distribute: $distribute, claim: $claim, redeem: $redeem, revoke: $revoke, approve: $approve, subscribe2: $subscribe2}}' > "$RUN_DIR/env.json"
say "record: $RUN_DIR/env.json"
echo "SHOWCASE-INVESTOR-MONEY-LOCAL PASS"

if [ $APP -eq 1 ]; then
  start_app
  say "app: $APP_URL/showcase/investor-money (investor, dev signer = anvil key 1) and $APP_URL/issuer (operator = anvil key 0); product Deploy.s.sol registry $MAIN_REGISTRY unused, Subscription $SUBSCRIPTION"
fi
if [ $KEEP -eq 1 ]; then
  echo "kept running: anvil $RPC (pids in $PIDS; stop with: while read p; do kill \$p; done < $PIDS)"
fi
