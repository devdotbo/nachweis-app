# Uniswap v4 permissioned pool for the Nachweis FundToken

Status: contracts, scripts and tests done; every script is dry-run only. Nothing has been broadcast to Sepolia from this repository. The full sequence (onboard, mint liquidity, swap, revoke, swap fails) passes on a Sepolia fork against the live Uniswap contracts.

## What it is

Uniswap ships a shared, audited permissioned-pool stack on Sepolia and mainnet: a `PermissionsAdapterFactory` that creates one `PermissionsAdapter` (a virtual ERC-20) per permissioned token, and a `PermissionedHooks` contract that asks the adapter `isAllowed(account, flag)` before every swap and liquidity mint. The adapter delegates that question to an `IAllowlistChecker` the issuer supplies.

Nachweis supplies that checker: `EudiAllowlistChecker` answers from `AttestationRegistry.isEligible(account, policyId, requiredBits)`. The same on-chain fact that gates `FundToken` transfers now gates the pool. Revoking or expiring a decision closes token transfers, subscriptions and the pool in one step. No personal data is stored anywhere in this path.

Files:

- `contracts/src/uniswap/EudiAllowlistChecker.sol`: the checker. Immutable, view-only, no owner.
- `contracts/src/uniswap/interfaces/IAllowlistChecker.sol`, `libraries/PermissionFlags.sol`, `interfaces/IPermissionsAdapterFactory.sol`: copied from Uniswap/v4-periphery (MIT) with the source commit in each header.
- `contracts/src/uniswap/interfaces/IPermissionsAdapterLite.sol`, `IPoolManagerLite.sol`, `IPermissionedPositionManagerLite.sol`, `IUniversalRouterLite.sol`, `IPermit2Lite.sol`, `IStateViewLite.sol`: hand-written ABI subsets so the repo does not depend on v4-core, permit2 or solmate.
- `contracts/src/uniswap/libraries/PermissionedPoolActions.sol`: the calldata the position manager and the Universal Router decode (MINT_POSITION + SETTLE_PAIR, V4_SWAP with SWAP_EXACT_IN_SINGLE + SETTLE_ALL + TAKE_ALL), plus the PoolId. `TickMath.sol` and `LiquidityAmounts.sol` are trimmed copies from v4-core (MIT) for sizing a position.
- `contracts/src/uniswap/UniswapSepolia.sol`: the published Sepolia addresses and how they were verified.
- `contracts/test/EudiAllowlistChecker.t.sol`, `contracts/test/PermissionedPoolFactory.t.sol`, `contracts/test/PermissionedPoolSwap.fork.t.sol`: tests, see below.
- `contracts/test/fixtures/PermissionsAdapterFactory.json`: creation bytecode of the real factory, built from v4-periphery main at `dce236d4e2057422d0791d9a973a58765eb46f65` (solc 0.8.26, via_ir, optimizer runs 44444444). Used with `vm.getCode` so the tests exercise the real adapter without a network.
- `contracts/script/lib/PermissionedPoolOnboarding.sol`: steps 1 to 6 as one internal function, shared by the scripts and the fork tests.
- `contracts/script/CreatePermissionedPool.s.sol`: the onboarding script (step 0 deploys or reuses the Nachweis contracts, then the library).
- `contracts/script/PermissionedPoolScriptBase.s.sol`, `AddLiquidityPermissioned.s.sol`, `SwapPermissioned.s.sol`: the liquidity mint and the investor swap, see "Liquidity and swap".

## Sources and verification

Guide: https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool (fetched 2026-09-07).
Source: https://github.com/Uniswap/v4-periphery/tree/main/src/hooks/permissionedPools (main at `dce236d`, 2026-08-20; the guide pins `3245c3c`).
Liquidity guide: https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/provide-liquidity (fetched 2026-09-07).
Swap guide: https://developers.uniswap.org/docs/trading/swapping-api/swapping-permissioned-pools (fetched 2026-09-07; it covers the Trading API only, the direct router calldata below comes from the v4-periphery and universal-router sources).
Router source: https://github.com/Uniswap/universal-router (main, `contracts/modules/uniswap/v4/V4SwapRouter.sol` inherits `PermissionedV4Router`; last change to that file 2026-05-27, commit `020e1b7`).
Deployments feed: https://developers.uniswap.org/deployments.json (records `permissioned-pools-*-sepolia`, `permit2-permit2-sepolia`, `v4-stateview-sepolia`; generatedAt 2026-07-15).

| Contract (Sepolia) | Address |
|---|---|
| PoolManager (v4-core 1.0.0) | 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 |
| PermissionsAdapterFactory | 0xE6B0d96919334C33d06266d1420F97f6f434fA2B |
| PermissionedPositionManager | 0xf99D553912084c99F6299291b75Fe9B7119Aa1A7 |
| PermissionedHooks | 0x51247E2291d290d17C08813A175AC86465EdE8c0 |
| Universal Router (permissioned build) | 0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7 |
| V4Quoter | 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227 |
| MixedRouteQuoterV2 | 0x4745F77b56a0E2294426E3936dc4Fab68d9543Cd |
| Permit2 | 0x000000000022D473030F116dDEE9F6B43aC78BA3 |
| StateView | 0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C |

Read-only checks run on 2026-09-07 (block 11655859, public RPC): the factory has code and `POOL_MANAGER()` returns the PoolManager above; `PermissionedHooks.PERMISSIONS_ADAPTER_FACTORY()` returns the factory; the factory's runtime bytecode equals a local build of v4-periphery main at `dce236d` except for the two immutable `POOL_MANAGER` slots (40 differing bytes of 11623). So the deployed adapter is the `main` version, which has `updateAllowedHook`; the commit the guide pins (`3245c3c`) does not have it. A log query for `PermissionsAdapterCreated` from block 8,000,000 returned no events (whether the RPC capped the range is unverified).

Swap and liquidity entry points, checked 2026-09-07 at block 11655920: the permissioned Universal Router and the PermissionedPositionManager have code, both report `PERMISSIONS_ADAPTER_FACTORY()` == the factory and `poolManager()` == the PoolManager; the position manager reports `permit2()` == the Permit2 address above and `name()` == "Uniswap v4 Permissioned Positions NFT"; StateView reports `poolManager()` == the PoolManager. The router has no public Permit2 getter. `deployments.json` lists three Universal Routers for Sepolia (the 2.0.0 release at 0x470FFC67…, v2.2 at 0xB0C89059…, and the permissioned build); only the permissioned build routes through pools whose currency is a verified adapter.

The hook address ends in `0xE8C0`, i.e. v4 hook flags beforeInitialize, beforeAddLiquidity, beforeSwap and afterSwap. That matches `test/hooks/permissionedPools/mocks/MockPermissionedHooks.sol` in v4-periphery, which is the only hook source in the repository; the production `PermissionedHooks` source is not in v4-periphery main.

## The seven steps

From the guide, with who runs each in this project.

| Step | What | Who | Where in this repo |
|---|---|---|---|
| 1 | Implement an allowlist checker | code | `EudiAllowlistChecker.sol` |
| 2 | `factory.createPermissionsAdapter(fundToken, owner, checker)` | script (permissionless) | script step 2 |
| 3 | Allowlist and fund the adapter with at least 1 wei | script; needs the registry operator key | script step 3 |
| 4 | `factory.verifyPermissionsAdapter(adapter)` | script (permissionless once step 3 is done) | script step 4 |
| 5 | `updateAllowedWrapper` for position manager, router, both quoters; `updateAllowedHook(PermissionedHooks)` | script, adapter owner | script step 5 |
| 6 | `PoolManager.initialize(key, sqrtPrice)` with the adapter as a currency and `PermissionedHooks`; `updateSwappingEnabled(true)` | script, adapter owner | script step 6 |
| 7 | Routing allowlist with Uniswap Labs (web form) | human, then the Uniswap team | not automatable |

Step 3 for Nachweis: the FundToken has no static allowlist, its transfer gate is the registry. So "allowlist the adapter" means the operator attests the adapter address under the policy (`tier 0`, no expiry, `statusRef = keccak256("nachweis.venue.uniswap-permissions-adapter")`). This is a venue approval expressed in the same record type; a production FundToken would carry an explicit venue list instead of attesting a contract as a person. The test `test_verifyRequiresAdapterToHoldFundToken` shows both the failure before attestation and the success after.

Step 6 initialises the pool at one whole FundToken per whole stable (`sqrtPriceOneToOne` in the onboarding library accounts for the 18 and 6 decimals; with the stable as currency0 that is tick 276324, otherwise -276325). Both sides are demo tokens; the price only makes the swap numbers readable.

Step 7 is the only step that needs anyone outside this repository. It is required "on every network, including mainnet and Sepolia" for routing in the Uniswap interface and Trading API; swaps sent directly to the Universal Router or through the position manager do not need it. The form asks for the permissioned token address, the verified adapter address, a KYC URL and an issuer display name. For Nachweis the URL would be the issuer onboarding page where a wallet presents its EUDI PID and receives the attestation; the word the form uses is Uniswap's label, the Nachweis side is an attester, not a KYC provider.

## Running

Dry runs against a Sepolia fork, nothing is sent. `--rpc-url sepolia` resolves `SEPOLIA_RPC_URL` from `.env`.

```
cd contracts
DEPLOYER_PRIVATE_KEY=<key> forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url sepolia
DEPLOYER_PRIVATE_KEY=<key> forge script script/AddLiquidityPermissioned.s.sol:AddLiquidityPermissioned --rpc-url sepolia
DEPLOYER_PRIVATE_KEY=<key> INVESTOR_PRIVATE_KEY=<key> forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url sepolia
REVOKE_INVESTOR=true DEPLOYER_PRIVATE_KEY=<key> INVESTOR_PRIVATE_KEY=<key> forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url sepolia
```

Env vars: `REGISTRY_ADDRESS` and `FUND_TOKEN_ADDRESS` reuse deployed Nachweis contracts (the deployer must be the FundToken issuer and an operator for `POLICY_ID`); without them `CreatePermissionedPool` deploys a fresh registry and FundToken. `POLICY_ID`, `REQUIRED_BITS`, `POOL_FEE`, `TICK_SPACING` have defaults. The liquidity and swap scripts take `ADAPTER_ADDRESS` plus `REGISTRY_ADDRESS`, `FUND_TOKEN_ADDRESS`, `STABLE_ADDRESS` for an existing pool; without `ADAPTER_ADDRESS` they bootstrap the whole stack inside the same simulation, so they can be dry-run before anything exists on Sepolia. Script-specific vars are in each script header and in `/.env.example`.

Dry runs recorded on 2026-09-07 against the live Sepolia state with throwaway keys:

- `CreatePermissionedPool`: all six on-chain steps simulated, including `PoolManager.initialize` through the real `PermissionedHooks`.
- `AddLiquidityPermissioned` (bootstrapping): LP attested, 1000 NDF and 1000 mUSD, full range, liquidity 999000000000000, position tokenId 9 on the live position manager, adapter balance of the PoolManager 999 NDF; 8,195,312 gas for the whole run.
- `SwapPermissioned` (bootstrapping): investor attested, 100 mUSD in, 90.652862473832711386 NDF out, tick moved from 276324 to 274421; 8,921,394 gas for the whole run. With `REVOKE_INVESTOR=true` the run stops at `UniversalRouter.execute` with `WrappedError(0x51247E2291d290d17C08813A175AC86465EdE8c0, 0x575e24b4 /* beforeSwap */, Unauthorized(), HookCallFailed())`.

The addresses printed by a bootstrapping dry run are simulation-only.

Tests:

```
forge test                                   # 65 tests, 10 fork tests skipped
SEPOLIA_RPC_URL=<url> forge test --match-contract PermissionedPoolSepoliaForkTest
SEPOLIA_RPC_URL=<url> forge test --match-contract PermissionedPoolSwapSepoliaForkTest
```

`PermissionedPoolSepoliaForkTest` forks Sepolia, asserts the published addresses, creates an adapter against the live factory for a fresh registry and FundToken, and checks `isAllowed` before and after an attestation. It passed on 2026-09-07.

## Liquidity and swap

`PermissionedPoolSwapSepoliaForkTest` runs the whole sequence on a Sepolia fork against the live factory, hook, PoolManager, PermissionedPositionManager, permissioned Universal Router and Permit2. It passed on 2026-09-07 (5 tests, 4.6 s, read-only endpoint https://ethereum-sepolia-rpc.publicnode.com):

| Test | What it asserts |
|---|---|
| `test_forkLiquidityMintedThroughPermissionedPositionManager` | The issuer (attested, since LPs need `LIQUIDITY_ALLOWED` like anyone else) minted a full-range position with `MINT_POSITION` + `SETTLE_PAIR`; the adapter holds the FundToken the LP paid plus the 1 wei deposit, the PoolManager holds the same amount of virtual token, StateView reports the position's liquidity as the pool's. |
| `test_forkUnattestedLpCannotMint` | A never-attested address cannot receive FundToken (`FundToken.NotEligible`) and its mint attempt reverts with `Unauthorized()` raised by the PermissionedPositionManager's recipient check, before the hook and before any transfer. |
| `test_forkAttestedInvestorSwapsStableForFundToken` | An attested investor swaps 100 mUSD for about 90.65 NDF through the router; the investor holds FundToken, not the virtual token, and the PoolManager remains the only holder of the adapter. |
| `test_forkRevokedInvestorCannotSwap` | The same investor swaps once, is revoked (`registry.revoke`), and the identical calldata reverts with `WrappedError(PermissionedHooks, beforeSwap, Unauthorized(), HookCallFailed())`: the revert comes from the hook, wrapped by the PoolManager (v4-core `Hooks.callHook`, ERC-7751). Balances are unchanged, so nothing was pulled through Permit2 before the hook rejected the swap. A liquidity mint by the revoked investor reverts with the position manager's `Unauthorized()`. |
| `test_forkNeverAttestedAddressCannotSwap` | Same hook revert for an address that was never attested. |

Who blocks what, in order, for a swap through the permissioned Universal Router: `PermissionedV4Router._validatePoolKey` (hook not allow-listed on the adapter: `HookNotAllowed`), then the PoolManager calls `PermissionedHooks.beforeSwap`, which checks `adapter.swappingEnabled()` (`SwappingDisabled`) and `adapter.isAllowed(msgSender, SWAP_ALLOWED)` plus `adapter.allowedWrappers(router)` (`Unauthorized`), then the router's own `_pay` / `_take` repeat the `isAllowed` check for the adapter currency, then the adapter unwraps and the FundToken's transfer gate checks the recipient a last time (`NotEligible`). In the fork tests the hook is always the one that fires for a revoked or unknown swapper. `Unauthorized()` has the same selector (`0x82b42900`) in the hook, the router and the position manager; the `WrappedError.target` address is what tells them apart.

Sizing a mint: `LiquidityAmounts.getLiquidityForAmounts(slot0.sqrtPriceX96, sqrt(tickLower), sqrt(tickUpper), amount0, amount1)` from StateView's `getSlot0`, minus 0.1 percent so the settled amounts stay under `amount0Max` / `amount1Max`. Full range is `TickMath.minUsableTick(60)` to `maxUsableTick(60)`.

## Swap from the app

The front end (or the bridge acting for a wallet) reproduces `SwapPermissioned.s.sol` with viem. Every value below is what the script encodes and what the fork test sent; the fixed constants come from v4-periphery `Actions.sol` and universal-router `Commands.sol`.

Before quoting: `adapter.isAllowed(wallet, 0x0001)` (SWAP_ALLOWED) answers from the Nachweis registry; showing a swap button to a wallet where it is false only produces the hook revert. Uniswap's Trading API offers `POST https://trade-api.gateway.uniswap.org/v1/permissions` for the same question, but only after step 7.

Approvals, once per wallet and input token (the stable here; for selling FundToken the same two approvals on the FundToken):

1. `stable.approve(PERMIT2, amount)` (ERC-20).
2. `permit2.approve(stable, UNIVERSAL_ROUTER, amount, expiration)` (Permit2 allowance, `uint160` amount, `uint48` expiration), or skip the second transaction by signing a Permit2 `PermitSingle` (EIP-712, domain `{name: "Permit2", chainId, verifyingContract: PERMIT2}`) and prepending command `0x0a` (PERMIT2_PERMIT) with input `abi.encode(PermitSingle, signature)` to the same `execute` call.

The swap:

```ts
import { encodeAbiParameters, encodeFunctionData, encodePacked, parseAbiParameters } from "viem";

const poolKey = { currency0, currency1, fee: 3000, tickSpacing: 60, hooks: PERMISSIONED_HOOKS }; // adapter and stable, sorted ascending
const zeroForOne = poolKey.currency0.toLowerCase() === STABLE.toLowerCase();       // stable in, FundToken out
const [inputCurrency, outputCurrency] = zeroForOne ? [poolKey.currency0, poolKey.currency1] : [poolKey.currency1, poolKey.currency0];

const actions = encodePacked(["uint8", "uint8", "uint8"], [0x06, 0x0c, 0x0f]);      // SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL
const swapParams = encodeAbiParameters(
  parseAbiParameters(
    "((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)"
  ),
  [{ poolKey, zeroForOne, amountIn, amountOutMinimum, minHopPriceX36: 0n, hookData: "0x" }]
);
const settleAll = encodeAbiParameters(parseAbiParameters("address, uint256"), [inputCurrency, amountIn]);
const takeAll = encodeAbiParameters(parseAbiParameters("address, uint256"), [outputCurrency, amountOutMinimum]);
const v4SwapInput = encodeAbiParameters(parseAbiParameters("bytes, bytes[]"), [actions, [swapParams, settleAll, takeAll]]);

const data = encodeFunctionData({
  abi: [{ type: "function", name: "execute", stateMutability: "payable",
          inputs: [{ type: "bytes", name: "commands" }, { type: "bytes[]", name: "inputs" }, { type: "uint256", name: "deadline" }], outputs: [] }],
  functionName: "execute",
  args: ["0x10", [v4SwapInput], deadline],                                            // 0x10 = V4_SWAP
});
// sendTransaction({ to: UNIVERSAL_ROUTER, data, value: 0n }) from the investor wallet; msg.sender is what the hook checks.
```

Notes:

- `minHopPriceX36` is a field of `ExactInputSingleParams` in v4-periphery main; the deployed Sepolia router decodes this six-field layout (the fork test and the dry run would revert on a five-field encoding). `0` disables the per-hop price check.
- `amountOutMinimum` is the slippage bound; the demo passes 0. `TAKE_ALL` pays to `msg.sender`; the adapter unwraps the virtual token on the way out, so the wallet receives FundToken directly.
- The wallet needs no approval for the FundToken to buy it. Selling FundToken needs the two approvals on the FundToken and `zeroForOne` flipped; the router then pulls FundToken into the adapter through Permit2 and wraps it.
- Reading the price: `StateView.getSlot0(poolId)` with `poolId = keccak256(abi.encode(poolKey))`. A quote: `V4Quoter.quoteExactInputSingle` (allow-listed as a wrapper in step 5).
- Reverts to expect and show: `WrappedError(hook, 0x575e24b4, 0x82b42900, 0xa9e35b2f)` for a wallet that is not (or no longer) eligible; `SwappingDisabled()` when the issuer paused the adapter; `TransactionDeadlinePassed()` from the router.

The liquidity mint has the same shape with `modifyLiquidities(abi.encode(actions, params), deadline)` on the PermissionedPositionManager, `actions = 0x020d` (MINT_POSITION, SETTLE_PAIR), `params[0] = abi.encode(poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData)`, `params[1] = abi.encode(currency0, currency1)`, and Permit2 approvals on both underlying tokens for the position manager. `PermissionedPoolActions.sol` and the dry-run output (`modifyLiquidities unlockData`) carry the exact bytes.

## Not done

- Broadcasting. A human decides when to add `--broadcast`; the order is CreatePermissionedPool, AddLiquidityPermissioned (with `ADAPTER_ADDRESS` and the printed addresses), SwapPermissioned.
- Step 7.
- A quote through `V4Quoter` before the swap, and a sell direction (FundToken in) in the script. Both are the same calldata with the currencies flipped.
