---
type: plan
title: ZK plan: routes, facts, kill tests
updated: 2026-09-08
sources:
  - raw/2026-09-07-real-zk-routes.md (including the addendum)
  - raw/2026-09-06-zk-feasibility.md
  - nachweis-app/prover-sp1/NOTES.md
---

# ZK plan

Order decided 2026-09-07 (wiki/decisions.md): primary experiment client-side proving with blind relay; fallback R1 SP1 server-side; exhibit R4 Multipaz on-phone Longfellow, optional. Statement proved in every route: a PID from the official test wallet, signed under the sandbox trust anchor, holder-bound to this crypto address, says over 18. Names never enter the proof.

## Routes

| Route | Real on camera | Still to declare | Status 2026-09-07 | Kill test |
|---|---|---|---|---|
| Client-side proving, blind relay (primary experiment) | Proof made on the investor's computer (Mac companion; FACT, G0 record 2026-09-08) over the official-wallet presentation; server relays the JWE unopened | Companion app, not the official wallet, makes the proof; browser proving unverified | WP3 relay implemented, green pending the phone test (branch nachweis-relay, 188 tests pass, docs/blind-relay.md); WP4 waits for Astra (circuit), WP5 waits (prover app) | Sep 8: blind-relay test against the sandbox wallet; kill the blind-relay claim if the wallet does not accept a client-generated ephemeral key in client_metadata.jwks. Sep 9: adapted circuit proves a captured sandbox presentation on the Pixel; else fall back to R1 |
| R1 SP1 server-side proof, Groth16 on Sepolia (fallback, guaranteed ZK for the video) | ZK proof over the official-wallet presentation, verified by the registry through the SP1 gateway; public values carry no names | Proof made by our server (ZK toward chain and public, not toward the server) | WP6 green (measured, below); WP2b adapter green on a Sepolia fork (about 280k gas); live transaction outstanding | Own kill Sep 10: attestWithProof with a real proof succeeds on Sepolia, else operator path only |
| R4 Multipaz test app, on-phone Longfellow into verifier-zk (exhibit) | Real on-phone proof from an OpenWallet Foundation app, verified fail-closed by the pre-existing verifier | Test credential from the app's bundled IACA, not the sandbox PID; IACA is P-384 while verifier-zk chain code is P-256 only (FACT, memo section 3) | WP11 optional, after the main flow | Install APK, provision the ZKP-friendly document, present to verifier.multipaz.org, then to verifier-service. Drop without regret |
| R5 zkPassport | Real on-phone ZK from a passport | Passport, not EUDI | side clip only, never primary | none needed |
| R2 Noir from scratch | same as R1 | no circuit to start from | rejected, superseded by eid-privacy | none |
| R3 Semaphore v4 | membership proof | anonymity set of one, targeted revoke impossible | rejected | none |
| R6 RISC Zero via Boundless | same as R1 | Groth16 unsupported on Apple Silicon (FACT, https://dev.risczero.com/api/generating-proofs/local-proving, 2026-09-07) | not needed, SP1 Groth16 works natively | none |

## Facts

Client-side circuit (FACT, https://eid-privacy.github.io/wp2/2026/06/19/noir-benchmarking-mobile.html, fetched 2026-09-07 per the addendum): Noir circuit d10_swiyu_jwt verifies an unmodified SD-JWT credential with holder binding and an age proof; Swiss swiyu test SD-JWT, re-signed with custom issuer keys; Galaxy A54 5G, native Android app built with Mopro, Barretenberg backend; proving time average 18.419 s (best 16.154, worst 21.013); proof 14,656 bytes, circuit 2.5 MB, setup 32 MB; authors call it entirely unoptimised. Noir source: [local path, withheld] (siblings c03 to c09) and the benchmark variant [local path, withheld]; the Android app https://github.com/eid-privacy/zkp-android (local clone [local path, withheld], commit 1f1fcedf, 2026-06-19, MPL 2.0) ships compiled artifacts only and is the Mopro packaging reference. Not run in a browser; bb.js unverified. Target device Pixel 10; no measurement on it yet.

SP1 spike, measured 2026-09-07 on the builder's M3 Max (16 cores, 128 GB), FACT, nachweis-app/prover-sp1/NOTES.md:

- SP1 6.1.0 pinned (semver ^6 pulls 6.7.0 and the guest link fails); patched p256 and sha2 crates.
- Guest statement: issuer JWT ES256 verifies under the private-input issuer key, vct matches; every disclosure anchored in a signed _sd, nested age_equal_or_over included; over18 from the disclosure named "18"; KB-JWT ES256 under cnf.jwk, typ kb+jwt, aud, sd_hash; nonce == lowercase hex(sha256(address20 || challenge32)); expiry = min(issuer exp, KB exp).
- Execute: 430,143 cycles, 1,750 syscalls. (The memo of 2026-09-07 had estimated low tens of millions; measured is two orders lower.)
- Compressed proof, CPU: 59.0 s prove, 70.2 s real, peak RSS 28.3 GB.
- Groth16 wrap natively via Go gnark (no Docker): 263.8 s prove, 274.6 s real, peak RSS 31.4 GB. First run 2641.8 s because of a one-time 6.2 GB artifact download (7.8 GB extracted).
- Proof verified locally with sp1-sdk. Proof bytes 356 = 4-byte selector 0x4388a21c plus Groth16 proof.
- Public values, 192 bytes: bytes32 issuerKeyHash, bytes32 vctHash, uint8 over18, address subject, uint64 expiry, bytes32 nonce.
- vkey 0x00b092add2a7d3fffa027c1178c7b0d77155f3c9e078925928fcfce4b39a4cc9.
- Sepolia SP1VerifierGateway 0x397A5f7f3dBd538f23DE225B51f532c34448dA9B routes selector 0x4388a21c to 0xb69f2584CBcFf99a58C4e7002E8b89Af54a6f4e2 (VERSION v6.1.0, read-only eth_call, no transaction sent).
- Caveats: the proof is over a minted vector, because no recorded fixture carries age_equal_or_over.18; x5c chain, status list and freshness are outside the guest (the contract pins issuerKeyHash and compares expiry); no Sepolia deployment or transaction yet.
- On-chain adapter (WP2b, merged 2026-09-07, FACT nachweis-app/contracts/src/sp1/Sp1PidVerifier.sol): a Sepolia fork test against the real SP1VerifierGateway verifies the Groth16 fixture at about 280k gas and rejects tampered public values and a tampered proof (read-only fork, no transaction). This closes the "gas unverified" caveat of the spike; the live transaction is still outstanding.

Verifier facts (FACT, read 2026-09-06 and 2026-09-07): the pre-existing verifier is not a ZK system except verifier-zk (Longfellow, mdoc). The SD-JWT residence model in pid.rs:72-90 uses address.resident_country while the German PID reference uses address.country and similar for SD-JWT; irrelevant to the over-18 statement, relevant if residence is ever requested. Ethereum address binding was not implemented before the event; WP3 builds it.

## What the chain sees, per route

Client-side and R1: a proof, the verification key, and public values without names. It does not see the SD-JWT, the disclosures, the issuer certificate or the KB-JWT. Status, freshness and the issuer's approval are separate conditions; the video says so.

## Sentences for camera

- R1 shipped: "The chain does not trust our server. It verifies a zero-knowledge proof that a PID from the official German test wallet, signed under the sandbox trust anchor and bound to this wallet, was checked and says over 18. Names never enter the proof and never touch the chain. The proof is generated by our verifier, not yet by the phone."
- Client-side shipped: same, ending with "the proof is generated on the investor's device; our server relayed the encrypted response without opening it."
- R4 shipped: "This proof was generated on the phone by an open-source wallet with Google's Longfellow circuits and verified fail-closed by our verifier; the credential is a test credential because the German sandbox wallet cannot prove yet."

## Decision rule

After WP4: if the adapted circuit proves a captured sandbox presentation on the Pixel with all negative tests failing correctly, client-side is the main flow and R1 is the captioned fallback shown once. Otherwise R1 is the main flow. Either way the privacy boundary is captioned on screen. Freeze after that decision.


## Update 2026-09-07 evening: R2 circuit measured on desktop (lead, FACT from circuits/README.md in nachweis-app)

- Baseline d10_swiyu_jwt on the Swiss vector: 92,811 ACIR opcodes, circuit_size 453,007, bb prove 2.1 s wall (16 threads), 9.9 s single thread, 1.08 GB RSS.
- Adapted circuits/pid-sdjwt on our minted German PID vector: 136,027 ACIR, circuit_size 895,109 (2^20), compile 9.8 s, execute 0.6 s, bb prove 5.7 s wall (evm target), 18.5 s single thread, 1.94 GB RSS, verify ok. Public inputs 86 field elements: subject (20 bytes), issuer_key_hash (32), over18, expiry, nonce (32); values equal the SP1 fixture.
- Checks in circuit: issuer ES256 over header.payload, vct, the ["salt","18",true] disclosure digest anchored inside age_equal_or_over._sd, cnf.jwk key, exp minimum, KB-JWT ES256 plus aud, hex nonce and sd_hash. Finding: the ECDSA blackbox rejects high-s signatures; the tool normalises and the circuit checks s or n-s against the original base64url signature.
- Negative tests (test-negative.sh): tampered issuer signature, tampered age disclosure, wrong nonce, tampered KB signature all rejected.
- Not checked in circuit: x5c chain, status list, iat/nbf, freshness, other disclosures.
- Verifier: contracts/src/noir/PidSdJwtUltraHonkVerifier.sol (unmodified bb output, HonkVerifier), forge build ok, a real proof verifies at about 2.80M gas in a throwaway test; runtime 25,176 bytes at optimizer_runs 200 (600 over EIP-170), 24,246 at runs 1; via_ir fails (stack too deep).
- Android estimate (OPINION): about 2x baseline gates and 1.9x single-thread time; scaling the published 18.4 s Galaxy A54 figure gives roughly 35 to 40 s there, Pixel 10 plausibly 15 to 25 s. Risks: about 2 GB peak RSS, SRS of 2^20 points (about 64 MB), eid-privacy zkp-android pins noir-rs v1.0.0-beta.8-3 while our artifact is Noir 1.0.0-beta.21 (bump or recompile).
- Consequence: both ZK routes exist on desktop. R1 (SP1, server-side) is the guaranteed on-chain path; R2 (Noir, client-side) is proven on the Mac and awaits phone packaging. The registry needs a second IProofVerifier adapter for the UltraHonk verifier (WP2c, started 2026-09-07 evening).


## Update 2026-09-07 night: expiry semantics (lead, FACT from the wp9b-expiry merge)

Both proofs commit the issuer credential's exp as the on-chain expiry. The KB-JWT exp (sandbox: iat plus 300 s) is no longer in the statement, because it would have expired the on-chain Decision five minutes after presentation. Compensation: the SP1 host and the bridge check KB-JWT exp and iat against a window (default 600 s) before proving; the verifier-service checks freshness in verifier mode; the registry consumes each nonce once. Consequence: a delayed proof can attest once until the credential expires, never twice. New fixture: issuer exp 1819756800, issuerKeyHash 0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183, subject 0xF99EDdE971F4e9c88715a79CA78963284A2955dC. Measurements: SP1 434,181 cycles, compressed 50.5 s (26.1 GB), Groth16 269.6 s (32.4 GB), gateway verify 225,880 gas on a Sepolia fork; Noir circuit_size 894,846, bb prove 3.5 s, four negative tests reject.


## Update 2026-09-07 night: shared mobile prover core (lead, FACT from the wp12-ios branch report)

prover-mobile-core/ (branch wp12-ios, to be adopted by wp5-android): one Rust crate with mopro-ffi 0.3.7 uniffi scaffolding and iOS plus Android binaries; input derivation is a Rust port of gen-prover.ts, parity-tested against the committed Prover.toml; proving uses the acvm and nargo crates at Noir v1.0.0-beta.21 plus barretenberg-rs 5.0.0-nightly.20260324 (prebuilt static libraries for arm64-android exist). noir-rs was skipped: no branch matches beta.21. On the Mac the core's proof (keccak transcript) verifies with bb verify -t evm against the desktop VK, public inputs byte-identical, 5.1 s total, 2.13 GB peak RSS. Correction to the toolchain note: Xcode 26.6 had no iOS platform installed ("iOS 26.5 is not installed"); the 8.5 GB platform download is running, so simulator measurements follow. Android: the Barretenberg Android library needs NDK 29 (LLVM 20 libc++); NDK 27 fails with missing symbols; NDK 29 download running.
