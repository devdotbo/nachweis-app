#!/usr/bin/env bash
# One command deploys and configures the whole Attestat demo on Sepolia (or, with --dry-run, on a local
# anvil fork of Sepolia with the anvil dev signer, so the same steps can be rehearsed without a key).
#
# Steps, each skipped when the deployment record already holds a live address for it:
#   1. Deploy.s.sol                    AttestationRegistry, FundToken (NDF), Subscription; operator set
#   2. DeployNoirVerifier.s.sol        HonkVerifier + NoirPidVerifier pinned to the sandbox PID issuer
#                                      (the pin the browser-real-wallet stack uses), registry.setVerifier
#   3. CreatePermissionedPool.s.sol    MockStable (mUSD), EudiAllowlistChecker, Uniswap v4 PermissionsAdapter,
#                                      pool initialised, swapping enabled (published Sepolia Uniswap contracts)
#   4. AddLiquidityPermissioned.s.sol  full-range position, 1000 NDF + 1000 mUSD (deployer is the LP)
#   5. investor gas top-up             only when INVESTOR_ADDRESS is set: sends INVESTOR_FUND_ETH (0.02) if short
#   6. Etherscan verification          only with ETHERSCAN_API_KEY, never on a dry run (forge verify-contract)
#   7. --probe                         attest, subscribe and swap once with INVESTOR_PRIVATE_KEY to prove the
#                                      deployment is usable (dry run: anvil key 1)
# Then it writes the deployment record (addresses, tx hashes, gas) and prints the VITE_* and bridge env
# lines the browser-real-wallet stack needs for a Sepolia run (docs/demo-runbook.md, "Sepolia run").
#
# There is no ETH faucet step: the demo's only faucet is MockStable.mint from the connected wallet inside
# the app (Swap card), which works for anyone on a testnet. Gas for the investor comes from step 5.
#
# Usage: scripts/sepolia-deploy.sh [--dry-run] [--rpc-url URL] [--record FILE] [--probe] [--keep]
#   --dry-run    anvil forks Sepolia (SEPOLIA_RPC_URL, else publicnode) with chain id 31337; deployer and
#                investor are anvil keys 0 and 1; a real DEPLOYER_PRIVATE_KEY in .env is ignored; refuses
#                to run if the RPC answers chain id 11155111
#   --rpc-url    use this RPC instead of SEPOLIA_RPC_URL (real run) or instead of starting anvil (dry run)
#   --record     deployment record to read and write (default docs/deployments/sepolia-<date>.md;
#                dry run: .e2e/sepolia-dryrun/<timestamp>/record.md)
#   --probe      run step 7
#   --keep       dry run: leave anvil running (URL and pid printed)
# Reads .env at the repository root (never printed): SEPOLIA_RPC_URL, DEPLOYER_PRIVATE_KEY, optional
# ETHERSCAN_API_KEY, INVESTOR_ADDRESS, INVESTOR_FUND_ETH, INVESTOR_PRIVATE_KEY (--probe), PID_ISSUER_KEY_HASH
# (override the sandbox pin), POLICY_ID, REQUIRED_BITS, POOL_FEE, TICK_SPACING, FUND_LIQUIDITY,
# STABLE_LIQUIDITY, DEMO_AMOUNT, OPERATOR_ADDRESS. Every forge script default stays as documented in
# the script headers and .env.example.
# Expected last line: SEPOLIA-DEPLOY PASS
set -eEuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DRY=0; PROBE=0; KEEP=0; RPC_OVERRIDE=""; RECORD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1; shift ;;
    --rpc-url) RPC_OVERRIDE="$2"; shift 2 ;;
    --record) RECORD="$2"; shift 2 ;;
    --probe) PROBE=1; shift ;;
    --keep) KEEP=1; shift ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.foundry/bin:$PATH"
for tool in forge cast anvil jq python3 bc; do command -v "$tool" >/dev/null || { echo "missing tool: $tool" >&2; exit 1; }; done

# .env at the repository root, values never echoed.
if [ -f "$ROOT/.env" ]; then set -a; # shellcheck disable=SC1091
  . "$ROOT/.env"; set +a; fi

ZERO_KEY=0x0000000000000000000000000000000000000000000000000000000000000000
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80   # anvil 0 (dry run only)
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d   # anvil 1 (dry run probe only)
PUBLIC_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com
POLICY="${POLICY_ID:-0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f}"  # keccak256("nachweis.pid.over18.v1")
REQUIRED_BITS="${REQUIRED_BITS:-3}"; POOL_FEE="${POOL_FEE:-3000}"; TICK_SPACING="${TICK_SPACING:-60}"
FUND_LIQUIDITY="${FUND_LIQUIDITY:-1000000000000000000000}"; STABLE_LIQUIDITY="${STABLE_LIQUIDITY:-1000000000}"
INVESTOR_FUND_ETH="${INVESTOR_FUND_ETH:-0.02}"
SWAP_IN="${SWAP_AMOUNT_IN:-100000000}"
# The sandbox PID issuer pin is owned by the browser-real-wallet stack; read it from there so both agree.
SANDBOX_ISSUER_HASH=$(grep -m1 '^SANDBOX_ISSUER_HASH=' "$ROOT/scripts/browser-real-wallet-up.sh" | cut -d= -f2 | awk '{print $1}')
[[ "${SANDBOX_ISSUER_HASH:-}" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "SANDBOX_ISSUER_HASH not found in scripts/browser-real-wallet-up.sh" >&2; exit 1; }
ISSUER_HASH="${PID_ISSUER_KEY_HASH:-$SANDBOX_ISSUER_HASH}"
[[ "$ISSUER_HASH" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "PID_ISSUER_KEY_HASH must be a 0x-prefixed bytes32" >&2; exit 1; }
if [ "$ISSUER_HASH" = "$SANDBOX_ISSUER_HASH" ]; then ISSUER_LABEL="sandbox PID issuer (official German test wallet; scripts/browser-real-wallet-up.sh)"; else ISSUER_LABEL="PID_ISSUER_KEY_HASH from the environment"; fi
# Uniswap v4 permissioned-pool contracts on Sepolia (contracts/src/uniswap/UniswapSepolia.sol).
POOL_MANAGER=0xE03A1074c86CFeDd5C142C4F04F1a1536e203543; FACTORY=0xE6B0d96919334C33d06266d1420F97f6f434fA2B
HOOKS=0x51247E2291d290d17C08813A175AC86465EdE8c0; ROUTER=0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7
POSM=0xf99D553912084c99F6299291b75Fe9B7119Aa1A7; PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3
STATE_VIEW=0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C

T0=$(date +%s)
say() { echo "[$(( $(date +%s) - T0 ))s] $*"; }
die() { echo "FAIL: $*" >&2; exit 1; }
trap 'echo "FAIL: exit $? at line $LINENO: $BASH_COMMAND" >&2' ERR
ANVIL_PID=""
trap 'rc=$?; if [ -n "$ANVIL_PID" ] && [ $KEEP -eq 0 ]; then kill $ANVIL_PID 2>/dev/null || true; fi; [ $rc -eq 0 ] || echo "exit $rc" >&2' EXIT
has_code() { local c; c=$(cast code "$1" --rpc-url "$RPC" 2>/dev/null || echo 0x); [ "${#c}" -gt 4 ]; }
is_addr() { [[ "${1:-}" =~ ^0x[0-9a-fA-F]{40}$ ]]; }

# ------------------------------------------------------------------ 1. mode, RPC, keys
if [ $DRY -eq 1 ]; then
  DEPLOYER_KEY=$K0
  if [ -n "$RPC_OVERRIDE" ]; then RPC="$RPC_OVERRIDE"; FORK_URL="(attached)"; else
    FORK_URL="${SEPOLIA_RPC_URL:-$PUBLIC_SEPOLIA}"
    PORT=$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1]);s.close()')
    RPC="http://127.0.0.1:$PORT"
    RUN="$ROOT/.e2e/sepolia-dryrun/$(date +%Y%m%d-%H%M%S)"; mkdir -p "$RUN"
    anvil --fork-url "$FORK_URL" --chain-id 31337 --port "$PORT" --host 127.0.0.1 --retries 5 --timeout 30000 --silent > "$RUN/anvil.log" 2>&1 &
    ANVIL_PID=$!
    for _ in $(seq 1 120); do cast chain-id --rpc-url "$RPC" >/dev/null 2>&1 && break; sleep 1; done
  fi
  [ -n "$RECORD" ] || RECORD="${RUN:-$ROOT/.e2e/sepolia-dryrun/$(date +%Y%m%d-%H%M%S)}/record.md"
  MODE="dry run"
else
  [ -n "${SEPOLIA_RPC_URL:-}" ] || die "SEPOLIA_RPC_URL is missing: put it into $ROOT/.env (see .env.example) or run with --dry-run"
  [ -n "${DEPLOYER_PRIVATE_KEY:-}" ] && [ "$DEPLOYER_PRIVATE_KEY" != "$ZERO_KEY" ] || die "DEPLOYER_PRIVATE_KEY is missing or the all-zero placeholder: put the funded Sepolia deployer key into $ROOT/.env"
  [[ "$DEPLOYER_PRIVATE_KEY" =~ ^0x[0-9a-fA-F]{64}$ ]] || die "DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key"
  DEPLOYER_KEY="$DEPLOYER_PRIVATE_KEY"
  RPC="${RPC_OVERRIDE:-$SEPOLIA_RPC_URL}"; FORK_URL=""
  [ -n "$RECORD" ] || RECORD="$ROOT/docs/deployments/sepolia-$(date +%F).md"
  MODE="Sepolia"
fi
case "$RECORD" in /*) ;; *) RECORD="$PWD/$RECORD" ;; esac
mkdir -p "$(dirname "$RECORD")"
CHAIN_ID=$(cast chain-id --rpc-url "$RPC" 2>/dev/null) || die "no node at $RPC"
if [ $DRY -eq 1 ]; then
  [ "$CHAIN_ID" = 31337 ] || die "dry run refuses chain id $CHAIN_ID (a dry run only talks to an anvil fork with chain id 31337)"
else
  [ "$CHAIN_ID" = 11155111 ] || die "chain id is $CHAIN_ID, expected Sepolia 11155111"
fi
DEPLOYER=$(cast wallet address --private-key "$DEPLOYER_KEY")
BAL0=$(cast balance "$DEPLOYER" --rpc-url "$RPC")
GAS_PRICE=$(cast gas-price --rpc-url "$RPC")
BLOCK0=$(cast block-number --rpc-url "$RPC")
[ "$BAL0" != 0 ] || die "deployer $DEPLOYER holds no ETH on chain $CHAIN_ID"
for name in POOL_MANAGER FACTORY HOOKS ROUTER POSM PERMIT2 STATE_VIEW; do
  has_code "${!name}" || die "no code at $name ${!name}: $RPC is not Sepolia or a fork of it"
done
say "$MODE: rpc $RPC, chain $CHAIN_ID, block $BLOCK0, deployer $DEPLOYER ($(cast from-wei "$BAL0") ETH), gas price $(cast from-wei "$GAS_PRICE" gwei) gwei${FORK_URL:+, fork of $FORK_URL}"
say "record $RECORD; issuer pin $ISSUER_HASH ($ISSUER_LABEL); policy $POLICY"

# ------------------------------------------------------------------ 2. the record: reuse live addresses
rec() { [ -f "$RECORD" ] && grep -m1 "^$1=" "$RECORD" | cut -d= -f2- || true; }
REGISTRY=$(rec REGISTRY); TOKEN=$(rec FUND_TOKEN); SUBSCRIPTION=$(rec SUBSCRIPTION)
HONK=$(rec HONK_VERIFIER); NOIR=$(rec NOIR_VERIFIER)
STABLE=$(rec MOCK_STABLE); CHECKER=$(rec CHECKER); ADAPTER=$(rec ADAPTER); POOL_ID=$(rec POOL_ID); C0=$(rec CURRENCY0); C1=$(rec CURRENCY1)
LP_TOKEN_ID=$(rec LP_TOKEN_ID); DEPLOY_BLOCK=$(rec DEPLOY_BLOCK)
GAS_BEFORE=$(rec DEPLOYER_GAS_TOTAL); GAS_BEFORE=${GAS_BEFORE:-0}
PROBE_BEFORE=$( [ -f "$RECORD" ] && grep -m1 '^- Probe: ' "$RECORD" | cut -d' ' -f3- || true)
[ -z "$(rec CHAIN_ID)" ] || [ "$(rec CHAIN_ID)" = "$CHAIN_ID" ] || die "$RECORD is for chain $(rec CHAIN_ID), this node is $CHAIN_ID; pass another --record"
RUNS_TAIL=""; [ -f "$RECORD" ] && RUNS_TAIL=$(awk 'f{print} /^## Runs/{f=1}' "$RECORD") || true

# ------------------------------------------------------------------ 3. helpers around forge script
cd "$ROOT/contracts"
ROWS=""; TOTAL_GAS=0
gas_of_receipts() { # broadcast json -> total gasUsed (decimal)
  jq -r '.receipts[].gasUsed' "$1" | while read -r h; do cast to-dec "$h"; done | paste -sd+ - | bc
}
note_run() { # step, script file, broadcast json
  local gas hashes
  gas=$(gas_of_receipts "$3"); TOTAL_GAS=$(( TOTAL_GAS + gas ))
  hashes=$(jq -r '.transactions[] | "\(.contractName // .function // .transactionType) \(.hash)"' "$3" | paste -sd';' - | sed 's/;/; /g')
  ROWS+="| $1 | $2 | $gas | $hashes |"$'\n'
  say "  $1: $gas gas, $(jq '.transactions | length' "$3") transactions"
}
run_script() { # step label, script file, contract name, env assignments...
  local step="$1" file="$2" name="$3"; shift 3
  local out
  out=$(env "$@" DEPLOYER_PRIVATE_KEY="$DEPLOYER_KEY" POLICY_ID="$POLICY" REQUIRED_BITS="$REQUIRED_BITS" \
    forge script "script/$file:$name" --rpc-url "$RPC" --broadcast --slow 2>&1) || { echo "$out" | tail -30; die "$file failed"; }
  LAST_OUT="$out"
  LAST_JSON="$ROOT/contracts/broadcast/$file/$CHAIN_ID/run-latest.json"
  [ -f "$LAST_JSON" ] || die "no broadcast file $LAST_JSON"
  note_run "$step" "$file" "$LAST_JSON"
}
grab() { echo "$LAST_OUT" | awk -v k="$1" 'index($0,k)>0 {print $NF; exit}'; }

# ------------------------------------------------------------------ 4. step 1: registry, FundToken, Subscription
if is_addr "$REGISTRY" && has_code "$REGISTRY" && is_addr "$TOKEN" && is_addr "$SUBSCRIPTION"; then
  say "step 1 skipped: registry $REGISTRY already live (record)"
else
  say "step 1: Deploy.s.sol (registry, FundToken, Subscription)"
  run_script 1 Deploy.s.sol Deploy ${OPERATOR_ADDRESS:+OPERATOR_ADDRESS=$OPERATOR_ADDRESS} ${DEMO_AMOUNT:+DEMO_AMOUNT=$DEMO_AMOUNT}
  REGISTRY=$(grab AttestationRegistry:); TOKEN=$(grab FundToken:); SUBSCRIPTION=$(grab Subscription:)
  is_addr "$REGISTRY" && is_addr "$TOKEN" && is_addr "$SUBSCRIPTION" || die "could not parse the Deploy.s.sol output"
  DEPLOY_BLOCK=$(jq -r '.receipts[0].blockNumber' "$LAST_JSON" | xargs cast to-dec)
fi
OP="${OPERATOR_ADDRESS:-$DEPLOYER}"
[ "$(cast call "$REGISTRY" "isOperator(bytes32,address)(bool)" "$POLICY" "$OP" --rpc-url "$RPC")" = true ] || die "$OP is not an operator for $POLICY on $REGISTRY"
say "registry $REGISTRY, FundToken $TOKEN, Subscription $SUBSCRIPTION, operator $OP"

# ------------------------------------------------------------------ 5. step 2: Noir verifier pinned to the sandbox issuer
if is_addr "$NOIR" && has_code "$NOIR"; then
  say "step 2 skipped: NoirPidVerifier $NOIR already live (record)"
else
  say "step 2: DeployNoirVerifier.s.sol (HonkVerifier, NoirPidVerifier, setVerifier)"
  run_script 2 DeployNoirVerifier.s.sol DeployNoirVerifier REGISTRY_ADDRESS="$REGISTRY" PID_ISSUER_KEY_HASH="$ISSUER_HASH" ${HONK_VERIFIER:+HONK_VERIFIER=$HONK_VERIFIER}
  NOIR=$(grab NoirPidVerifier:); HONK=$(grab HonkVerifier:)
  is_addr "$NOIR" && is_addr "$HONK" || die "could not parse the DeployNoirVerifier.s.sol output"
fi
if [ "$(cast call "$REGISTRY" "verifierOf(bytes32)(address)" "$POLICY" --rpc-url "$RPC")" != "$NOIR" ]; then
  say "  registry.setVerifier($POLICY, $NOIR)"
  cast send "$REGISTRY" "setVerifier(bytes32,address)" "$POLICY" "$NOIR" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
fi
PINNED=$(cast call "$NOIR" "ISSUER_KEY_HASH()(bytes32)" --rpc-url "$RPC")
[ "$PINNED" = "$ISSUER_HASH" ] || die "NoirPidVerifier $NOIR is pinned to $PINNED, not $ISSUER_HASH"
say "NoirPidVerifier $NOIR (HonkVerifier $HONK) pinned to $ISSUER_HASH; registry verifier set"

# ------------------------------------------------------------------ 6. step 3: the permissioned pool
if is_addr "$ADAPTER" && has_code "$ADAPTER" && is_addr "$STABLE"; then
  say "step 3 skipped: PermissionsAdapter $ADAPTER already live (record)"
else
  say "step 3: CreatePermissionedPool.s.sol (MockStable, checker, adapter, pool)"
  run_script 3 CreatePermissionedPool.s.sol CreatePermissionedPool REGISTRY_ADDRESS="$REGISTRY" FUND_TOKEN_ADDRESS="$TOKEN" POOL_FEE="$POOL_FEE" TICK_SPACING="$TICK_SPACING"
  STABLE=$(grab MockStable:); CHECKER=$(grab EudiAllowlistChecker:); ADAPTER=$(grab PermissionsAdapter:)
  C0=$(grab "Pool currency0:"); C1=$(grab "Pool currency1:")
  POOL_ID=$(echo "$LAST_OUT" | awk '/^ *PoolId:/ {getline; print $1; exit}')
  is_addr "$STABLE" && is_addr "$CHECKER" && is_addr "$ADAPTER" && [[ "$POOL_ID" =~ ^0x[0-9a-fA-F]{64}$ ]] || die "could not parse the CreatePermissionedPool.s.sol output"
fi
[ "$(cast call "$CHECKER" "registry()(address)" --rpc-url "$RPC")" = "$REGISTRY" ] || die "checker $CHECKER does not read $REGISTRY"
[ "$(cast call "$ADAPTER" "swappingEnabled()(bool)" --rpc-url "$RPC")" = true ] || die "adapter $ADAPTER: swapping not enabled"
say "MockStable $STABLE, checker $CHECKER, adapter $ADAPTER, pool $POOL_ID"

# ------------------------------------------------------------------ 7. step 4: liquidity
LIQ=$(cast call "$STATE_VIEW" "getLiquidity(bytes32)(uint128)" "$POOL_ID" --rpc-url "$RPC" | awk '{print $1}')
if [ "$LIQ" != 0 ]; then
  say "step 4 skipped: pool already holds liquidity $LIQ"
else
  say "step 4: AddLiquidityPermissioned.s.sol (full range, $FUND_LIQUIDITY NDF wei + $STABLE_LIQUIDITY mUSD raw)"
  run_script 4 AddLiquidityPermissioned.s.sol AddLiquidityPermissioned ADAPTER_ADDRESS="$ADAPTER" REGISTRY_ADDRESS="$REGISTRY" FUND_TOKEN_ADDRESS="$TOKEN" STABLE_ADDRESS="$STABLE" \
    POOL_FEE="$POOL_FEE" TICK_SPACING="$TICK_SPACING" FUND_AMOUNT="$FUND_LIQUIDITY" STABLE_AMOUNT="$STABLE_LIQUIDITY" ${LP_PRIVATE_KEY:+LP_PRIVATE_KEY=$LP_PRIVATE_KEY}
  LP_TOKEN_ID=$(grab "Position tokenId:")
  LIQ=$(cast call "$STATE_VIEW" "getLiquidity(bytes32)(uint128)" "$POOL_ID" --rpc-url "$RPC" | awk '{print $1}')
  [ "$LIQ" != 0 ] || die "pool liquidity is 0 after the mint"
fi
say "liquidity $LIQ (position ${LP_TOKEN_ID:-?})"

# ------------------------------------------------------------------ 8. step 5: investor gas top-up (optional)
INVESTOR_KEY=""; INVESTOR=""
if [ $PROBE -eq 1 ]; then
  if [ $DRY -eq 1 ]; then INVESTOR_KEY=$K1; else
    [ -n "${INVESTOR_PRIVATE_KEY:-}" ] || die "--probe on Sepolia needs INVESTOR_PRIVATE_KEY in .env"
    INVESTOR_KEY="$INVESTOR_PRIVATE_KEY"
  fi
  INVESTOR=$(cast wallet address --private-key "$INVESTOR_KEY")
fi
TOPUP="${INVESTOR_ADDRESS:-$INVESTOR}"
if is_addr "$TOPUP"; then
  WANT=$(cast to-wei "$INVESTOR_FUND_ETH")
  HAVE=$(cast balance "$TOPUP" --rpc-url "$RPC")
  if python3 -c "import sys; sys.exit(0 if int('$HAVE') >= int('$WANT') else 1)"; then
    say "step 5 skipped: investor $TOPUP holds $(cast from-wei "$HAVE") ETH"
  else
    say "step 5: sending $INVESTOR_FUND_ETH ETH to investor $TOPUP"
    R=$(cast send "$TOPUP" --value "$WANT" --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --json)
    g=$(echo "$R" | jq -r .gasUsed | xargs cast to-dec); TOTAL_GAS=$(( TOTAL_GAS + g ))
    ROWS+="| 5 | investor top-up $INVESTOR_FUND_ETH ETH | $g | transfer $(echo "$R" | jq -r .transactionHash) |"$'\n'
  fi
else
  say "step 5 skipped: no INVESTOR_ADDRESS (the investor wallet needs its own Sepolia ETH for subscribe and swap)"
fi

# ------------------------------------------------------------------ 9. step 6: Etherscan verification (optional, never on a dry run)
VERIFY_NOTE="not run"
if [ $DRY -eq 0 ] && [ -n "${ETHERSCAN_API_KEY:-}" ]; then
  VERIFY_NOTE=""
  for file in Deploy.s.sol DeployNoirVerifier.s.sol CreatePermissionedPool.s.sol; do
    J="$ROOT/contracts/broadcast/$file/$CHAIN_ID/run-latest.json"; [ -f "$J" ] || continue
    while read -r name addr; do
      [ -n "$addr" ] && [ "$addr" != null ] && [ "$name" != null ] || continue
      if forge verify-contract --chain sepolia --etherscan-api-key "$ETHERSCAN_API_KEY" --guess-constructor-args --watch "$addr" "$name" >/dev/null 2>&1; then
        VERIFY_NOTE+="$name $addr verified; "
      else VERIFY_NOTE+="$name $addr NOT verified (run forge verify-contract by hand); "; fi
    done < <(jq -r '.transactions[] | select(.transactionType=="CREATE") | "\(.contractName) \(.contractAddress)"' "$J")
  done
  say "step 6: $VERIFY_NOTE"
else
  [ $DRY -eq 1 ] && VERIFY_NOTE="skipped (dry run)" || VERIFY_NOTE="skipped (no ETHERSCAN_API_KEY)"
  say "step 6 $VERIFY_NOTE"
fi

# ------------------------------------------------------------------ 10. step 7: probe (attest, subscribe, swap)
PROBE_NOTE="${PROBE_BEFORE:-not run}"
if [ $PROBE -eq 1 ]; then
  say "step 7: probe with investor $INVESTOR"
  if [ "$(cast call "$REGISTRY" "isEligible(address,bytes32,uint256)(bool)" "$INVESTOR" "$POLICY" "$REQUIRED_BITS" --rpc-url "$RPC")" != true ]; then
    EXP=$(( $(date +%s) + 30*86400 ))
    R=$(cast send "$REGISTRY" "attestByOperator(address,(bytes32,uint256,uint8,uint64,bytes32,bool))" "$INVESTOR" "($POLICY,$REQUIRED_BITS,1,$EXP,0x0000000000000000000000000000000000000000000000000000000000000000,false)" \
      --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" --json)
    g=$(echo "$R" | jq -r .gasUsed | xargs cast to-dec); TOTAL_GAS=$(( TOTAL_GAS + g ))
    ROWS+="| 7a | attestByOperator (operator path) | $g | $(echo "$R" | jq -r .transactionHash) |"$'\n'
  fi
  NDF0=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$INVESTOR" --rpc-url "$RPC" | awk '{print $1}')
  R=$(cast send "$SUBSCRIPTION" "subscribe()" --rpc-url "$RPC" --private-key "$INVESTOR_KEY" --json) || die "subscribe() failed"
  g=$(echo "$R" | jq -r .gasUsed | xargs cast to-dec); PROBE_GAS=$g
  ROWS+="| 7b | Subscription.subscribe (investor) | $g | $(echo "$R" | jq -r .transactionHash) |"$'\n'
  NDF1=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$INVESTOR" --rpc-url "$RPC" | awk '{print $1}')
  [ "$NDF1" != "$NDF0" ] || die "subscribe() minted nothing"
  SW=$(env DEPLOYER_PRIVATE_KEY="$DEPLOYER_KEY" INVESTOR_PRIVATE_KEY="$INVESTOR_KEY" ATTEST_INVESTOR=false ADAPTER_ADDRESS="$ADAPTER" REGISTRY_ADDRESS="$REGISTRY" \
    FUND_TOKEN_ADDRESS="$TOKEN" STABLE_ADDRESS="$STABLE" POLICY_ID="$POLICY" REQUIRED_BITS="$REQUIRED_BITS" POOL_FEE="$POOL_FEE" TICK_SPACING="$TICK_SPACING" SWAP_AMOUNT_IN="$SWAP_IN" \
    forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url "$RPC" --broadcast --slow 2>&1) || { echo "$SW" | tail -30; die "SwapPermissioned.s.sol failed"; }
  LAST_OUT="$SW"; SWAP_OUT=$(grab "FundToken out:")
  [ -n "$SWAP_OUT" ] && [ "$SWAP_OUT" != 0 ] || die "the probe swap returned no FundToken"
  J="$ROOT/contracts/broadcast/SwapPermissioned.s.sol/$CHAIN_ID/run-latest.json"
  sg=$(gas_of_receipts "$J"); PROBE_GAS=$(( PROBE_GAS + sg ))
  ROWS+="| 7c | SwapPermissioned.s.sol ($SWAP_IN mUSD raw in) | $sg | $(jq -r '.transactions[] | "\(.function // "tx") \(.hash)"' "$J" | paste -sd';' - | sed 's/;/; /g') |"$'\n'
  MINTED=$(python3 -c "print(int('$NDF1')-int('$NDF0'))")
  PROBE_NOTE="investor $INVESTOR: subscribe minted $MINTED NDF wei; swap of $SWAP_IN mUSD raw returned $SWAP_OUT NDF wei; probe gas $PROBE_GAS (not counted in the deployer total)"
  say "  $PROBE_NOTE"
fi

# ------------------------------------------------------------------ 11. gas and ETH requirement
BAL1=$(cast balance "$DEPLOYER" --rpc-url "$RPC")
SPENT=$(python3 -c "print(('%.6f' % ((int('$BAL0')-int('$BAL1'))/1e18)))")
GAS_ALL=$(( GAS_BEFORE + TOTAL_GAS ))
ETH_LINE=$(python3 - "$GAS_ALL" "$TOTAL_GAS" <<'PY'
import sys
g=int(sys.argv[1]); r=int(sys.argv[2]); m=1.5
print(f"{g} gas used by the deployer over all runs of this record ({r} in this run); at 2 gwei {g*2e9/1e18:.4f} ETH, at 20 gwei {g*20e9/1e18:.4f} ETH; with a 1.5 margin fund {g*2e9*m/1e18:.3f} ETH (2 gwei) to {g*20e9*m/1e18:.3f} ETH (20 gwei)")
PY
)
say "$ETH_LINE"

# ------------------------------------------------------------------ 12. the record and the env lines
DATE=$(date +%F); STAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if [ $DRY -eq 1 ]; then RPC_LINE="<SEPOLIA_RPC_URL>"; APP_CHAIN=11155111; DRY_NOTE="Dry run on an anvil fork of Sepolia (chain id 31337, fork source $FORK_URL, fork block $BLOCK0). The addresses below exist only on that fork. The env lines are written as they would be for a real Sepolia run."; else RPC_LINE="\$SEPOLIA_RPC_URL"; APP_CHAIN=11155111; DRY_NOTE=""; fi
ENV_APP=$(cat <<EOF
VITE_CHAIN_ID=$APP_CHAIN
VITE_RPC_URL=$RPC_LINE
VITE_REGISTRY=$REGISTRY
VITE_FUND_TOKEN=$TOKEN
VITE_SUBSCRIPTION=$SUBSCRIPTION
VITE_POLICY_ID=$POLICY
VITE_REQUIRED_BITS=$REQUIRED_BITS
VITE_POOL_ADAPTER=$ADAPTER
VITE_POOL_STABLE=$STABLE
VITE_POOL_FEE=$POOL_FEE
VITE_POOL_TICK_SPACING=$TICK_SPACING
EOF
)
ENV_BRIDGE=$(cat <<EOF
RPC_URL=$RPC_LINE
OPERATOR_PRIVATE_KEY=\$DEPLOYER_PRIVATE_KEY
REGISTRY=$REGISTRY
NOIR_VERIFIER=$NOIR
POLICY_ID=nachweis.pid.over18.v1
REQUIRE_ADDRESS_PROOF=true
EOF
)
ENV_AUTOMATION=$(cat <<EOF
CHAIN_ID=$APP_CHAIN
RPC_URL=$RPC_LINE
REGISTRY=$REGISTRY
SUBSCRIPTION=$SUBSCRIPTION
FUND_TOKEN=$TOKEN
START_BLOCK=${DEPLOY_BLOCK:-$BLOCK0}
EOF
)
{
cat <<EOF
# Sepolia deployment record, $DATE

Written by scripts/sepolia-deploy.sh ($MODE). Re-running the script with \`--record $(python3 -c "import os,sys;print(os.path.relpath(sys.argv[1], sys.argv[2]))" "$RECORD" "$ROOT")\` skips every step whose address below is live.
$DRY_NOTE

- Deployer (registry owner, token issuer, operator, LP): $DEPLOYER
- Policy id: $POLICY (keccak256("nachweis.pid.over18.v1")), required bits $REQUIRED_BITS
- NoirPidVerifier issuer pin: $ISSUER_HASH ($ISSUER_LABEL)
- Uniswap v4 on Sepolia: PoolManager $POOL_MANAGER, PermissionsAdapterFactory $FACTORY, PermissionedHooks $HOOKS, UniversalRouter $ROUTER, PositionManager $POSM, Permit2 $PERMIT2, StateView $STATE_VIEW
- Etherscan verification: $VERIFY_NOTE
- Probe: $PROBE_NOTE

## Addresses

\`\`\`
CHAIN_ID=$CHAIN_ID
DEPLOYER=$DEPLOYER
DEPLOY_BLOCK=${DEPLOY_BLOCK:-$BLOCK0}
REGISTRY=$REGISTRY
FUND_TOKEN=$TOKEN
SUBSCRIPTION=$SUBSCRIPTION
HONK_VERIFIER=$HONK
NOIR_VERIFIER=$NOIR
MOCK_STABLE=$STABLE
CHECKER=$CHECKER
ADAPTER=$ADAPTER
POOL_ID=$POOL_ID
CURRENCY0=$C0
CURRENCY1=$C1
POOL_FEE=$POOL_FEE
TICK_SPACING=$TICK_SPACING
LP_TOKEN_ID=${LP_TOKEN_ID:-}
POLICY_ID=$POLICY
ISSUER_KEY_HASH=$ISSUER_HASH
DEPLOYER_GAS_TOTAL=$GAS_ALL
\`\`\`

## Env lines for the browser-real-wallet stack (docs/demo-runbook.md, "Sepolia run")

App (Vite), \`scripts/browser-real-wallet-up.sh --deployment <this file>\` passes them itself:

\`\`\`
$ENV_APP
\`\`\`

Bridge (service/):

\`\`\`
$ENV_BRIDGE
\`\`\`

Automation (automation/.env, only with the Privy standing order):

\`\`\`
$ENV_AUTOMATION
\`\`\`

## Gas

$ETH_LINE
Deployer balance went from $(cast from-wei "$BAL0") to $(cast from-wei "$BAL1") ETH ($SPENT ETH spent at the node's gas price, $(cast from-wei "$GAS_PRICE" gwei) gwei at start).

## Runs
$RUNS_TAIL

### $STAMP ($MODE, block $BLOCK0)

| step | what | gas used | transactions |
|---|---|---|---|
$ROWS
EOF
} > "$RECORD"
say "wrote $RECORD"

echo
echo "# app (Vite), also passed by scripts/browser-real-wallet-up.sh --deployment $RECORD"
echo "$ENV_APP"
echo "# bridge (service/)"
echo "$ENV_BRIDGE"
echo "# automation (Privy standing order only)"
echo "$ENV_AUTOMATION"
echo
[ $DRY -eq 1 ] && [ $KEEP -eq 1 ] && say "anvil kept on $RPC (pid $ANVIL_PID)"
echo "SEPOLIA-DEPLOY PASS"
