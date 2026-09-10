#!/usr/bin/env bash
# Local Uniswap v4 permissioned pool for the Attestat demo, on an anvil fork of Sepolia.
#
# The v4 PoolManager, Uniswap's PermissionsAdapterFactory, the production PermissionedHooks, the
# permissioned Universal Router, the PermissionedPositionManager, Permit2, StateView and the V4Quoter
# all live on Sepolia (contracts/src/uniswap/UniswapSepolia.sol). anvil forks them; everything of ours
# (registry, FundToken, Subscription, MockStable, EudiAllowlistChecker, the adapter, the pool, the
# liquidity) is deployed on the fork by the existing Foundry scripts. Nothing is broadcast to Sepolia.
#
#   anvil --fork-url <Sepolia> --chain-id 31337        (skipped with --attach)
#   -> Deploy.s.sol: AttestationRegistry, FundToken, Subscription (skipped with --attach)
#   -> CreatePermissionedPool.s.sol: checker on the local registry, adapter via the factory, venue
#      decision, verification, wrappers and hook approved, PoolManager.initialize, swapping enabled
#   -> AddLiquidityPermissioned.s.sol: full-range position through the PermissionedPositionManager
#   -> assertions with a probe account (anvil account 2): attested, swaps POOL_PROBE_AMOUNT (default 1 mUSD,
#      small so the investor's first swap still quotes a fresh pool) for NDF through the permissioned
#      router; revoked, the same swap is refused by PermissionedHooks.beforeSwap. 0 skips the probe.
#   -> <out>/pool.json (addresses, pool id, key, fork block) and <out>/pool.env (VITE_* for the app)
#
# Usage: scripts/pool-local.sh [--fork-url URL] [--keep] [--out DIR]
#        scripts/pool-local.sh --attach RPC --registry ADDR --fund-token ADDR [--subscription ADDR] [--out DIR]
#   --fork-url   upstream Sepolia RPC for anvil (default: SEPOLIA_RPC_URL, else the publicnode endpoint)
#   --keep       leave anvil running afterwards (URL and pid printed); default stops it
#   --attach     use a running anvil that already forks Sepolia with chain id 31337 and holds the
#                registry and FundToken (scripts/app-e2e-local.sh --pool calls this form)
#   --out        directory for pool.json, pool.env and logs (default .e2e/pool)
# Env: SEPOLIA_RPC_URL (fork source), POOL_PROBE_AMOUNT (probe swap in raw mUSD units, 6 decimals; default
#      1000000 = 1 mUSD; 0 skips the probe), POOL_FEE (default 3000), TICK_SPACING (default 60),
#      FUND_LIQUIDITY / STABLE_LIQUIDITY in raw units (default 1000e18 / 1000e6).
# Expected last line: POOL-LOCAL PASS
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/.e2e/pool"
FORK_URL="${SEPOLIA_RPC_URL:-https://ethereum-sepolia-rpc.publicnode.com}"
KEEP=0; ATTACH_RPC=""; REGISTRY=""; TOKEN=""; SUBSCRIPTION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --fork-url) FORK_URL="$2"; shift 2 ;;
    --keep) KEEP=1; shift ;;
    --attach) ATTACH_RPC="$2"; shift 2 ;;
    --registry) REGISTRY="$2"; shift 2 ;;
    --fund-token) TOKEN="$2"; shift 2 ;;
    --subscription) SUBSCRIPTION="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -n "$ATTACH_RPC" ] && { [ -z "$REGISTRY" ] || [ -z "$TOKEN" ]; }; then
  echo "--attach needs --registry and --fund-token" >&2; exit 2
fi

export PATH="$HOME/.foundry/bin:$PATH"
for tool in anvil forge cast jq python3; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }; done

# anvil's deterministic accounts: 0 deploys, is the operator, the token issuer, the adapter owner and the
# LP; 1 is the app's investor (left untouched here so the app or a spec can attest it); 2 is the probe
# swapper of the assertions below.
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
A0=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
K2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
A2=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f # keccak256("nachweis.pid.over18.v1")
REQUIRED_BITS=3
POOL_FEE="${POOL_FEE:-3000}"; TICK_SPACING="${TICK_SPACING:-60}"
FUND_LIQUIDITY="${FUND_LIQUIDITY:-1000000000000000000000}"; STABLE_LIQUIDITY="${STABLE_LIQUIDITY:-1000000000}"
PROBE_IN="${POOL_PROBE_AMOUNT:-1000000}"   # probe swap, raw mUSD units (6 decimals); 1 mUSD keeps the pool nearly untouched, 0 skips
# Uniswap on Sepolia, the same constants as contracts/src/uniswap/UniswapSepolia.sol.
POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543
FACTORY=0xE6B0d96919334C33d06266d1420F97f6f434fA2B
POSM=0xf99D553912084c99F6299291b75Fe9B7119Aa1A7
HOOKS=0x51247E2291d290d17C08813A175AC86465EdE8c0
ROUTER=0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7
QUOTER=0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227
PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3
STATE_VIEW=0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C

mkdir -p "$OUT"
PIDFILE="$OUT/pids"
T0=$(date +%s)
say() { echo "[$(( $(date +%s) - T0 ))s] $*"; }
die() { echo "FAIL: $*" >&2; exit 1; }
free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()'; }
stop_anvil() { [ -f "$PIDFILE" ] || return 0; while read -r pid; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done < "$PIDFILE"; : > "$PIDFILE"; }
cleanup() {
  local rc=$?
  if [ -z "$ATTACH_RPC" ]; then
    if [ $KEEP -eq 1 ] && [ $rc -eq 0 ]; then echo "kept running: anvil $RPC (stop with: kill \$(cat $PIDFILE))"; else stop_anvil; fi
  fi
  [ $rc -eq 0 ] || echo "exit $rc; logs in $OUT" >&2
}
trap cleanup EXIT

# ------------------------------------------------------------------ 1. anvil fork (or attach)
if [ -n "$ATTACH_RPC" ]; then
  RPC="$ATTACH_RPC"
else
  stop_anvil
  ANVIL_PORT=$(free_port); RPC="http://127.0.0.1:$ANVIL_PORT"
  anvil --fork-url "$FORK_URL" --chain-id 31337 --port "$ANVIL_PORT" --host 127.0.0.1 --retries 5 --timeout 30000 --silent > "$OUT/anvil.log" 2>&1 &
  echo $! >> "$PIDFILE"
  for _ in $(seq 1 90); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
fi
CHAIN_ID=$(cast chain-id --rpc-url "$RPC" 2>/dev/null) || die "no anvil at $RPC (fork of $FORK_URL; see $OUT/anvil.log)"
[ "$CHAIN_ID" = 31337 ] || die "chain id is $CHAIN_ID, expected 31337 (anvil --chain-id 31337 on the fork)"
FORK_BLOCK=$(cast block-number --rpc-url "$RPC")
for name in FACTORY HOOKS ROUTER POSM PERMIT2 STATE_VIEW QUOTER; do
  code=$(cast code "${!name}" --rpc-url "$RPC"); [ "${#code}" -gt 10 ] || die "no code at $name ${!name}: is $RPC a fork of Sepolia?"
done
say "anvil $RPC, chain $CHAIN_ID, fork block $FORK_BLOCK, Uniswap permissioned-pool contracts present"

# ------------------------------------------------------------------ 2. registry, FundToken, Subscription
cd "$ROOT/contracts"
if [ -z "$ATTACH_RPC" ]; then
  DEPLOY_OUT=$(DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY REQUIRED_BITS=$REQUIRED_BITS forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast 2>&1) \
    || { echo "$DEPLOY_OUT" | tail -20; die "Deploy.s.sol failed"; }
  REGISTRY=$(echo "$DEPLOY_OUT" | awk '/AttestationRegistry:/ {print $2}' | head -1)
  TOKEN=$(echo "$DEPLOY_OUT" | awk '/FundToken:/ {print $2}' | head -1)
  SUBSCRIPTION=$(echo "$DEPLOY_OUT" | awk '/Subscription:/ {print $2}' | head -1)
  [ -n "$REGISTRY" ] && [ -n "$TOKEN" ] || die "could not parse the deploy output"
fi
say "registry $REGISTRY, FundToken $TOKEN, subscription ${SUBSCRIPTION:-unset}"

# ------------------------------------------------------------------ 3. the pool (onboarding steps 1 to 6)
POOL_OUT=$(DEPLOYER_PRIVATE_KEY=$K0 REGISTRY_ADDRESS=$REGISTRY FUND_TOKEN_ADDRESS=$TOKEN POLICY_ID=$POLICY REQUIRED_BITS=$REQUIRED_BITS \
  POOL_FEE=$POOL_FEE TICK_SPACING=$TICK_SPACING \
  forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url "$RPC" --broadcast 2>&1) \
  || { echo "$POOL_OUT" | tail -30; die "CreatePermissionedPool.s.sol failed"; }
echo "$POOL_OUT" > "$OUT/create-pool.log"
STABLE=$(echo "$POOL_OUT" | awk '/MockStable:/ {print $2}' | head -1)
CHECKER=$(echo "$POOL_OUT" | awk '/EudiAllowlistChecker:/ {print $2}' | head -1)
ADAPTER=$(echo "$POOL_OUT" | awk '/PermissionsAdapter:/ {print $2}' | head -1)
C0=$(echo "$POOL_OUT" | awk '/Pool currency0:/ {print $3}' | head -1)
C1=$(echo "$POOL_OUT" | awk '/Pool currency1:/ {print $3}' | head -1)
POOL_ID=$(echo "$POOL_OUT" | awk '/^ *PoolId:/ {getline; print $1}' | head -1)
[ -n "$STABLE" ] && [ -n "$CHECKER" ] && [ -n "$ADAPTER" ] && [ -n "$POOL_ID" ] || { echo "$POOL_OUT" | tail -30; die "could not parse the pool output"; }
[ "$(cast call "$CHECKER" "registry()(address)" --rpc-url "$RPC")" = "$REGISTRY" ] || die "checker does not point at the local registry"
[ "$(cast call "$ADAPTER" "swappingEnabled()(bool)" --rpc-url "$RPC")" = true ] || die "adapter: swapping not enabled"
say "checker $CHECKER (reads $REGISTRY), adapter $ADAPTER, stable $STABLE, pool id $POOL_ID"

# ------------------------------------------------------------------ 4. liquidity
LIQ_OUT=$(DEPLOYER_PRIVATE_KEY=$K0 ADAPTER_ADDRESS=$ADAPTER REGISTRY_ADDRESS=$REGISTRY FUND_TOKEN_ADDRESS=$TOKEN STABLE_ADDRESS=$STABLE \
  POLICY_ID=$POLICY REQUIRED_BITS=$REQUIRED_BITS POOL_FEE=$POOL_FEE TICK_SPACING=$TICK_SPACING FUND_AMOUNT=$FUND_LIQUIDITY STABLE_AMOUNT=$STABLE_LIQUIDITY \
  forge script script/AddLiquidityPermissioned.s.sol:AddLiquidityPermissioned --rpc-url "$RPC" --broadcast 2>&1) \
  || { echo "$LIQ_OUT" | tail -30; die "AddLiquidityPermissioned.s.sol failed"; }
echo "$LIQ_OUT" > "$OUT/add-liquidity.log"
LP_TOKEN_ID=$(echo "$LIQ_OUT" | awk '/Position tokenId:/ {print $3}' | head -1)
LIQUIDITY=$(cast call "$STATE_VIEW" "getLiquidity(bytes32)(uint128)" "$POOL_ID" --rpc-url "$RPC" | awk '{print $1}')
[ "$LIQUIDITY" != 0 ] || die "pool liquidity is 0 after the mint"
SLOT0=$(cast call "$STATE_VIEW" "getSlot0(bytes32)(uint160,int24,uint24,uint24)" "$POOL_ID" --rpc-url "$RPC")
say "liquidity $LIQUIDITY (position $LP_TOKEN_ID), slot0: $(echo "$SLOT0" | tr '\n' ' ')"

# ------------------------------------------------------------------ 5. assertions with the probe account
if [ "$PROBE_IN" = 0 ]; then
  say "probe skipped (POOL_PROBE_AMOUNT=0): the pool is untouched, no swap was proven live"
else
# Attested and approved (attestByOperator does both): the swap goes through, the probe holds NDF.
SWAP1=$(DEPLOYER_PRIVATE_KEY=$K0 INVESTOR_PRIVATE_KEY=$K2 ADAPTER_ADDRESS=$ADAPTER REGISTRY_ADDRESS=$REGISTRY FUND_TOKEN_ADDRESS=$TOKEN STABLE_ADDRESS=$STABLE \
  POLICY_ID=$POLICY REQUIRED_BITS=$REQUIRED_BITS POOL_FEE=$POOL_FEE TICK_SPACING=$TICK_SPACING SWAP_AMOUNT_IN=$PROBE_IN \
  forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url "$RPC" --broadcast 2>&1) \
  || { echo "$SWAP1" | tail -30; die "SwapPermissioned.s.sol (eligible probe) failed"; }
echo "$SWAP1" > "$OUT/swap-eligible.log"
OUT1=$(echo "$SWAP1" | awk '/FundToken out:/ {print $3}' | head -1)
[ -n "$OUT1" ] && [ "$OUT1" != 0 ] || die "eligible probe received no FundToken"
say "eligible probe $A2: swapped $PROBE_IN mUSD raw units for $OUT1 NDF wei through the permissioned router"

# Revoked by the operator: the same calldata is refused inside PermissionedHooks.beforeSwap (Unauthorized,
# wrapped by the PoolManager as WrappedError); forge reports the simulation failure and sends nothing.
cast send "$REGISTRY" "revoke(address,bytes32)" "$A2" "$POLICY" --rpc-url "$RPC" --private-key "$K0" >/dev/null
[ "$(cast call "$ADAPTER" "isAllowed(address,bytes2)(bool)" "$A2" 0x0001 --rpc-url "$RPC")" = false ] || die "adapter still allows the revoked probe"
set +e
SWAP2=$(DEPLOYER_PRIVATE_KEY=$K0 INVESTOR_PRIVATE_KEY=$K2 ATTEST_INVESTOR=false ADAPTER_ADDRESS=$ADAPTER REGISTRY_ADDRESS=$REGISTRY FUND_TOKEN_ADDRESS=$TOKEN STABLE_ADDRESS=$STABLE \
  POLICY_ID=$POLICY REQUIRED_BITS=$REQUIRED_BITS POOL_FEE=$POOL_FEE TICK_SPACING=$TICK_SPACING SWAP_AMOUNT_IN=$PROBE_IN \
  forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url "$RPC" --broadcast 2>&1); RC2=$?
set -e
echo "$SWAP2" > "$OUT/swap-revoked.log"
[ $RC2 -ne 0 ] || die "the revoked probe's swap went through"
# 0x82b42900 = Unauthorized(), 0x575e24b4 = beforeSwap selector, 0x90bfb865 = WrappedError (ERC-7751).
echo "$SWAP2" | grep -qiE "Unauthorized|82b42900|WrappedError|90bfb865" || { echo "$SWAP2" | tail -15; die "the revoked probe's swap failed, but not with Unauthorized/WrappedError"; }
say "revoked probe: swap refused (Unauthorized inside PermissionedHooks.beforeSwap, see $OUT/swap-revoked.log)"
fi

# ------------------------------------------------------------------ 6. outputs for the app
jq -n --arg rpcUrl "$RPC" --arg chainId "$CHAIN_ID" --arg forkUrl "$FORK_URL" --arg forkBlock "$FORK_BLOCK" \
  --arg registry "$REGISTRY" --arg fundToken "$TOKEN" --arg subscription "$SUBSCRIPTION" --arg stable "$STABLE" --arg checker "$CHECKER" --arg adapter "$ADAPTER" \
  --arg poolId "$POOL_ID" --arg currency0 "$C0" --arg currency1 "$C1" --arg fee "$POOL_FEE" --arg tickSpacing "$TICK_SPACING" --arg hooks "$HOOKS" \
  --arg poolManager "$POOL_MANAGER" --arg factory "$FACTORY" --arg router "$ROUTER" --arg positionManager "$POSM" --arg permit2 "$PERMIT2" --arg stateView "$STATE_VIEW" --arg quoter "$QUOTER" \
  --arg policyId "$POLICY" --arg requiredBits "$REQUIRED_BITS" --arg lpTokenId "$LP_TOKEN_ID" --arg liquidity "$LIQUIDITY" --arg probe "$A2" \
  '$ARGS.named | .chainId |= tonumber | .forkBlock |= tonumber | .fee |= tonumber | .tickSpacing |= tonumber' > "$OUT/pool.json"
cat > "$OUT/pool.env" <<EOF
VITE_POOL_ADAPTER=$ADAPTER
VITE_POOL_STABLE=$STABLE
VITE_POOL_FEE=$POOL_FEE
VITE_POOL_TICK_SPACING=$TICK_SPACING
EOF
say "wrote $OUT/pool.json and $OUT/pool.env"
echo "POOL-LOCAL PASS"
