# Attestat

Attestat, formerly Nachweis. The product was renamed on 2026-09-07; identifiers keep the nachweis name for this submission (section "Name" below).

How many strangers keep a copy of your passport? Every exchange, launchpad and fund asks for your ID and keeps it.

Attestat helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain.

Spoken line: "Your ID wallet should work where you invest."

ETHOnline 2026 submission, Classic entry (decision of 2026-09-09: Attestat is a new project; the builder's own public verifier library is disclosed as pre-existing work). Pre-existing work, event changes to it, adapted third-party code and new code are listed in [DISCLOSURE.md](DISCLOSURE.md). How the project is run (wiki as specification and decision record, work packages with acceptance tests, evidence labels) is in [docs/process.md](docs/process.md); the human and AI contributions are in [docs/ai-attribution.md](docs/ai-attribution.md).

## What happens

1. An investor opens the fund app with her own crypto wallet. Her address is not permitted yet.
2. She scans a QR code. The official German EUDI test wallet (sample identity) presents given name, family name and "over 18" to the issuer's verifier.
3. Her crypto wallet signs a session challenge; the presentation is bound to that address through the KB-JWT nonce.
4. The names stay with the issuer. A zero-knowledge proof is made of the statement "a PID signed by the pinned issuer key, with holder binding, says over 18, bound to this address".
5. The proof is submitted to the `AttestationRegistry`; the on-chain verifier checks it.
6. The registry now holds one record for (address, policy): policy id, predicate bits, tier, expiry, status reference. No name, no document, no string. The doors stay closed: evidence alone is not eligibility.
7. The issuer approves in a separate step with its operator key (`approve`); `isEligible` requires the evidence and the approval (`docs/spec-issuer-approval.md`).
8. Door one: the `FundToken` transfer hook reads that record; she subscribes to the demo fund.
9. Door two: the Uniswap v4 permissioned pool's allowlist checker reads the same record; she swaps without a second presentation.
10. The issuer revokes. Both doors refuse the same address in the same block.
11. What the chain learned: an address holds a decision under a policy, and when it expires. Nothing that finds her.

## Honesty box

- Wallet: the official German EUDI test wallet from the SPRIND sandbox with a sample identity. Not a real state-issued identity. The synthetic fixture used in the tests carries the sandbox issuer's certificate chain but is signed with a fresh issuer key (see `prover-sp1/README.md`).
- Checks: sanctions, residency and every other issuer check are simulated in this build and labelled as such. The issuer's approval is a separate manual action, enforced on chain since 2026-09-08 (`approve` by an operator; a proof alone opens no door).
- Proof route 1 (SP1 Groth16): the statement runs inside the SP1 zkVM on the issuer's server (`prover-sp1`, driven by `service`), wrapped as Groth16, verified through `Sp1PidVerifier` by the SP1 verifier gateway deployed on Sepolia, exercised so far on a local Sepolia fork (anvil), not on Sepolia itself. The chain does not trust the server, but the server did see the presentation.
- Proof route 2 (Noir UltraHonk): the same statement as a Noir circuit (`circuits/pid-sdjwt`), proved client-side on a desktop today, verified fully on chain by a bb-generated verifier through `NoirPidVerifier`. On-phone provers exist for Android (emulator) and iOS (simulator) on the same core; physical-device runs are optional and not part of the main path.
- What neither proof checks: the x5c chain from the issuer certificate to a trust anchor (the contracts pin the issuer key hash instead), the credential status list, and the freshness window of the challenge. Who checks them differs per route. SP1 route in verifier mode: the pre-existing verifier performs trust chain (when anchored), status list (when enabled) and KB-JWT freshness in front of the bridge, and the bridge repeats the freshness check (`KB_JWT_WINDOW_SECS`); both see the plaintext presentation. Noir route: the verifier only relays ciphertext, the bridge receives proof and public inputs and checks no freshness, and the companion's `--kb-window` is the only freshness check; nobody checks trust chain or status list on that route. Local mode: nothing checks them. The proof covers the statement subset only. The route-specific contract is in `docs/trust-boundaries.md`.
- Revocation is manual: the issuer's operator key calls `revoke`.
- Deployment status on 2026-09-07: nothing is deployed to any network. All Sepolia interaction so far is fork tests and dry runs. Addresses will be added here after the Sepolia run in `docs/demo-runbook.md`.
- Numbers (cycle counts, proving times, gas, verification keys) live in `prover-sp1/NOTES.md` and `circuits/README.md` and are being regenerated; this file does not repeat them.

## Repository map

- `contracts/`: Foundry project. `AttestationRegistry` (pluggable `IProofVerifier` per policy), `FundToken`, `Subscription`, `Sp1PidVerifier`, `NoirPidVerifier`, the Uniswap allowlist checker, deploy and pool scripts, tests. See `contracts/README.md`.
- `prover-sp1/`: SP1 guest program and host for the PID statement, Groth16 fixture, measurements in `NOTES.md`.
- `circuits/`: Noir circuit `pid-sdjwt` for the same statement, adapted from eid-privacy's swiyu circuit (`circuits/pid-sdjwt/ADAPTATION.md`), witness generator, negative tests.
- `service/`: Rust bridge (axum, alloy, sp1-sdk). Sessions, wallet address proof, native statement check, prover, `attestWithProof` and `revoke` with the operator key. See `service/README.md`.
- `companion/`: desktop companion prover (bun CLI): picks up the blind-relayed, encrypted wallet response, decrypts and proves the PID statement locally with `circuits/pid-sdjwt`, submits the proof to the bridge (`POST /sessions/:id/noir-proof`) or the chain; the verifier and the bridge never see the presentation. See `companion/README.md`.
- `app/`: Vite and React front end, investor and issuer screens, mock mode for a chain-free run. See `app/README.md`.
- `automation/`: the issuer's automation for the Privy standing order (bun, `@privy-io/node`): policy builder, event watcher, tick, HTTP server. See `docs/privy-standing-order.md`.
- `docs/`: `demo-runbook.md` (local sequence and the Sepolia run), `video-shotlist.md` (seven beats), `g0-runbook.md` and `spec-g0.md` (official-wallet run), `e2e-local.md`, `two-device.md`, `privy-standing-order.md` (the Privy standing order), `process.md`, `ai-attribution.md`, `evidence/` (sanitized run records).
- `vendor/verifier-relay-patches/`: the event changes to the pre-existing verifier as a patch series with base commit and licence (`vendor/verifier-relay-patches/README.md`), exported by `scripts/export-relay-patches.sh`.
- `DISCLOSURE.md`, `FEEDBACK.md` (Uniswap developer feedback), `LICENSE`.

## Run it locally

`docs/demo-runbook.md` has the ordered sequence with the exact commands, environment and expected output: anvil, contract deployment, the bridge in mock and Groth16 mode, the app in mock and real mode, the six beats, the Uniswap pool on a Sepolia fork, revoke and the refusals, and the Sepolia real run. Every step is marked with whether it was verified locally on 2026-09-07 and, if it failed, the exact error.

## Uniswap

Uniswap v4 permissioned pool gated by the Attestat registry, built against the Uniswap contracts deployed on Sepolia and exercised on a local Sepolia fork (anvil); the Sepolia broadcast is a builder step. Uniswap's shared `PermissionsAdapterFactory`, `PermissionedHooks`, `PermissionedPositionManager` and the permissioned Universal Router are used as deployed; the only new contract on the Uniswap side is the allowlist checker.

- Checker: `contracts/src/uniswap/EudiAllowlistChecker.sol`, contract at lines 27 to 67; `checkAllowlist` at lines 58 to 61 returns `SWAP_ALLOWED | LIQUIDITY_ALLOWED` iff `registry.isEligible(account, policyId, requiredBits)`; `supportsInterface` at lines 64 to 66.
- Uniswap interfaces copied with source commit headers: `contracts/src/uniswap/interfaces/IAllowlistChecker.sol`, `contracts/src/uniswap/libraries/PermissionFlags.sol`, `contracts/src/uniswap/interfaces/IPermissionsAdapterFactory.sol`. ABI subsets written here: `IPermissionsAdapterLite.sol`, `IPoolManagerLite.sol`, `IPermissionedPositionManagerLite.sol`, `IUniversalRouterLite.sol`, `IPermit2Lite.sol`, `IStateViewLite.sol`. Calldata the position manager and the router decode: `contracts/src/uniswap/libraries/PermissionedPoolActions.sol` (`ExactInputSingleParams` at 25 to 32, mint calldata at 49 to 57, `V4_SWAP` calldata at 63 to 89, pool id at 92 to 94). Verified Sepolia addresses: `contracts/src/uniswap/UniswapSepolia.sol`.
- Tests: `contracts/test/EudiAllowlistChecker.t.sol` lines 67 to 155 (unattested, proof evidence without approval, attested and approved, revoked, expired, missing bits, other policy) and 163 to 170 (ERC-165); `contracts/test/PermissionedPoolFactory.t.sol` lines 21 to 208 run the checker through the real factory and adapter bytecode (fixture `contracts/test/fixtures/PermissionsAdapterFactory.json`, built from v4-periphery `dce236d`), lines 210 to 255 run on a local Sepolia fork and create an adapter against the factory deployed there when `SEPOLIA_RPC_URL` is set; `contracts/test/PermissionedPoolSwap.fork.t.sol` lines 62 to 96 (onboard and mint on a Sepolia fork) and 187 to 286 (mint, swap as an attested investor, revoke, the identical swap reverts in `PermissionedHooks.beforeSwap`, never-attested address refused).
- Scripts: `contracts/script/lib/PermissionedPoolOnboarding.sol` lines 32 to 93 are the six on-chain onboarding steps of the Uniswap deploy guide; `contracts/script/CreatePermissionedPool.s.sol` lines 52 to 74 (Attestat contracts, then the onboarding call) and 91 to 94 (step 7 printed); `contracts/script/AddLiquidityPermissioned.s.sol` lines 24 to 54 (mint through the PermissionedPositionManager); `contracts/script/SwapPermissioned.s.sol` lines 33 to 92 (Permit2 approvals at 77 to 78, `UniversalRouter.execute` at 79; `REVOKE_INVESTOR=true` shows the refusal). Dry runs and, since 2026-09-09, broadcasts to a local anvil fork of Sepolia (`scripts/pool-local.sh`); nothing on Sepolia itself, see the status line above.
- The Swap door in the investor portal (2026-09-09, `docs/swap.md`): `app/src/components/swap/calldata.ts` encodes the same `V4_SWAP` calldata with viem (`swapCalldata` at lines 36 to 71), quotes the exact-input amount from `StateView.getSlot0` and `getLiquidity` (`quoteExactIn` at 85 to 94; the deployed V4Quoter cannot quote a permissioned pool, `FEEDBACK.md` item 18) and decodes a refusal into words (`explainRevert` at 129 to 186: `WrappedError`, `Unauthorized`, `SwappingDisabled`, `HookNotAllowed`, `NotEligible`, `ExecutionFailed`); `app/src/components/swap/useSwap.ts` reads the pool and the adapter (`usePoolState` at 46 to 99), the three answers the pool relies on (`useSwapCheck` at 112 to 130: `registry.isEligible`, `checker.checkAllowlist`, `adapter.isAllowed`) and sends the swap from the connected wallet (`useSwapTx` at 167 to 261: faucet, ERC-20 approve to Permit2, Permit2 allowance, `eth_call` preflight, `UniversalRouter.execute`; a refused swap is sent with a fixed gas limit so it is mined and has a hash); `SwapDoor.tsx` is the tile, `SwapExplainer.tsx` the pool panel. Local pool: `scripts/pool-local.sh` (anvil fork of Sepolia with chain id 31337, the three scripts, a probe swap and a refused swap, `POOL-LOCAL PASS` in 24 s); browser run: `scripts/app-e2e-local.sh --mode sp1-mock --pool --test` with `app/e2e/swap.spec.ts` (swap, revoke in the console, refused swap decoded on screen). Screenshots in `docs/ui/` (`investor-11` to `investor-13`, `issuer-07`).
- Notes, addresses, what each step needs, viem calldata for the app: `contracts/docs/uniswap-permissioned-pool.md`.
- Developer feedback: `FEEDBACK.md`.

Builder TODO before submission: run the three scripts with `--broadcast` (order in `docs/demo-runbook.md`), fill the TODO lines in `FEEDBACK.md`, then submit the Uniswap Developer Feedback Form at https://developers.uniswap.org/hackathon-feedback with a link to `FEEDBACK.md`.

## Privy

A standing order: the issuer's automation runs a recurring `Subscription.subscribe()` for an investor from the investor's own Privy embedded wallet, through a signer whose policy is a copy of the on-chain eligibility decision (only this fund's Subscription contract, only until the decision's expiry, deny-all appended when the registry emits `Revoked`). Green for class L on 2026-09-09 (local chain, automation in local mode, no Privy app: `scripts/standing-order-local.sh` prints `STANDING-ORDER-LOCAL PASS`); the Sepolia run with the builder's Privy app (class S) is a builder step and not yet done, so nothing here is described as a Privy run. No contract, bridge or circuit changed.

- Policy builder: `automation/src/policy.ts`, `buildRules` at lines 52 to 71 (rule 1: DENY every method at `system.current_unix_timestamp >= expiry`; rule 2: ALLOW `eth_sendTransaction` when `to` is the Subscription contract, `chain_id` is the configured chain and the calldata decodes to `subscribe()`, ABI inline), `denyAllRule` at 73, `applyRevoked` at 82, `applyApproved` at 87, plain words at 105, the local evaluator (simulated Privy policy, dev loop only) at 175. Tests: `automation/test/policy.test.ts`, 13 tests, and `automation/test/store.test.ts`, 3 tests (`cd automation && bun test`: 16 pass, 2026-09-09).
- Watcher: `automation/src/watch.ts`, `poll` at 40, `onApproved` at 70 (policy from `decisionOf`, deny-all removed, expiry refreshed), `onRevoked` at 99 (deny-all appended). Policy backend: `automation/src/policies.ts`, `PrivyPolicies` at 39 (`policies().create` at 42, `createRule` at 48, `deleteRule` at 59; no owner, so the app secret updates the policy).
- Signer and tick: `automation/src/signer.ts`, `PrivySigner` at 76 (`wallets().ethereum().sendTransaction` with `caip2: eip155:<chain>` at 94 to 95, signed with the authorization key), `LocalSigner` at 44 (evaluator at 69; the clock is anvil's block time); `automation/src/tick.ts`, `runTick` at 29, `TICK OK` at 53, `TICK DENIED policy` then `TICK DENIED chain` at 60 to 64. Server: `automation/src/server.ts`, `GET /status` at 69, `GET /policy/:address`, `POST /tick` at 93.
- App: `app/src/lib/PrivyBoundary.tsx` (the one switch, reusable by other screens as `<PrivyBoundary plain={...}>`) loads `app/src/lib/PrivyWalletProvider.tsx` when `VITE_PRIVY_APP_ID` is set; `app/src/lib/WalletProvider.tsx` lines 36 to 48 wrap the plain tree in it (`PrivyProvider` at 84 to 98 with email login and `createOnLogin: 'users-without-wallets'`, `createConfig` from `@privy-io/wagmi` at 24, `addSigners` at 52, `removeSigners` at 59); unset, the previous tree is unchanged. Connect option "Sign in with email, wallet by Privy": `app/src/lib/wallet.ts` lines 119 to 121; disconnect is Privy's `logout()` at 163. Card: `app/src/components/StandingOrderCard.tsx` (Allow at 58, Run the month at 67, Remove signer at 75), mounted at `app/src/screens/InvestorScreen.tsx:66`. Issuer log: `app/src/components/AutomationLog.tsx`, mounted at `app/src/screens/IssuerScreen.tsx:87`. Env: `app/.env.example` (`VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL`), `automation/.env.example`.
- Local run: `scripts/standing-order-local.sh` (anvil, Deploy, automation in local mode, `attestByOperator` at 112, three ticks, `revoke` at 136, re-approve, `evm_increaseTime` at 157, a second investor without a delegated wallet).
- The exact policy JSON, the fallback shape, the builder's Sepolia runbook, the evidence template and the two on-screen sentences: `docs/privy-standing-order.md`.

Two on-screen sentences. Investor card: "Wallet by Privy: an embedded wallet created at email sign-in. Your identity evidence never goes to Privy. Privy sees this address, the transactions it signs, and one policy: the issuer's automation may send subscribe() for you to this fund until your decision expires on <date>. When the issuer revokes your decision, its automation closes the policy; you can remove the signer here at any time. Sample identity from the official test wallet; testnet funds." Issuer panel: "Automation by Privy: the issuer's key signs on the investor's wallet only under a policy copied from her on-chain decision. Revoke on chain, then the automation adds a deny rule to that policy. Privy enforces the policy; Privy does not read the chain."

Builder TODO before submission: the Sepolia run of `docs/privy-standing-order.md` section 7 (Privy app, authorization key, policy gate check, tests 5 to 9), the evidence record of section 8, then the Privy line in the submission text.

## Showcase

The product journey is the investor flow above: one EUDI presentation, one decision on chain, two doors (the fund subscription and the Uniswap pool). The demos in this section are engineering examples of what else can read that decision; they are not the product journey and the video does not depend on them. Five demos, one more door and one more evidence route, all built on the same registry read (`isEligible`). Every item below is evidence class L: a local anvil chain, a dev key or the local evaluator in place of Privy (captioned "simulated Privy policy (local)" on screen), no wallet run, no device run, no Sepolia transaction. Each script starts its own anvil and prints the PASS line named here; the demo pages sit under `/showcase/<slug>` in the app (`app/src/showcase/registry.ts`).

| Demo | What it shows | Script and PASS line | Doc |
|---|---|---|---|
| Standing order (WP32) | The issuer's automation sends a recurring `subscribe()` from the investor's own wallet under a policy copied from the on-chain decision; revoke and expiry refuse the tick. | `scripts/standing-order-local.sh`, `STANDING-ORDER-LOCAL PASS` | `docs/privy-standing-order.md` |
| Compliance desk (`/showcase/backoffice`) | A four-eyes desk approves and withdraws investor wallets through an operator wallet whose policy allows approve and revoke and nothing else; three refusals on screen. | `scripts/showcase-backoffice-local.sh`, `SHOWCASE-BACKOFFICE-LOCAL PASS` | `docs/showcase/backoffice.md` |
| Contractor payout desk (`/showcase/payout-desk`) | A treasury that may only pay through `GatedPayout`, which pays only addresses with a live decision; the gate's own revert text and the policy's refusals on screen. | `scripts/showcase-payout-desk-local.sh`, `SHOWCASE-PAYOUT-DESK-LOCAL PASS` | `docs/showcase/payout-desk.md` |
| Fund desk for an email investor (`/showcase/investor-money`) | Subscribe in a test stablecoin, receive a distribution, claim and redeem, each movement gated by the decision; refused before approval and after revoke. | `scripts/showcase-investor-money-local.sh` (`--test` runs the browser spec), `SHOWCASE-INVESTOR-MONEY-LOCAL PASS` | `docs/showcase/investor-money.md` |
| The attested savings plan (`/showcase/savings-plan`) | One decision read by four doors (recurring plan, a second issuer's instrument, the permissioned pool, a transfer); one revoke closes all four. | `scripts/showcase-savings-plan-local.sh`, `SHOWCASE-SAVINGS-PLAN-LOCAL PASS` | `docs/showcase/savings-plan.md` |
| Swap door (WP35, investor portal) | The investor swaps the demo stable for the fund token in the Uniswap v4 permissioned pool from the connected wallet; after revoke the same swap is refused and the revert is shown in words. Pool on an anvil fork of Sepolia. | `scripts/pool-local.sh`, `POOL-LOCAL PASS`; browser: `scripts/app-e2e-local.sh --mode sp1-mock --pool --test` | `docs/swap.md` |
| zkPassport route (WP33) | A second evidence route: a passport chip proof from the zkPassport phone app, verified behind an adapter in front of the same policy. Locally a mock root verifier stands in; not run with a phone. | `scripts/zkpassport-local.sh`, `ZKPASSPORT-LOCAL PASS` | `docs/zkpassport.md` |

The demo scripts start from an address attested on the local chain by the operator path or a mock verifier (captioned as such); where the identity proof of the main route is made is stated in the Honesty box above. Sample identity from the official test wallet; testnet funds only.

## Pre-existing work

Everything in this repository was written during the event, except the adapted third-party code named in [DISCLOSURE.md](DISCLOSURE.md). The builder's pre-existing Rust EUDI verifier was modified during the event on branch `nachweis-relay` (blind relay, bridge mode, result minimization); those changes are exported as the patch series in `vendor/verifier-relay-patches/` with their base commit, so the event work on the verifier is reviewable here even before that branch is pushed.

## Name

The product is Attestat (renamed from Nachweis on 2026-09-07, record in [docs/wiki/decisions.md](docs/wiki/decisions.md) and [docs/wiki/name-and-domains.md](docs/wiki/name-and-domains.md)). Public copy says Attestat. Every machine-readable identifier keeps the nachweis name for this submission, because renaming it would change fixtures, proofs, signatures, packages and links during the event. Kept on purpose:

| String | Where | Kept because |
|---|---|---|
| `nachweis-app`, `nachweis-site`, `nachweis` | repository names, GitHub URLs, local paths | links and worktrees would break |
| `nachweis-bridge`, `nachweis-pid`, `nachweis-pid-lib`, `nachweis-pid-program`, `nachweis-pid-script`, `nachweis-companion`, `nachweis-e2e-wallet`, `nachweis-app` | crate and package names (`Cargo.toml`, `package.json`), built binaries | build identifiers referenced by scripts, docs and `include_elf!` |
| `nachweis:session:<id>` | EIP-191 message the crypto wallet signs (`service/src/chain.rs`, `app/src/bridge.ts`, companion) | recorded signatures and tests depend on it |
| `nachweis.pid.over18.v1` (POLICY_ID), `nachweis.demo.fund.v1` | policy id string hashed with keccak256 in contracts, bridge, app, fixtures | every fixture and proof commits to this id |
| `nachweis://handoff`, `nachweis://return` | URI schemes for the phone handoff (companion, `prover-android`, `prover-ios`) | registered in `AndroidManifest.xml` and `Info.plist` |
| `NACHWEIS_*`, `__NACHWEIS_DEV_SIGNER__` | environment variables and build flags (companion, Vite) | scripts and docs reference them |
| `org.nachweis.prover`, `io.nachweis.prover`, `NachweisProver`, "Nachweis Prover" | Android package, iOS bundle id, Xcode target, phone app display name | on-device app identity |
| "Nachweis Demo Fund", `NDF` | on-chain token name and symbol in deploy scripts and tests | part of the recorded fork evidence |
| `nachweis-relay`, `nachweis-verifier-relay` | verifier branch and worktree | git identifiers |
| "Nachweis" in `contracts/` comments and docs, `FEEDBACK.md`, `DISCLOSURE.md`, `prover-sp1/NOTES.md` | dated notes, NatSpec, sponsor feedback | same product; out of scope for the copy rename |

## License

Apache-2.0, see [LICENSE](LICENSE).
