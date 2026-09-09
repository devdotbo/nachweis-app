# Continuity disclosure

ETHGlobal rule (https://ethglobal.com/rules, read 2026-09-08): "In all cases, you must disclose any pre-existing work in writing to the ETHGlobal team and include full details in your submission (repo history, video, and description)." and "All new parts of extending an existing project must remain open source."

This file is that disclosure for the submission. It sorts every piece of code the submission depends on into four classes: pre-event base, event changes to pre-existing code, adapted third-party code, and newly authored event code. Every statement below was checked with `git log`, `git diff` or a header grep on 2026-09-08; anything not checked says "unverified". Version 1 of this file (commit `1e6dbd7`, 2026-09-07) contained errors, listed at the end.

Product name: Attestat. Repository, crate, package and on-chain identifiers keep the earlier working name `nachweis` for this submission.

## 1. Pre-event base (the builder's own prior work, not in this repository)

- EUDI verifier workspace. GitHub repository `Klartext-ID/klartext-verifier`, Apache-2.0 (LICENSE and THIRD-PARTY-NOTICES.md in the checkout). Rust crates `verifier-core`, `verifier-service`, `verifier-zk`, `zk-vectors`, `overask-cli`. It receives OpenID4VP presentations from the official German EUDI test wallet (sample identity), verifies the SD-JWT and KB-JWT, the issuer trust chain and the status, and returns the verified claims. Local checkout on the builder's Mac: `/Users/bioharz/git/eudi-wallet-hackathon/verifier`, branch `nullwissen-zk` at commit `a08d72c` ("docs: reconcile the documented test counts with the workspace", 2026-08-17); `origin/main` at `a4ed59c`, also 2026-08-17. No commit in that repository is dated between 2026-08-18 and 2026-09-06. The event work in this repository talks to the verifier over HTTP; `service/Cargo.toml` declares no dependency on it.
- `klartext-verifier` as a separate front-end project: version 1 of this file listed it as a distinct component. On the builder's Mac the name is only the GitHub repository of the verifier workspace above; no separate checkout was found. Whether a separate front-end project of that name exists is unverified. Nothing in this repository depends on it.
- `nachweis-android`: an Android holder app on wallet-core 0.28.1 (SD-JWT holder), last commit 2026-07-13 as stated by the builder. No checkout was found on the Mac used for this inventory (unverified locally). Not used by any event code; the event's Android prover in `prover-android/` is new (class 4).

## 2. Event changes to pre-existing code (the relay branch)

The verifier was modified during the event on a branch. Branch `nachweis-relay` in the worktree `/Users/bioharz/git/ethglobal/nachweis-verifier-relay` (a git worktree of the repository above), base `a08d72c`, 10 commits dated 2026-09-07 and 2026-09-08, 13 files changed, 3,589 insertions, 165 deletions (sum over the exported patch series, `git apply --stat` on `vendor/verifier-relay-patches/*.patch`, counted 2026-09-09):

```
cbbd2f8 Add blind-relay session table, client JWK validation and address-bound nonce
3f688a9 Wire the blind-relay endpoints beside the default response path
e53b000 Test the blind-relay path end to end over the real router
971373c Document the blind-relay mode
03a6e2c Add verifier mode for the bridge: POST /request with a caller nonce, GET /result/:id with the presentation
79a80f6 Test verifier mode end to end over the real router
fa21004 Document verifier mode for the bridge
8517398 Record the josekit dev-dependency of verifier-service in Cargo.lock
86785d4 Minimize GET /result/:id, gate plaintext behind RESULT_TOKEN, cap and expire bridge sessions
7262a32 Document the minimized result, RESULT_TOKEN and the bridge session bounds
```

Files: `Cargo.lock`, `README.md`, `docs/blind-relay.md`, `docs/bridge-mode.md`, `verifier-service/Cargo.toml`, `verifier-service/src/{bridge.rs,handlers.rs,lib.rs,main.rs,relay.rs,state.rs}`, `verifier-service/tests/{bridge_http.rs,relay_http.rs}`.

Publication status on 2026-09-08: the branch is not pushed to any remote (`git branch -r --contains HEAD` is empty). Two publication paths:

1. In this repository: `scripts/export-relay-patches.sh` exports the series with `git format-patch a08d72c..HEAD` into `vendor/verifier-relay-patches/` with a README naming the base commit, the upstream repository and the licence. Applying the patches to a clone of `Klartext-ID/klartext-verifier` at `a08d72c` with `git am` reproduces the branch. The exported patches are committed here, so the relay work is public as soon as this repository is.
2. Pushing the branch to `Klartext-ID/klartext-verifier` is the builder's decision and is not done as of this writing.

The last two commits are the WP17 work (result minimization and result-endpoint authentication); the README in the patch directory states the exported head (`7262a32`).

## 3. Adapted or copied third-party code in this repository

Licence notices are kept in the files named below. Sources and commits are taken from the file headers and from `circuits/pid-sdjwt/SOURCE.md`.

| Path | Source | Commit or tag | Licence |
|---|---|---|---|
| `circuits/pid-sdjwt/src/main.nr`, `src/constants.nr` | eid-privacy/zkp-pocs, `noir/d10_swiyu_jwt`, adapted to the German EUDI PID (`circuits/pid-sdjwt/ADAPTATION.md`) | `ebbc17c86551d7407fa547342c35d06e2122c302` (2026-09-02) | MPL-2.0 (SPDX header in main.nr; LICENSE.md copied verbatim) |
| `circuits/pid-sdjwt/{SOURCE.md,LICENSE.md,README.upstream.md,Nargo.toml,data/,Prover.baseline-swiyu.toml}` | same package, copied as the baseline | same | MPL-2.0 |
| `contracts/src/uniswap/interfaces/IAllowlistChecker.sol`, `libraries/PermissionFlags.sol` | Uniswap/v4-periphery `src/hooks/permissionedPools/`, verbatim | `dce236d4e2057422d0791d9a973a58765eb46f65` | MIT |
| `contracts/src/uniswap/interfaces/IPermissionsAdapterFactory.sol` | v4-periphery, one import changed to OpenZeppelin IERC20 | `dce236d4` | MIT |
| `contracts/src/uniswap/libraries/TickMath.sol` | Uniswap/v4-core `src/libraries/TickMath.sol`, subset | as vendored at `dce236d4` | MIT |
| `contracts/src/uniswap/libraries/LiquidityAmounts.sol` | Uniswap/v4-core `test/utils/LiquidityAmounts.sol`, subset, FullMath replaced by OpenZeppelin Math | as vendored at `dce236d4` | MIT |
| `contracts/src/uniswap/interfaces/*Lite.sol` (PermissionsAdapter, PermissionedPositionManager, PoolManager, StateView, UniversalRouter, Permit2) | hand-written ABI subsets of v4-periphery, v4-core, universal-router and permit2 | `dce236d4` where stated | MIT (SPDX, self-declared to match upstream) |
| `contracts/src/uniswap/libraries/PermissionedPoolActions.sol` | own encoders; action and command constants copied from v4-periphery `Actions.sol` and universal-router `Commands.sol` | `dce236d` | Apache-2.0 (own), constants MIT |
| `contracts/test/fixtures/PermissionsAdapterFactory.json` | creation bytecode compiled from v4-periphery `PermissionsAdapterFactory.sol` (solc 0.8.26, via_ir) | `dce236d4` | MIT upstream; no notice inside the JSON (unverified beyond the header of the test that loads it) |
| `contracts/src/sp1/interfaces/ISP1Verifier.sol` | succinctlabs/sp1-contracts `contracts/src/ISP1Verifier.sol`, verbatim apart from header and pragma | `v6.1.0` (`2ac5ecbb`) | MIT, Succinct Labs |
| `contracts/src/noir/PidSdJwtUltraHonkVerifier.sol` | generated by Barretenberg `bb` from the circuit | bb version in `circuits/README.md` | Apache-2.0, Aztec header |
| `contracts/lib/forge-std` (1.16.2), `contracts/lib/openzeppelin-contracts` (5.7.0) | vendored dependencies, files tracked directly (no submodule) | see each package | MIT and Apache-2.0 (forge-std dual), MIT (OpenZeppelin) |
| `prover-android/gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar` | Gradle wrapper, copied via eid-privacy/zkp-android | none stated | Apache-2.0 (Gradle) |
| `prover-ios/MoproiOSBindings/mopro.swift` | UniFFI-generated bindings from `prover-mobile-core` (committed generated code) | mopro-ffi 0.3.7 | no SPDX in the generated file; mopro-ffi MIT or Apache-2.0, uniffi MPL-2.0 per `prover-ios/README.md` (unverified in the file itself) |
| `prover-sp1/LICENSE-MIT` | MIT licence file that ships with the SP1 project template (Succinct Labs, 2024) | none stated | MIT. Whether any `prover-sp1` source file is template-derived is unverified; the crates carry their own doc comments and names |

npm dependencies added on 2026-09-09 for the Privy standing order, used as packages and not copied: `@privy-io/react-auth` 3.40.0 and `@privy-io/wagmi` 4.0.17 (`app/package.json`), `@privy-io/node` 0.34.0 (`automation/package.json`); Privy's licence terms apply to those packages, the code that calls them (`automation/`, `app/src/lib/PrivyWalletProvider.tsx`, `app/src/components/StandingOrderCard.tsx`, `app/src/components/AutomationLog.tsx`) is class 4. The policy rule shapes follow Privy's documented request bodies; no Privy example code was copied.

Read as references, no file copied (inventory with commits and licences in the builder's `nachweis-refs/INVENTORY.md`, not part of this repository): eid-privacy/zkp-android (MPL-2.0, Mopro layout for `prover-android`; `prover-android/README.md` states no MPL-2.0 source was copied), zkmopro/noir-rs (MIT or Apache-2.0, structure of `prover-mobile-core`), openwallet-foundation/multipaz (Apache-2.0, not used in the submission), succinctlabs/sp1 (Apache-2.0 and MIT), eu-digital-identity-wallet/eudi-lib-android-wallet-core (Apache-2.0, not used), eid-privacy/noir-benchmarks (licence not recorded, unverified), Uniswap/v4-periphery (MIT; the developer guide and `deployments.json` supplied the Sepolia addresses in `contracts/src/uniswap/UniswapSepolia.sol`).

## 4. Newly authored event code

Everything else in this repository was written during ETHOnline 2026. First commit `1e6dbd7` ("Add README, disclosure, license and env example") on 2026-09-07; 145 commits on `main` up to `0fd7312`, all dated 2026-09-07, plus the event branches after that. Commits touching each component on `main` at `0fd7312`:

| Component | What it is | Commits |
|---|---|---|
| `contracts/` | AttestationRegistry with pluggable proof verifiers, FundToken, Subscription, Sp1PidVerifier, NoirPidVerifier, EudiAllowlistChecker, scripts, tests | 52 |
| `service/` | Rust bridge (sessions, address proof, prover, attest and revoke) | 15 |
| `app/` | Vite and React front end | 23 |
| `prover-sp1/` | SP1 guest and host for the PID statement | 12 |
| `circuits/` | the adapted Noir circuit (class 3 base plus new constraints, tests, fixtures) | 10 |
| `companion/` | desktop companion prover (bun) | 5 |
| `prover-mobile-core/` | shared Rust prover core (mopro-ffi, uniffi) | 6 |
| `prover-android/` | Android prover app | 12 |
| `prover-ios/` | iOS prover app (imported by path in one commit after a history rewrite that dropped a build blob) | 1 |
| `scripts/`, `docs/` | end-to-end scripts, runbooks, this disclosure's companions | 5, 8 |
| `automation/` | the issuer's automation for the Privy standing order (policy builder, watcher, tick, server; bun), written 2026-09-09 on branch `wp32-privy-standing-order` | branch |

How the code was produced (Claude Code agents directed and reviewed by the builder) is described in `docs/ai-attribution.md`; the working method in `docs/process.md`.

## Corrections to version 1 of this file

- Version 1 said the verifier "is not modified during the event". False: the relay branch in section 2 is event work on the verifier, dated 2026-09-07.
- Version 1 listed the eid-privacy circuit as used "if used for the zero-knowledge path". It is used; the adapted circuit is the client-side proof route.
- Version 1's event-work list named `contracts/`, `service/`, `app/`, `circuits/` and `docs/` only; `companion/`, `prover-sp1/`, `prover-mobile-core/`, `prover-android/`, `prover-ios/` and `scripts/` are event work too.
- Version 1 named `klartext-verifier` as a separate front end; see section 1.
