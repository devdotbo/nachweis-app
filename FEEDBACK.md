# Uniswap developer feedback

Project: Nachweis (ETHOnline 2026). Integration: a Uniswap v4 permissioned pool on Sepolia whose allowlist checker reads the Nachweis `AttestationRegistry`. Written during the integration, dated 2026-09-07. Lines marked TODO are for the live Sepolia run, which has not happened yet; everything else was observed on a Sepolia fork against the deployed contracts.

## What was integrated

- `IAllowlistChecker` implementation: `contracts/src/uniswap/EudiAllowlistChecker.sol`. Returns `SWAP_ALLOWED | LIQUIDITY_ALLOWED` when the registry holds a live decision for the account under the pool's policy, `NONE` otherwise.
- The checker exercised through the real `PermissionsAdapterFactory` and `PermissionsAdapter` bytecode in unit tests, and against the live Sepolia factory in a fork test.
- A Foundry script that runs onboarding steps 1 to 6 (create adapter, allowlist and fund, verify, approve wrappers and hook, initialize the pool with `PermissionedHooks`, enable swapping). Simulated on a Sepolia fork; all six steps succeeded, including `PoolManager.initialize` through the deployed hook.
- A liquidity mint through the deployed `PermissionedPositionManager` (Permit2 approvals, `MINT_POSITION` + `SETTLE_PAIR`) and an exact-input swap through the deployed permissioned Universal Router (`V4_SWAP`: `SWAP_EXACT_IN_SINGLE`, `SETTLE_ALL`, `TAKE_ALL`), as scripts and as fork tests. The fork tests run the whole sequence: onboard, mint, swap as an attested investor, revoke, the same swap reverts in `PermissionedHooks.beforeSwap`, a never-attested address is rejected the same way.
- Details and verification notes: `contracts/docs/uniswap-permissioned-pool.md`.

Stack parts used: v4-periphery permissioned pools (factory, adapter, hooks, PermissionedPositionManager), the permissioned build of the Universal Router, Permit2, v4-core PoolManager, StateView, the developer docs (deploy, provide-liquidity and swapping pages), deployments.json.

## What worked well

- The checker interface is the right size. One function, one `bytes2` return, ERC-165. Writing a checker against an existing on-chain predicate took less time than reading the guide.
- Everything up to step 6 is permissionless on Sepolia. No form, no key from Uniswap, no allowlisting of the deployer. The factory creates the adapter for anyone, verification only needs the adapter to hold 1 wei of the token, and `PoolManager.initialize` with the hook accepted the pool in simulation.
- `deployments.json` is a machine-readable source for the addresses and agreed with the guide.
- The deployed factory bytecode on Sepolia reproduces from `main` with the repository's own `foundry.toml` (byte-identical apart from immutables). That made it possible to test against the real adapter code without an RPC.
- `depositForVerification` emitting its own event is a good touch: verification is visible without parsing plain ERC-20 transfers.
- The provide-liquidity page is exactly right: two Permit2 approvals on the underlying token, `MINT_POSITION` + `SETTLE_PAIR`, done. The mint worked on the first fork run against the deployed position manager.
- The swap needed no permissioned-specific calldata at all. The standard `V4_SWAP` encoding with the adapter as the pool currency went through the permissioned Universal Router on the first attempt; wrapping on the way in and unwrapping on the way out is invisible to the caller, which is the point of the adapter design.
- ERC-7751 `WrappedError` from the PoolManager names the hook address and the callback selector, so "which contract refused the swap" is answerable from the revert data alone.

## What was unclear or missing

1. The guide pins commit `3245c3c` for `forge install`, but the contracts deployed on Sepolia are `main` (`dce236d`), verified by bytecode comparison. `PermissionsAdapter` at `3245c3c` has no `updateAllowedHook` or `allowedHooks`, while step 5 of the guide calls `updateAllowedHook`. An integrator who follows the install line and compiles against the pinned commit cannot call step 5 from Solidity. Suggest pinning the commit that was actually deployed, or publishing the permissioned-pools contracts to npm with a version.
2. The production `PermissionedHooks` source is not in v4-periphery `main`. Only `test/hooks/permissionedPools/mocks/MockPermissionedHooks.sol` exists, described as replicating the logic. The audits in `audits/permissionedPools` presumably cover the real hook, but its Solidity is not in the repository this guide points to. The address bits show which hook callbacks are enabled, which is how I confirmed the shape.
3. Step 3 assumes a token with a static allowlist ("add the adapter address to your token's allowlist"). For a token whose transfer gate is a dynamic on-chain predicate (ours, ERC-3643-style tokens, anything with an identity registry) the guide should say what property is actually required: the adapter must be able to receive and hold the token, and the issuer must be able to transfer it there. In our case that means attesting a contract address under a policy meant for persons. A note on this pattern, or an explicit "venue" concept on the adapter, would help.
4. The adapter uses solmate `SafeTransferLib`, so when the permissioned token rejects the adapter in step 3, the revert is `TRANSFER_FROM_FAILED` and the token's own error (`NotEligible(adapter)` here) is lost. Debugging step 3 means calling the token directly. A bubbled-up revert would save time.
5. `IPermissionsAdapter.sol` imports `IHooks` from v4-core, so an integrator who only wants to type the adapter pulls in v4-core (and, through the adapter implementation, solmate). I copied `IAllowlistChecker`, `PermissionFlags` and `IPermissionsAdapterFactory` and wrote an ABI subset of the adapter interface instead. A small `interfaces` package without v4-core imports would remove this.
6. The permissioned-pools contracts are pinned to `pragma solidity 0.8.26` (exact), while the interfaces are `^0.8.0`. A project on a newer compiler cannot compile the factory or adapter from source; I compiled them in the v4-periphery checkout and shipped bytecode as a test fixture. A floating pragma on the contracts, or published artifacts, would help.
7. Step 7 is required for interface and API routing "on every network, including mainnet and Sepolia". The guide does not say whether Sepolia requests are processed for hackathon or test projects, or how long onboarding takes. TODO: outcome of our request, if we send one.
8. The step 7 configuration field is `kycUrl`. For an issuer that verifies eligibility with an EU Digital Identity Wallet presentation (age, residency predicates) and never performs KYC in the AML sense, the name is misleading in a way that matters to regulated issuers. `verificationUrl` or `onboardingUrl` would be neutral.
9. The example checker in step 1 has no access control on `setPermissions`. The text says so, but a copy-paste-ready example that is unsafe by default is the one that gets copied. An example that reads an existing on-chain predicate, or one with `Ownable`, would be a safer default.
10. The guide does not say that the adapter constructor reverts with `InvalidAllowListChecker` when `supportsInterface` is missing. Naming the error next to the ERC-165 sentence would save a debugging round.
11. `deployments.json` lists three Universal Routers on Sepolia (the 2.0.0 release, `UniversalRouter#v2.2`, and the permissioned build). The guide explains this in a note; the feed's records do not say which is which beyond the id. A `variant` field would help tooling.
12. There is no page for swapping through a permissioned pool without the Trading API. "Swapping through Permissioned Pools" covers the `/v1/permissions` endpoint and the `x-universal-router-version: 2.2.0` header; the direct path (Permit2 approval, `V4_SWAP` encoding, which router address) had to be assembled from the v4-periphery router tests and the universal-router source. A code block like the one on the provide-liquidity page would close that gap. The Trading API path is also not testable before step 7, so a hackathon project cannot use it at all.
13. `IV4Router.ExactInputSingleParams` on `main` has a field `minHopPriceX36` that older releases do not have, and the deployed Sepolia router decodes the six-field layout (a five-field encoding fails the `0x160` length check). Nothing in the docs mentions the field or which layout a given deployment expects. Since `deployments.json` says `sourceRef: main` for the router, a commit hash there would pin this.
14. `deployments.json` gives `https://github.com/Uniswap/v4-hooks-public` as the source repo of `PermissionedHooks`, but that repository contains WETHHook, WstETHHook and WstETHRoutingHook only. The production hook source is still unpublished as far as I can find; the mock in v4-periphery is what I verified behaviour against, and the fork tests confirm the deployed hook behaves like the mock for `beforeSwap` and `beforeAddLiquidity`.
15. `Unauthorized()` has the same selector in `PermissionedHooks`, `PermissionedV4Router` and `PermissionedPositionManager`. Inside a `WrappedError` the target address disambiguates; a bare `Unauthorized()` from the router or the position manager does not say which check failed (recipient, caller, hook allow-list). Distinct error names, or an argument, would help front ends show the right message.
16. The provide-liquidity page says nothing about sizing: which price to read (`StateView.getSlot0`), how to turn amounts into `liquidity` (`LiquidityAmounts`, which lives under `test/utils` in v4-core, not in a published library), and that `amount0Max` / `amount1Max` must leave a rounding margin. All of that is standard v4, but a first-time integrator lands on this page.
17. The permissioned Universal Router has no public `PERMIT2` getter (the position manager has `permit2()`), so a script cannot assert it is talking to the expected Permit2. The canonical address is in `deployments.json`, which is what I relied on.

## What broke

- Nothing in the Uniswap contracts. The one failing test during development was my expectation of the token's error in step 3 (item 4 above). The liquidity mint and both swap directions of the fork tests (allowed, revoked, never attested) passed on the first run against the deployed contracts.
- Tooling, not Uniswap: `developers.uniswap.org/docs/...` answers a 303 to `/llms.mdx/...` for non-browser clients, which my fetch tool refused to follow. `curl -L` with a browser user agent worked.
- TODO (live Sepolia): gas, reverts, and whether `PoolManager.initialize` behaves as in the fork simulation.

## Suggestions

- Pin the deployed commit in the guide and add a "deployed from" commit to `deployments.json` records (they carry `sourceRef: main` today).
- Publish the permissioned-pools interfaces as a small npm or forge package with no v4-core imports.
- Add a "dynamic allowlist tokens" paragraph to step 3 and a "checker reads an external registry" example to step 1.
- Bubble token reverts in `depositForVerification`.
- Put the production hook source (or a pointer to it) in v4-periphery.
- Rename `kycUrl`, or document that it is a display label rather than a requirement to run KYC.
- Add a "swap without the Trading API" code block (Permit2 approvals, `V4_SWAP` encoding with the six-field `ExactInputSingleParams`, the permissioned router address) next to the provide-liquidity page, and a sizing paragraph on that page.
- Fix the `PermissionedHooks` source pointer in `deployments.json`, or publish the hook.

## Live Sepolia experience

Fork results on 2026-09-07 (read-only public RPC, block 11655920 area): onboarding 6 steps, a full-range mint of 1000 NDF / 1000 mUSD (liquidity 999000000000000, tokenId 9 on the deployed position manager), a swap of 100 mUSD for 90.65 NDF, a revoke followed by `WrappedError(PermissionedHooks, beforeSwap, Unauthorized(), HookCallFailed())` for the identical calldata. Dry-run gas for the bootstrapping runs: 8,195,312 (mint) and 8,921,394 (mint plus swap).

TODO: transaction hashes of steps 2 to 6.
TODO: the same mint and swap broadcast, gas actually paid.
TODO: step 7 form submission and response.
