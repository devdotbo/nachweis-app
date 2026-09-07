# Nachweis

Nachweis helps token issuers accept EUDI identity evidence and apply their approval to customers' linked crypto wallets, without putting identity documents on chain.

ETHOnline 2026 submission (Continuity entry).

## Architecture

Input: the customer presents an SD-JWT credential from an EU Digital Identity Wallet (German sandbox test wallet) to the issuer's Rust verifier (pre-existing, see DISCLOSURE.md). The verifier checks the presentation and returns the predicates the issuer's policy needs (for example: adult, EU resident, not sanctioned). Decision: the issuer's approval is written to Sepolia as an `EligibilityDecision` in the `AttestationRegistry`, keyed by Ethereum address and policy id. The record holds policy id, predicate bits, tier, expiry and a status reference; no names, no strings, no personal data. Outputs: the `FundToken` transfer hook reads the record on every transfer, and a Uniswap v4 permissioned pool allowlist checker (later) reads the same view function. Revoke closes everything at once. The registry has a pluggable `IProofVerifier` per policy, so a zero-knowledge path (SP1 Groth16 via the SP1 verifier gateway, or a Noir UltraHonk verifier) can replace the operator-signed path without changing consumers.

## Repo layout

- `contracts/`: Foundry project. `AttestationRegistry`, `FundToken`, `Subscription`, interfaces, tests, deploy script. See `contracts/README.md`.
- `service/`: bridge between the Rust verifier and the registry operator key (to be added).
- `app/`: issuer and customer front end (to be added).
- `circuits/`: zero-knowledge circuits and verifier glue (to be added).
- `docs/`: design notes.

## Pre-existing work

Everything in this repository was written during the event. Pre-existing components that the project builds on are listed in DISCLOSURE.md.

## License

Apache-2.0, see LICENSE.
