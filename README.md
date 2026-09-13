# Attestat

Attestat, formerly Nachweis. The product was renamed on 2026-09-07; identifiers keep the nachweis name for this submission (section "Name" below).

How many strangers keep a copy of your passport? Every exchange, launchpad and fund asks for your ID and keeps it.

Attestat helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain. Any contract that reads `isEligible` can enforce the decision.

Spoken line: "Your ID wallet should work where you invest."

ETHOnline 2026 submission, Classic entry (decision of 2026-09-09: Attestat is a new project; the builder's own public verifier library is disclosed as pre-existing work). Pre-existing work, event changes to it, adapted third-party code and new code are listed in [DISCLOSURE.md](DISCLOSURE.md). How the project is run (wiki as specification and decision record, work packages with acceptance tests, evidence labels) is in [docs/process.md](docs/process.md); the human and AI contributions are in [docs/ai-attribution.md](docs/ai-attribution.md).

## What happens

1. An investor opens the fund app with her own crypto wallet. Her address is not permitted yet.
2. She scans a QR code. The official German EUDI test wallet (sample identity) answers the issuer's request with given name, family name and "over 18". On the demonstrated browser route the answer is encrypted to a key made in her tab and passes through the issuer's relay unopened.
3. Her crypto wallet signs a session challenge; the presentation is bound to that address through the KB-JWT nonce.
4. In the demonstrated browser route, the investor's tab decrypts the presentation and generates the proof. The relay receives the encrypted response, and the on-chain verifier checks the proof. The issuer separately approves eligibility. The proof states "a PID signed by the pinned issuer key, with holder binding, says over 18, bound to this address".
5. The proof is submitted to the `AttestationRegistry`; the on-chain verifier checks it.
6. The registry now holds one record for (address, policy): policy id, predicate bits, tier, expiry, status reference. No name, no document, no string. The doors stay closed: evidence alone is not eligibility.
7. The issuer approves in a separate step with its operator key (`approve`); `isEligible` requires the evidence and the approval (`docs/spec-issuer-approval.md`).
8. Door one: the `FundToken` transfer hook reads that record; she subscribes to the demo fund.
9. Door two: the Uniswap v4 permissioned pool's allowlist checker reads the same record; she swaps without a second presentation.
10. The issuer revokes. After one revoke, both doors refuse the same address.
11. What the chain learned: an address holds a decision under a policy, and when it expires. No name or identity document is published; the public address may still be linked to a person.

## How a contract consumes a decision

A consumer needs three values: the registry address, a policy id and the required predicate bits. It calls `registry.isEligible(account, policyId, requiredBits)` and learns nothing about EUDI, the wallet or the proof. The Uniswap allowlist checker is the whole integration: `contracts/src/uniswap/EudiAllowlistChecker.sol`, `checkAllowlist` at lines 58 to 61 returns `SWAP_ALLOWED | LIQUIDITY_ALLOWED` (`ELIGIBLE_FLAGS`, lines 42 to 45) iff the registry says eligible.

```solidity
function checkAllowlist(address account, address tokenAddress) external view returns (PermissionFlag) {
    tokenAddress;
    return registry.isEligible(account, policyId, requiredBits) ? ELIGIBLE_FLAGS : PermissionFlags.NONE;
}
```

`FundToken` is the other consumer: its transfer hook (`contracts/src/FundToken.sol`, `_update` at lines 65 to 73) asks the same question for the sender and the receiver and reverts with `NotEligible` otherwise. `isEligible` is true when the record exists, is approved by the issuer, is not revoked, has not expired and carries the required bits (`docs/spec-issuer-approval.md`).

## Honesty box

- Wallet: the official German EUDI test wallet from the SPRIND sandbox with a sample identity. Not a real state-issued identity. The synthetic fixture used in the tests carries the sandbox issuer's certificate chain but is signed with a fresh issuer key (see `prover-sp1/README.md`).
- Checks: sanctions, residency and every other issuer check are simulated in this build and labelled as such. The issuer's approval is a separate manual action, enforced on chain since 2026-09-08 (`approve` by an operator; a proof alone opens no door).
- Proof route 1 (SP1 Groth16): the statement runs inside the SP1 zkVM on the issuer's server (`prover-sp1`, driven by `service`), wrapped as Groth16, verified through `Sp1PidVerifier` by the SP1 verifier gateway deployed on Sepolia, exercised so far on a local Sepolia fork (anvil), not on Sepolia itself. The chain does not trust the server, but the server did see the presentation.
- Proof route 2 (Noir UltraHonk): the same statement as a Noir circuit (`circuits/pid-sdjwt`), proved client-side on a desktop today, verified fully on chain by a bb-generated verifier through `NoirPidVerifier`. On-phone provers exist for Android (emulator) and iOS (simulator) on the same core; physical-device runs are optional and not part of the main path.
- What neither proof checks: the x5c chain from the issuer certificate to a trust anchor (the contracts pin the issuer key hash instead), the credential status list, and the freshness window of the challenge. Who checks them differs per route. SP1 route in verifier mode: the pre-existing verifier performs trust chain (when anchored), status list (when enabled) and KB-JWT freshness in front of the bridge, and the bridge repeats the freshness check (`KB_JWT_WINDOW_SECS`); both see the plaintext presentation. Noir route: the verifier only relays ciphertext, the bridge receives proof and public inputs and checks no freshness, and the companion's `--kb-window` is the only freshness check; nobody checks trust chain or status list on that route. Local mode: nothing checks them. The proof covers the statement subset only. The route-specific contract is in `docs/trust-boundaries.md`.
- Revocation is manual: the issuer's operator key calls `revoke`.
- Deployment status: deployed on Sepolia on 2026-09-10 (section "Sepolia deployment (2026-09-10)" below, record `docs/deployments/sepolia-2026-09-10.md`, not verified on Etherscan); the investor journey with the official wallet ran on that deployment on 2026-09-12 (record `docs/evidence/sepolia-phone-2026-09-12.md`, `attestWithProof` from a browser-made proof, then approve, subscribe, swap, revoke, refused swap). Before 2026-09-10 every Sepolia interaction was fork tests and dry runs; the SP1 verifier route stays on the fork.
- Numbers (cycle counts, proving times, gas, verification keys) live in `prover-sp1/NOTES.md` and `circuits/README.md` and are being regenerated; this file does not repeat them.

## Sepolia deployment (2026-09-10)

Deployed on Sepolia (chain id 11155111) on 2026-09-10 by `scripts/sepolia-deploy.sh`, 33 transactions in blocks 11676804 to 11676836, every receipt status 1. The record with every transaction hash, the gas figures, the env lines for the stack and the on-chain checks is `docs/deployments/sepolia-2026-09-10.md`. Deployer (registry owner, token issuer, operator, liquidity provider): [0x452A376805821aD33D2F01c9134Ba5E26455900a](https://sepolia.etherscan.io/address/0x452A376805821aD33D2F01c9134Ba5E26455900a). The stack attaches to this deployment without anvil: `scripts/browser-real-wallet-up.sh --deployment docs/deployments/sepolia-2026-09-10.md` (`docs/demo-runbook.md`, "Sepolia run"). The journey on Sepolia (attest by operator instead of the phone, then approve, subscribe, swap, revoke and both refusals) is recorded in [`docs/evidence/sepolia-journey-2026-09-10.md`](docs/evidence/sepolia-journey-2026-09-10.md); the complete fork run of the same journey on the same tree is `docs/evidence/browser-pool-journey-2026-09-10.md`.

| contract | address |
|---|---|
| AttestationRegistry | [0xeD46dC419e826c9Fdf16aADe1C9e3e970cc8ad53](https://sepolia.etherscan.io/address/0xeD46dC419e826c9Fdf16aADe1C9e3e970cc8ad53) |
| FundToken (NDF) | [0x8Ef00746fc2508B01CC8bBCDd0e161598eC9792f](https://sepolia.etherscan.io/address/0x8Ef00746fc2508B01CC8bBCDd0e161598eC9792f) |
| Subscription | [0x1542515f5E8a00BF087bEcdeEdfC4c9Bd68569fb](https://sepolia.etherscan.io/address/0x1542515f5E8a00BF087bEcdeEdfC4c9Bd68569fb) |
| HonkVerifier (bb-generated UltraHonk verifier) | [0xD9db2b374d751E9D3C156a91D97bB6862908e9d5](https://sepolia.etherscan.io/address/0xD9db2b374d751E9D3C156a91D97bB6862908e9d5) |
| ZKTranscriptLib (library linked into HonkVerifier) | [0x60FcC13D41eBd235c7c43D55DE5053d12e28AF13](https://sepolia.etherscan.io/address/0x60FcC13D41eBd235c7c43D55DE5053d12e28AF13) |
| NoirPidVerifier (verifier of policy `nachweis.pid.over18.v1`) | [0x44970b304f5e0E53A2cD32a6064da8bE951b757A](https://sepolia.etherscan.io/address/0x44970b304f5e0E53A2cD32a6064da8bE951b757A) |
| MockStable (mUSD, 6 decimals) | [0x645476358892F920991e544394EA24fF6Df5204A](https://sepolia.etherscan.io/address/0x645476358892F920991e544394EA24fF6Df5204A) |
| EudiAllowlistChecker | [0x967A701c99D467EB9d6192bE87D4742c90aF7046](https://sepolia.etherscan.io/address/0x967A701c99D467EB9d6192bE87D4742c90aF7046) |
| PermissionsAdapter (created by Uniswap's PermissionsAdapterFactory, wraps NDF) | [0xc440aD626959d97a689Ba0465f2F1eD293a0b20D](https://sepolia.etherscan.io/address/0xc440aD626959d97a689Ba0465f2F1eD293a0b20D) |

- Pool id `0x5ea00f1b6307f536f4880101648c0428df57a3e645cbb60c25e00a0ba29cbec7` on Uniswap's [PoolManager](https://sepolia.etherscan.io/address/0xE03A1074c86CFeDd5C142C4F04F1a1536e203543): currency0 mUSD, currency1 the adapter, fee 3000, tick spacing 60, hook [PermissionedHooks](https://sepolia.etherscan.io/address/0x51247E2291d290d17C08813A175AC86465EdE8c0), initialised in block 11676826, swapping enabled. Liquidity: 1000 NDF and 1000 mUSD full range, position token id 9 on the [PositionManager](https://sepolia.etherscan.io/address/0xf99D553912084c99F6299291b75Fe9B7119Aa1A7), held by the deployer.
- Policy id `0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f` (`keccak256("nachweis.pid.over18.v1")`), required bits 3; the registry maps it to the NoirPidVerifier and the deployer is its operator.
- Issuer pin: the NoirPidVerifier pins `ISSUER_KEY_HASH` `0xb4f2bfa1df99f06e588d39931b2cfd517a2befe8737c7f86bfa5c668d2abe079`, the sandbox PID issuer behind the official German test wallet. Only a presentation signed by that issuer key produces an accepted proof on Sepolia; the synthetic test fixture with its fresh issuer key does not.
- Not verified on Etherscan: the deployment ran without `ETHERSCAN_API_KEY`, so Etherscan shows bytecode without source for the eight contracts above. Source verification can be added later with `forge verify-contract --chain sepolia --guess-constructor-args` per contract. `Sp1PidVerifier` is not deployed on Sepolia.
- Uniswap contracts used as deployed by Uniswap (addresses in `contracts/src/uniswap/UniswapSepolia.sol`): [PermissionsAdapterFactory](https://sepolia.etherscan.io/address/0xE6B0d96919334C33d06266d1420F97f6f434fA2B), [UniversalRouter](https://sepolia.etherscan.io/address/0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7), [Permit2](https://sepolia.etherscan.io/address/0x000000000022D473030F116dDEE9F6B43aC78BA3), [StateView](https://sepolia.etherscan.io/address/0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C), plus PoolManager, PermissionedHooks and PositionManager linked above.

Evidence records (sanitized, `docs/evidence/`, index in [`docs/evidence/README.md`](docs/evidence/README.md)). Primary journey record: [`docs/evidence/sepolia-phone-2026-09-12.md`](docs/evidence/sepolia-phone-2026-09-12.md), the official wallet on the builder's iPhone, proof made in the browser tab, separate issuer approval, subscribe, swap, revoke and the refused swap, all on Sepolia. Earlier records: [`docs/evidence/sepolia-journey-2026-09-10.md`](docs/evidence/sepolia-journey-2026-09-10.md) (the same journey on Sepolia without the phone, attested by the operator key) and [`docs/evidence/browser-real-wallet-2026-09-08.md`](docs/evidence/browser-real-wallet-2026-09-08.md) (official wallet against a local anvil, proof in the browser tab; the companion-prover run of the same day is `docs/evidence/g0-2026-09-08.md`).

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

Uniswap v4 permissioned pool gated by the Attestat registry, built against the Uniswap contracts deployed on Sepolia, exercised on a local Sepolia fork (anvil) and, since 2026-09-10, deployed on Sepolia itself (section "Sepolia deployment (2026-09-10)": checker, adapter, pool id, liquidity position). Uniswap's shared `PermissionsAdapterFactory`, `PermissionedHooks`, `PermissionedPositionManager` and the permissioned Universal Router are used as deployed; the only new contract on the Uniswap side is the allowlist checker.

- Checker: `contracts/src/uniswap/EudiAllowlistChecker.sol`, contract at lines 27 to 67; `checkAllowlist` at lines 58 to 61 returns `SWAP_ALLOWED | LIQUIDITY_ALLOWED` iff `registry.isEligible(account, policyId, requiredBits)`; `supportsInterface` at lines 64 to 66.
- Uniswap interfaces copied with source commit headers: `contracts/src/uniswap/interfaces/IAllowlistChecker.sol`, `contracts/src/uniswap/libraries/PermissionFlags.sol`, `contracts/src/uniswap/interfaces/IPermissionsAdapterFactory.sol`. ABI subsets written here: `IPermissionsAdapterLite.sol`, `IPoolManagerLite.sol`, `IPermissionedPositionManagerLite.sol`, `IUniversalRouterLite.sol`, `IPermit2Lite.sol`, `IStateViewLite.sol`. Calldata the position manager and the router decode: `contracts/src/uniswap/libraries/PermissionedPoolActions.sol` (`ExactInputSingleParams` at 25 to 32, mint calldata at 49 to 57, `V4_SWAP` calldata at 63 to 89, pool id at 92 to 94). Verified Sepolia addresses: `contracts/src/uniswap/UniswapSepolia.sol`.
- Tests: `contracts/test/EudiAllowlistChecker.t.sol` lines 67 to 155 (unattested, proof evidence without approval, attested and approved, revoked, expired, missing bits, other policy) and 163 to 170 (ERC-165); `contracts/test/PermissionedPoolFactory.t.sol` lines 21 to 208 run the checker through the real factory and adapter bytecode (fixture `contracts/test/fixtures/PermissionsAdapterFactory.json`, built from v4-periphery `dce236d`), lines 210 to 255 run on a local Sepolia fork and create an adapter against the factory deployed there when `SEPOLIA_RPC_URL` is set; `contracts/test/PermissionedPoolSwap.fork.t.sol` lines 62 to 96 (onboard and mint on a Sepolia fork) and 187 to 286 (mint, swap as an attested investor, revoke, the identical swap reverts in `PermissionedHooks.beforeSwap`, never-attested address refused).
- Scripts: `contracts/script/lib/PermissionedPoolOnboarding.sol` lines 32 to 93 are the six on-chain onboarding steps of the Uniswap deploy guide; `contracts/script/CreatePermissionedPool.s.sol` lines 52 to 74 (Attestat contracts, then the onboarding call) and 91 to 94 (step 7 printed); `contracts/script/AddLiquidityPermissioned.s.sol` lines 24 to 54 (mint through the PermissionedPositionManager); `contracts/script/SwapPermissioned.s.sol` lines 33 to 92 (Permit2 approvals at 77 to 78, `UniversalRouter.execute` at 79; `REVOKE_INVESTOR=true` shows the refusal). Dry runs and, since 2026-09-09, broadcasts to a local anvil fork of Sepolia (`scripts/pool-local.sh`); since 2026-09-10 the same three scripts broadcast to Sepolia through `scripts/sepolia-deploy.sh` (section "Sepolia deployment (2026-09-10)"; the Sepolia swap and refused swap are in [`docs/evidence/sepolia-journey-2026-09-10.md`](docs/evidence/sepolia-journey-2026-09-10.md)).
- The Swap door in the investor portal (2026-09-09, `docs/swap.md`): `app/src/components/swap/calldata.ts` encodes the same `V4_SWAP` calldata with viem (`swapCalldata` at lines 36 to 71), quotes the exact-input amount from `StateView.getSlot0` and `getLiquidity` (`quoteExactIn` at 85 to 94; the deployed V4Quoter cannot quote a permissioned pool, `FEEDBACK.md` item 18) and decodes a refusal into words (`explainRevert` at 129 to 186: `WrappedError`, `Unauthorized`, `SwappingDisabled`, `HookNotAllowed`, `NotEligible`, `ExecutionFailed`); `app/src/components/swap/useSwap.ts` reads the pool and the adapter (`usePoolState` at 46 to 99), the three answers the pool relies on (`useSwapCheck` at 112 to 130: `registry.isEligible`, `checker.checkAllowlist`, `adapter.isAllowed`) and sends the swap from the connected wallet (`useSwapTx` at 167 to 261: faucet, ERC-20 approve to Permit2, Permit2 allowance, `eth_call` preflight, `UniversalRouter.execute`; a refused swap is sent with a fixed gas limit so it is mined and has a hash); `SwapDoor.tsx` is the tile, `SwapExplainer.tsx` the pool panel. Local pool: `scripts/pool-local.sh` (anvil fork of Sepolia with chain id 31337, the three scripts, a probe swap and a refused swap, `POOL-LOCAL PASS` in 24 s); browser run: `scripts/app-e2e-local.sh --mode sp1-mock --pool --test` with `app/e2e/swap.spec.ts` (swap, revoke in the console, refused swap decoded on screen). Screenshots in `docs/ui/` (`investor-11` to `investor-13`, `issuer-07`).
- Notes, addresses, what each step needs, viem calldata for the app: `contracts/docs/uniswap-permissioned-pool.md`.
- Developer feedback: `FEEDBACK.md`.

No further transaction is needed for evidence. The three scripts were broadcast to Sepolia on 2026-09-10 (`scripts/sepolia-deploy.sh`, record `docs/deployments/sepolia-2026-09-10.md`), and the pool was used from the investor portal with the official wallet on 2026-09-12: swap [`0xda990178ec3a1a972244ab280415eabac693944ec7a6efd81e5317eb29facd4b`](https://sepolia.etherscan.io/tx/0xda990178ec3a1a972244ab280415eabac693944ec7a6efd81e5317eb29facd4b) (block 11688117, status 1) and, after the revoke, the refused swap [`0x85e554b8ffc73f617c25275a636d216e7bd0c9adf36e4a307e8355e8d957d9f9`](https://sepolia.etherscan.io/tx/0x85e554b8ffc73f617c25275a636d216e7bd0c9adf36e4a307e8355e8d957d9f9) (block 11688138, status 0, mined and rejected in `PermissionedHooks.beforeSwap`), both in [`docs/evidence/sepolia-phone-2026-09-12.md`](docs/evidence/sepolia-phone-2026-09-12.md). Remaining builder step: submit the Uniswap Developer Feedback Form at https://developers.uniswap.org/hackathon-feedback with a link to `FEEDBACK.md`.

## Privy

A standing order: the issuer's automation runs a recurring `Subscription.subscribe()` for an investor from the investor's own Privy embedded wallet, through a signer whose policy is a copy of the on-chain eligibility decision (only this fund's Subscription contract, only until the decision's expiry, deny-all appended when the registry emits `Revoked`). Green for class L on 2026-09-09 (local chain, automation in local mode, no Privy app: `scripts/standing-order-local.sh` prints `STANDING-ORDER-LOCAL PASS`); the Sepolia run with the builder's Privy app (class S) is a builder step and not yet done, so nothing here is described as a Privy run. No contract, bridge or circuit changed.

- Policy builder: `automation/src/policy.ts`, `buildRules` at lines 52 to 71 (rule 1: DENY every method at `system.current_unix_timestamp >= expiry`; rule 2: ALLOW `eth_sendTransaction` when `to` is the Subscription contract, `chain_id` is the configured chain and the calldata decodes to `subscribe()`, ABI inline), `denyAllRule` at 73, `applyRevoked` at 82, `applyApproved` at 87, plain words at 105, the local evaluator (simulated Privy policy, dev loop only) at 175. Tests: `automation/test/policy.test.ts`, 13 tests, and `automation/test/store.test.ts`, 3 tests (`cd automation && bun test`: 16 pass, 2026-09-09).
- Watcher: `automation/src/watch.ts`, `poll` at 40, `onApproved` at 70 (policy from `decisionOf`, deny-all removed, expiry refreshed), `onRevoked` at 99 (deny-all appended). Policy backend: `automation/src/policies.ts`, `PrivyPolicies` at 39 (`policies().create` at 42, `createRule` at 48, `deleteRule` at 59; no owner, so the app secret updates the policy).
- Signer and tick: `automation/src/signer.ts`, `PrivySigner` at 76 (`wallets().ethereum().sendTransaction` with `caip2: eip155:<chain>` at 94 to 95, signed with the authorization key), `LocalSigner` at 44 (evaluator at 69; the clock is anvil's block time); `automation/src/tick.ts`, `runTick` at 29, `TICK OK` at 53, `TICK DENIED policy` then `TICK DENIED chain` at 60 to 64. Server: `automation/src/server.ts`, `GET /status` at 69, `GET /policy/:address`, `POST /tick` at 93.
- App: `app/src/lib/PrivyBoundary.tsx` (the one switch, reusable by other screens as `<PrivyBoundary plain={...}>`) loads `app/src/lib/PrivyWalletProvider.tsx` when `VITE_PRIVY_APP_ID` is set; `app/src/lib/WalletProvider.tsx` lines 36 to 48 wrap the plain tree in it (`PrivyProvider` at 84 to 98 with email login and `createOnLogin: 'users-without-wallets'`, `createConfig` from `@privy-io/wagmi` at 24, `addSigners` at 52, `removeSigners` at 59); unset, the previous tree is unchanged. Connect option "Sign in with email, wallet by Privy": `app/src/lib/wallet.ts` lines 119 to 121; disconnect is Privy's `logout()` at 163. Card: `app/src/components/StandingOrderCard.tsx` (Allow at 58, Run the month at 67, Remove signer at 75), mounted at `app/src/screens/InvestorScreen.tsx:66`. Issuer log: `app/src/components/AutomationLog.tsx`, mounted at `app/src/screens/IssuerScreen.tsx:87`. Env: `app/.env.example` (`VITE_PRIVY_APP_ID`, `VITE_PRIVY_SIGNER_ID`, `VITE_AUTOMATION_URL`), `automation/.env.example`.
- Local run: `scripts/standing-order-local.sh` (anvil, Deploy, automation in local mode, `attestByOperator` at 112, three ticks, `revoke` at 136, re-approve, `evm_increaseTime` at 157, a second investor without a delegated wallet).
- The exact policy JSON, the fallback shape, the builder's Sepolia runbook, the evidence template and the two on-screen sentences: `docs/privy-standing-order.md`.

Two on-screen sentences. Investor card: "Wallet by Privy: an embedded wallet created at email sign-in. Your identity evidence never goes to Privy. Privy sees this address, the transactions it signs, and one policy: the issuer's automation may send subscribe() for you to this fund until your decision expires on <date>. When the issuer revokes your decision, its automation closes the policy; you can remove the signer here at any time. Sample identity from the official test wallet; testnet funds." Issuer panel: "Automation by Privy: the issuer's key signs on the investor's wallet only under a policy copied from her on-chain decision. Revoke on chain, then the automation adds a deny rule to that policy. Privy enforces the policy; Privy does not read the chain."

Privy: not claimed for this submission (decision 2026-09-10); the standing order stays a local showcase. The Sepolia runbook in `docs/privy-standing-order.md` section 7 and the evidence template in section 8 remain for a later run.

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

## Beyond the demo

Directions recorded in the wiki copy, none of them part of the demonstrated journey:

- [`docs/wiki/pitch-toolkit.md`](docs/wiki/pitch-toolkit.md): the 2026-09-09 framing of the showcase gallery and the site lines. Notes, not demonstrated.
- [`docs/wiki/privy-cases/`](docs/wiki/privy-cases/README.md): five Privy business cases with a scored evaluation; one became the local standing-order showcase above, the other four are parked.
- [`docs/wiki/zkpassport.md`](docs/wiki/zkpassport.md): zkPassport as a second evidence route for biometric passports outside the EU; an adapter exists on the same verifier interface and is not demonstrated.
- [`docs/wiki/identity-standards.md`](docs/wiki/identity-standards.md): survey of national and regional identity systems and what each could feed into the registry interface. Reference, not demonstrated.

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
