# Continuity disclosure

Per ETHGlobal rules, all pre-existing work is disclosed here in writing. Only work done during the event is submitted for judging.

Everything in this repository was written during ETHOnline 2026, starting 2026-09-07. Version control (git) is kept throughout the event; the commit history is the record of event work.

## Pre-existing work by the builder

- Rust verifier workspace (`verifier-core`, `verifier-service`, `verifier-zk`, `zk-vectors`). Verifies EUDI SD-JWT presentations from the German sandbox test wallet. Last commit 2026-08-17. Local path: `/Users/bioharz/git/eudi-wallet-hackathon/verifier`. The builder's own prior work. It is used as an external dependency and is not copied into this repository and not modified during the event.
- `klartext-verifier`: the builder's own prior work, a verifier front end.
- `nachweis-android`: Android holder app based on wallet-core 0.28.1 (SD-JWT holder). Last commit 2026-07-13. The builder's own prior work.

## Third-party components

- eid-privacy `zkp-android` Noir SD-JWT circuit (https://github.com/eid-privacy/zkp-android), if used for the zero-knowledge path.
- SP1 (Succinct) and the SP1 verifier gateway contracts, public tooling.
- Foundry, OpenZeppelin Contracts, public tooling and libraries.

## Event work

Everything under `contracts/`, `service/`, `app/`, `circuits/` and `docs/` in this repository, plus the README and this disclosure.
