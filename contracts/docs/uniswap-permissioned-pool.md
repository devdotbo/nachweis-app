# Uniswap v4 permissioned pool for the Nachweis FundToken

Status: contracts and tests done, script dry-run only. Nothing has been broadcast to Sepolia from this repository.

## What it is

Uniswap ships a shared, audited permissioned-pool stack on Sepolia and mainnet: a `PermissionsAdapterFactory` that creates one `PermissionsAdapter` (a virtual ERC-20) per permissioned token, and a `PermissionedHooks` contract that asks the adapter `isAllowed(account, flag)` before every swap and liquidity mint. The adapter delegates that question to an `IAllowlistChecker` the issuer supplies.

Nachweis supplies that checker: `EudiAllowlistChecker` answers from `AttestationRegistry.isEligible(account, policyId, requiredBits)`. The same on-chain fact that gates `FundToken` transfers now gates the pool. Revoking or expiring a decision closes token transfers, subscriptions and the pool in one step. No personal data is stored anywhere in this path.

Files:

- `contracts/src/uniswap/EudiAllowlistChecker.sol`: the checker. Immutable, view-only, no owner.
- `contracts/src/uniswap/interfaces/IAllowlistChecker.sol`, `libraries/PermissionFlags.sol`, `interfaces/IPermissionsAdapterFactory.sol`: copied from Uniswap/v4-periphery (MIT) with the source commit in each header.
- `contracts/src/uniswap/interfaces/IPermissionsAdapterLite.sol`, `IPoolManagerLite.sol`: hand-written ABI subsets so the repo does not depend on v4-core or solmate.
- `contracts/src/uniswap/UniswapSepolia.sol`: the published Sepolia addresses and how they were verified.
- `contracts/test/EudiAllowlistChecker.t.sol`, `contracts/test/PermissionedPoolFactory.t.sol`: tests, see below.
- `contracts/test/fixtures/PermissionsAdapterFactory.json`: creation bytecode of the real factory, built from v4-periphery main at `dce236d4e2057422d0791d9a973a58765eb46f65` (solc 0.8.26, via_ir, optimizer runs 44444444). Used with `vm.getCode` so the tests exercise the real adapter without a network.
- `contracts/script/CreatePermissionedPool.s.sol`: the onboarding script.

## Sources and verification

Guide: https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool (fetched 2026-09-07).
Source: https://github.com/Uniswap/v4-periphery/tree/main/src/hooks/permissionedPools (main at `dce236d`, 2026-08-20; the guide pins `3245c3c`).
Deployments feed: https://developers.uniswap.org/deployments.json (records `permissioned-pools-*-sepolia`).

| Contract (Sepolia) | Address |
|---|---|
| PoolManager (v4-core 1.0.0) | 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 |
| PermissionsAdapterFactory | 0xE6B0d96919334C33d06266d1420F97f6f434fA2B |
| PermissionedPositionManager | 0xf99D553912084c99F6299291b75Fe9B7119Aa1A7 |
| PermissionedHooks | 0x51247E2291d290d17C08813A175AC86465EdE8c0 |
| Universal Router (permissioned build) | 0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7 |
| V4Quoter | 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227 |
| MixedRouteQuoterV2 | 0x4745F77b56a0E2294426E3936dc4Fab68d9543Cd |

Read-only checks run on 2026-09-07 (block 11655859, public RPC): the factory has code and `POOL_MANAGER()` returns the PoolManager above; `PermissionedHooks.PERMISSIONS_ADAPTER_FACTORY()` returns the factory; the factory's runtime bytecode equals a local build of v4-periphery main at `dce236d` except for the two immutable `POOL_MANAGER` slots (40 differing bytes of 11623). So the deployed adapter is the `main` version, which has `updateAllowedHook`; the commit the guide pins (`3245c3c`) does not have it. A log query for `PermissionsAdapterCreated` from block 8,000,000 returned no events (whether the RPC capped the range is unverified).

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

Step 7 is the only step that needs anyone outside this repository. It is required "on every network, including mainnet and Sepolia" for routing in the Uniswap interface and Trading API; swaps sent directly to the Universal Router or through the position manager do not need it. The form asks for the permissioned token address, the verified adapter address, a KYC URL and an issuer display name. For Nachweis the URL would be the issuer onboarding page where a wallet presents its EUDI PID and receives the attestation; the word the form uses is Uniswap's label, the Nachweis side is an attester, not a KYC provider.

## Running

Dry run against a Sepolia fork, nothing is sent:

```
cd contracts
DEPLOYER_PRIVATE_KEY=<any key> forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url $SEPOLIA_RPC_URL
```

Env vars: `REGISTRY_ADDRESS` and `FUND_TOKEN_ADDRESS` reuse deployed Nachweis contracts (the deployer must be the FundToken issuer and an operator for `POLICY_ID`); without them the script deploys a fresh registry and FundToken. `POLICY_ID`, `REQUIRED_BITS`, `POOL_FEE`, `TICK_SPACING` have defaults.

Dry run recorded on 2026-09-07 against the live Sepolia state with a throwaway key: all six on-chain steps simulated successfully, including `PoolManager.initialize` through the real `PermissionedHooks` (initial tick 0), estimated gas 6,708,474. The addresses printed by a dry run are simulation-only.

Tests:

```
forge test                                   # 46 tests, fork test skipped
SEPOLIA_RPC_URL=<url> forge test --match-contract PermissionedPoolSepoliaForkTest
```

The fork test forks Sepolia, asserts the published addresses, creates an adapter against the live factory for a fresh registry and FundToken, and checks `isAllowed` before and after an attestation. It passed on 2026-09-07.

## Not done

- A swap through the Universal Router (permit2 approval, `V4_SWAP` command encoding) and a liquidity mint through `PermissionedPositionManager` are not scripted. The pool exists after step 6; these are the demo's next beat.
- Broadcasting. A human decides when to add `--broadcast`.
- Step 7.
