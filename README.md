# Nachweis

Nachweis helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain.

ETHOnline 2026 submission (Continuity entry).

## Architecture

Input: the customer presents an SD-JWT credential from an EU Digital Identity Wallet (German sandbox test wallet) to the issuer's Rust verifier (pre-existing, see DISCLOSURE.md). The verifier checks the presentation and returns the predicates the issuer's policy needs (for example: adult, EU resident, not sanctioned). Decision: the issuer's approval is written to Sepolia as an `EligibilityDecision` in the `AttestationRegistry`, keyed by Ethereum address and policy id. The record holds policy id, predicate bits, tier, expiry and a status reference; no names, no strings, no personal data. Outputs: the `FundToken` transfer hook reads the record on every transfer, and the Uniswap v4 permissioned pool allowlist checker (`EudiAllowlistChecker`) reads the same view function. Revoke closes everything at once. The registry has a pluggable `IProofVerifier` per policy, so a zero-knowledge path (SP1 Groth16 via the SP1 verifier gateway, or a Noir UltraHonk verifier) can replace the operator-signed path without changing consumers.

## Repo layout

- `contracts/`: Foundry project. `AttestationRegistry`, `FundToken`, `Subscription`, interfaces, tests, deploy script. See `contracts/README.md`.
- `service/`: bridge between the Rust verifier and the registry operator key (to be added).
- `app/`: issuer and customer front end (to be added).
- `circuits/`: zero-knowledge circuits and verifier glue (to be added).
- `docs/`: design notes.

## Uniswap

Uniswap v4 permissioned pool on Sepolia, gated by the Nachweis registry. Uniswap's shared `PermissionsAdapterFactory` and `PermissionedHooks` are used as deployed; the only new contract on the Uniswap side is the allowlist checker.

- Checker: `contracts/src/uniswap/EudiAllowlistChecker.sol`, contract at lines 27-67; `checkAllowlist` at lines 58-61 returns `SWAP_ALLOWED | LIQUIDITY_ALLOWED` iff `registry.isEligible(account, policyId, requiredBits)`; `supportsInterface` at lines 64-66.
- Uniswap interfaces copied with source commit headers: `contracts/src/uniswap/interfaces/IAllowlistChecker.sol`, `contracts/src/uniswap/libraries/PermissionFlags.sol`, `contracts/src/uniswap/interfaces/IPermissionsAdapterFactory.sol`. Verified Sepolia addresses: `contracts/src/uniswap/UniswapSepolia.sol`.
- Tests: `contracts/test/EudiAllowlistChecker.t.sol` lines 64-117 (attested, unattested, revoked, expired, missing bits, other policy) and lines 125-132 (ERC-165); `contracts/test/PermissionedPoolFactory.t.sol` lines 21-210 run the checker through the real factory and adapter bytecode (fixture `contracts/test/fixtures/PermissionsAdapterFactory.json`, built from v4-periphery `dce236d`), lines 212-255 fork Sepolia and create an adapter against the live factory when `SEPOLIA_RPC_URL` is set.
- Script: `contracts/script/CreatePermissionedPool.s.sol` lines 56-114, the seven onboarding steps of the Uniswap deploy guide (steps 1 to 6 on chain, step 7 printed). Dry-run only so far.
- Notes, addresses, what each step needs: `contracts/docs/uniswap-permissioned-pool.md`.
- Developer feedback: `FEEDBACK.md`.

Builder TODO before submission: run the script with `--broadcast`, fill the TODO lines in `FEEDBACK.md`, then submit the Uniswap Developer Feedback Form at https://developers.uniswap.org/hackathon-feedback with a link to `FEEDBACK.md`.

## Pre-existing work

Everything in this repository was written during the event. Pre-existing components that the project builds on are listed in DISCLOSURE.md.

## License

Apache-2.0, see LICENSE.
