# Uniswap developer feedback

Project: Nachweis (ETHOnline 2026). Integration: a Uniswap v4 permissioned pool on Sepolia whose allowlist checker reads the Nachweis `AttestationRegistry`. Written during the integration, dated 2026-09-07. Lines marked TODO are for the live Sepolia run, which has not happened yet.

## What was integrated

- `IAllowlistChecker` implementation: `contracts/src/uniswap/EudiAllowlistChecker.sol`. Returns `SWAP_ALLOWED | LIQUIDITY_ALLOWED` when the registry holds a live decision for the account under the pool's policy, `NONE` otherwise.
- The checker exercised through the real `PermissionsAdapterFactory` and `PermissionsAdapter` bytecode in unit tests, and against the live Sepolia factory in a fork test.
- A Foundry script that runs onboarding steps 1 to 6 (create adapter, allowlist and fund, verify, approve wrappers and hook, initialize the pool with `PermissionedHooks`, enable swapping). Simulated on a Sepolia fork; all six steps succeeded, including `PoolManager.initialize` through the deployed hook.
- Details and verification notes: `contracts/docs/uniswap-permissioned-pool.md`.

Stack parts used: v4-periphery permissioned pools (factory, adapter, hooks), v4-core PoolManager, the developer docs deploy guide, deployments.json.

## What worked well

- The checker interface is the right size. One function, one `bytes2` return, ERC-165. Writing a checker against an existing on-chain predicate took less time than reading the guide.
- Everything up to step 6 is permissionless on Sepolia. No form, no key from Uniswap, no allowlisting of the deployer. The factory creates the adapter for anyone, verification only needs the adapter to hold 1 wei of the token, and `PoolManager.initialize` with the hook accepted the pool in simulation.
- `deployments.json` is a machine-readable source for the addresses and agreed with the guide.
- The deployed factory bytecode on Sepolia reproduces from `main` with the repository's own `foundry.toml` (byte-identical apart from immutables). That made it possible to test against the real adapter code without an RPC.
- `depositForVerification` emitting its own event is a good touch: verification is visible without parsing plain ERC-20 transfers.

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
11. `deployments.json` lists two Universal Routers on Sepolia (`universal-router@2.0.0` and the permissioned build). The guide explains this in a note; the feed's records do not say which is which beyond the id. A `variant` field would help tooling.

## What broke

- Nothing in the Uniswap contracts. The one failing test during development was my expectation of the token's error in step 3 (item 4 above).
- TODO (live Sepolia): gas, reverts, and whether `PoolManager.initialize` behaves as in the fork simulation.

## Suggestions

- Pin the deployed commit in the guide and add a "deployed from" commit to `deployments.json` records (they carry `sourceRef: main` today).
- Publish the permissioned-pools interfaces as a small npm or forge package with no v4-core imports.
- Add a "dynamic allowlist tokens" paragraph to step 3 and a "checker reads an external registry" example to step 1.
- Bubble token reverts in `depositForVerification`.
- Put the production hook source (or a pointer to it) in v4-periphery.
- Rename `kycUrl`, or document that it is a display label rather than a requirement to run KYC.

## Live Sepolia experience

TODO: transaction hashes of steps 2 to 6.
TODO: first swap through the permissioned Universal Router (permit2 approval flow, calldata encoding experience).
TODO: liquidity mint through `PermissionedPositionManager`.
TODO: step 7 form submission and response.
