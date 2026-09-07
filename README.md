# Nachweis

How many strangers keep a copy of your passport? Every exchange, launchpad and fund asks for your ID and keeps it.

Nachweis helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain.

Spoken line: "Your ID wallet should work where you invest."

ETHOnline 2026 submission, Continuity entry. Pre-existing work is listed in [DISCLOSURE.md](DISCLOSURE.md).

## What happens

1. An investor opens the fund app with her own crypto wallet. Her address is not permitted yet.
2. She scans a QR code. The official German EUDI test wallet (sample identity) presents given name, family name and "over 18" to the issuer's verifier.
3. Her crypto wallet signs a session challenge; the presentation is bound to that address through the KB-JWT nonce.
4. The names stay with the issuer. A zero-knowledge proof is made of the statement "a PID signed by the pinned issuer key, with holder binding, says over 18, bound to this address".
5. The proof is submitted to the `AttestationRegistry`; the on-chain verifier checks it.
6. The registry now holds one record for (address, policy): policy id, predicate bits, tier, expiry, status reference. No name, no document, no string.
7. Door one: the `FundToken` transfer hook reads that record; she subscribes to the demo fund.
8. Door two: the Uniswap v4 permissioned pool's allowlist checker reads the same record; she swaps without a second presentation.
9. The issuer revokes. Both doors refuse the same address in the same block.
10. What the chain learned: an address holds a decision under a policy, and when it expires. Nothing that finds her.

## Honesty box

- Wallet: the official German EUDI test wallet from the SPRIND sandbox with a sample identity. Not a real state-issued identity. The synthetic fixture used in the tests carries the sandbox issuer's certificate chain but is signed with a fresh issuer key (see `prover-sp1/README.md`).
- Checks: sanctions, residency and every other issuer check are simulated in this build and labelled as such. The issuer's approval is a separate manual action.
- Proof route 1 (SP1 Groth16): the statement runs inside the SP1 zkVM on the issuer's server (`prover-sp1`, driven by `service`), wrapped as Groth16, verified on Sepolia by the SP1 verifier gateway through `Sp1PidVerifier`. The chain does not trust the server, but the server did see the presentation.
- Proof route 2 (Noir UltraHonk): the same statement as a Noir circuit (`circuits/pid-sdjwt`), proved client-side on a desktop today, verified fully on chain by a bb-generated verifier through `NoirPidVerifier`. Packaging for the phone is in progress and is not part of this submission.
- What neither proof checks: the x5c chain from the issuer certificate to a trust anchor (the contracts pin the issuer key hash instead), the credential status list, and the freshness window of the challenge. The pre-existing verifier performs those checks in front of the bridge once its verifier mode is wired (two endpoints pending, see `service/README.md`); in the local mode used for the demo nothing checks them. The proof covers the statement subset only.
- Revocation is manual: the issuer's operator key calls `revoke`.
- Deployment status on 2026-09-07: nothing is deployed to any network. All Sepolia interaction so far is fork tests and dry runs. Addresses will be added here after the Sepolia run in `docs/demo-runbook.md`.
- Numbers (cycle counts, proving times, gas, verification keys) live in `prover-sp1/NOTES.md` and `circuits/README.md` and are being regenerated; this file does not repeat them.

## Repository map

- `contracts/`: Foundry project. `AttestationRegistry` (pluggable `IProofVerifier` per policy), `FundToken`, `Subscription`, `Sp1PidVerifier`, `NoirPidVerifier`, the Uniswap allowlist checker, deploy and pool scripts, tests. See `contracts/README.md`.
- `prover-sp1/`: SP1 guest program and host for the PID statement, Groth16 fixture, measurements in `NOTES.md`.
- `circuits/`: Noir circuit `pid-sdjwt` for the same statement, adapted from eid-privacy's swiyu circuit (`circuits/pid-sdjwt/ADAPTATION.md`), witness generator, negative tests.
- `service/`: Rust bridge (axum, alloy, sp1-sdk). Sessions, wallet address proof, native statement check, prover, `attestWithProof` and `revoke` with the operator key. See `service/README.md`.
- `app/`: Vite and React front end, investor and issuer screens, mock mode for a chain-free run. See `app/README.md`.
- `docs/`: `demo-runbook.md` (local sequence and the Sepolia run), `video-shotlist.md` (seven beats).
- `DISCLOSURE.md`, `FEEDBACK.md` (Uniswap developer feedback), `LICENSE`.

## Run it locally

`docs/demo-runbook.md` has the ordered sequence with the exact commands, environment and expected output: anvil, contract deployment, the bridge in mock and Groth16 mode, the app in mock and real mode, the six beats, the Uniswap pool on a Sepolia fork, revoke and the refusals, and the Sepolia real run. Every step is marked with whether it was verified locally on 2026-09-07 and, if it failed, the exact error.

## Uniswap

Uniswap v4 permissioned pool on Sepolia, gated by the Nachweis registry. Uniswap's shared `PermissionsAdapterFactory`, `PermissionedHooks`, `PermissionedPositionManager` and the permissioned Universal Router are used as deployed; the only new contract on the Uniswap side is the allowlist checker.

- Checker: `contracts/src/uniswap/EudiAllowlistChecker.sol`, contract at lines 27 to 67; `checkAllowlist` at lines 58 to 61 returns `SWAP_ALLOWED | LIQUIDITY_ALLOWED` iff `registry.isEligible(account, policyId, requiredBits)`; `supportsInterface` at lines 64 to 66.
- Uniswap interfaces copied with source commit headers: `contracts/src/uniswap/interfaces/IAllowlistChecker.sol`, `contracts/src/uniswap/libraries/PermissionFlags.sol`, `contracts/src/uniswap/interfaces/IPermissionsAdapterFactory.sol`. ABI subsets written here: `IPermissionsAdapterLite.sol`, `IPoolManagerLite.sol`, `IPermissionedPositionManagerLite.sol`, `IUniversalRouterLite.sol`, `IPermit2Lite.sol`, `IStateViewLite.sol`. Calldata the position manager and the router decode: `contracts/src/uniswap/libraries/PermissionedPoolActions.sol` (`ExactInputSingleParams` at 25 to 32, mint calldata at 49 to 58, `V4_SWAP` calldata at 63 to 89, pool id at 92 to 94). Verified Sepolia addresses: `contracts/src/uniswap/UniswapSepolia.sol`.
- Tests: `contracts/test/EudiAllowlistChecker.t.sol` lines 64 to 117 (attested, unattested, revoked, expired, missing bits, other policy) and 125 to 132 (ERC-165); `contracts/test/PermissionedPoolFactory.t.sol` lines 21 to 210 run the checker through the real factory and adapter bytecode (fixture `contracts/test/fixtures/PermissionsAdapterFactory.json`, built from v4-periphery `dce236d`), lines 212 to 255 fork Sepolia and create an adapter against the live factory when `SEPOLIA_RPC_URL` is set; `contracts/test/PermissionedPoolSwap.fork.t.sol` lines 62 to 96 (onboard and mint on a Sepolia fork) and 187 to 286 (mint, swap as an attested investor, revoke, the identical swap reverts in `PermissionedHooks.beforeSwap`, never-attested address refused).
- Scripts: `contracts/script/lib/PermissionedPoolOnboarding.sol` lines 32 to 93 are the six on-chain onboarding steps of the Uniswap deploy guide; `contracts/script/CreatePermissionedPool.s.sol` lines 52 to 74 (Nachweis contracts, then the onboarding call) and 91 to 94 (step 7 printed); `contracts/script/AddLiquidityPermissioned.s.sol` lines 24 to 54 (mint through the PermissionedPositionManager); `contracts/script/SwapPermissioned.s.sol` lines 33 to 92 (Permit2 approvals at 77 to 78, `UniversalRouter.execute` at 79; `REVOKE_INVESTOR=true` shows the refusal). All dry-run on a Sepolia fork so far, see the status line above.
- Notes, addresses, what each step needs, viem calldata for the app: `contracts/docs/uniswap-permissioned-pool.md`.
- Developer feedback: `FEEDBACK.md`.

Builder TODO before submission: run the three scripts with `--broadcast` (order in `docs/demo-runbook.md`), fill the TODO lines in `FEEDBACK.md`, then submit the Uniswap Developer Feedback Form at https://developers.uniswap.org/hackathon-feedback with a link to `FEEDBACK.md`.

## Pre-existing work

Everything in this repository was written during the event. The pre-existing components it builds on (the builder's Rust EUDI verifier, used as an external dependency and not modified; third-party circuits and tooling) are listed in [DISCLOSURE.md](DISCLOSURE.md). The verifier's blind-relay branch (`klartext-verifier`, branch `nachweis-relay`) lives in a separate repository and is not yet pushed; the bridge's verifier mode needs two endpoints from that branch (`service/README.md`, "How the presentation reaches the bridge").

## License

Apache-2.0, see [LICENSE](LICENSE).
