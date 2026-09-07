# prover-sp1

SP1 6.1.0 guest and host for the Nachweis statement: an SD-JWT PID presentation (German EUDI sandbox, `urn:eudi:pid:de:1`) is valid, its holder proved key binding for one Ethereum address, and the credential asserts `age_equal_or_over.18`. The proof goes on chain through `Sp1PidVerifier` (`/contracts`); the bridge (`/service`) runs the same statement natively before proving.

## Layout

- `lib/`: shared verification, runs natively (bridge, host) and in the guest
- `program/`: SP1 guest, reads `GuestInput`, calls `prove_statement`, commits the ABI-encoded public values
- `script/`: host binary `nachweis-pid` (`--check-fixture`, `--synth`, `--execute`, `--prove`, `--verify`) and `vkey`
- `fixtures/`: synthetic vector, `input.json`, proofs, logs, calldata (the SP1 vector); `realistic-input.json` and `realistic-over18.sdjwt`, the 23-claim vector the Noir circuit and its fixtures use (minted by `companion mint-fixture`, see `circuits/pid-sdjwt/REALISM.md`; the SP1 statement is unchanged, so the SP1 proof stays on the older, shorter vector)

## What the statement proves

All checks are asserts in the guest; any failure aborts the proof.

1. Issuer JWT: ES256 signature verifies under the private-input issuer key; `vct` matches; `_sd_alg` is sha-256.
2. Every presented disclosure hashes into a signed `_sd` array (top level or nested through an accepted disclosure).
3. `over18` is true iff the `age_equal_or_over` object carries a disclosure `"18": true` anchored in its `_sd`.
4. Holder key from `cnf.jwk` (P-256); KB-JWT ES256 signature verifies, `typ kb+jwt`.
5. KB-JWT `aud` matches; `sd_hash` equals `base64url(sha256("issuerJwt~d1~...~dN~"))`.
6. KB-JWT `nonce` equals lowercase hex of `sha256(subject || challenge)`: the presentation is bound to the address.
7. `expiry` is the issuer credential `exp` (0 if absent). The guest has no clock; the contract compares it with `block.timestamp`.

Not in the guest: x5c chain to a trust anchor (the contract pins `issuerKeyHash`), status list, KB-JWT freshness (checked by the host and the bridge). Full text in `NOTES.md`, "Statement proved".

## Public values

ABI encoded, 192 bytes, decoded by `Sp1PidVerifier` as

    struct PublicValues {
        bytes32 issuerKeyHash;  // sha256(issuer P-256 key, SEC1 uncompressed, 65 bytes)
        bytes32 vctHash;        // sha256("urn:eudi:pid:de:1")
        uint8   over18;         // 1 or 0
        address subject;        // bound Ethereum address
        uint64  expiry;         // unix seconds, issuer credential exp, 0 if none
        bytes32 nonce;          // sha256(subject || challenge)
    }

## Commands

    export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$PATH"
    sp1up -v v6.1.0 && cargo prove --version
    cd prover-sp1
    (cd program && cargo prove build)
    cargo build --release -p nachweis-pid-script
    B=target/release/nachweis-pid
    SP1_PROVER=cpu RUST_LOG=info $B --execute --input fixtures/input.json --allow-stale-kb
    SP1_PROVER=cpu RUST_LOG=info $B --prove --system compressed --input fixtures/input.json --allow-stale-kb
    SP1_PROVER=cpu RUST_LOG=info $B --prove --system groth16 --input fixtures/input.json --allow-stale-kb
    $B --verify fixtures/proof-groth16.bin
    cargo run --release --bin vkey        # programVKey for Sp1PidVerifier, also in fixtures/vkey.txt

`--check-fixture <sdjwt>` runs the statement natively on a presentation; `--synth --out fixtures --header-from <sdjwt> [--issuer-exp <unix>]` mints the synthetic vector. The first Groth16 proof downloads the SP1 circuit artifacts (about 6 GB) to `~/.sp1/circuits/groth16/v6.1.0`.

## Fixture caveat

The synthetic fixture in `fixtures/` (`synthetic-over18.sdjwt`, `input.json`) carries ERICA's `x5c` chain in the issuer JWT header but is signed with a fresh issuer key (`issuer_key_sec1_hex` in `input.json`), so the bridge (`service`) must be given that key via `ISSUER_KEY_SEC1_HEX` for the fixture, while a real ERICA credential needs no override because the key is taken from the `x5c` leaf certificate. Its KB-JWT expired five minutes after minting (exp = iat + 300, as the sandbox wallet does): the host needs `--allow-stale-kb` for `--execute`/`--prove` and the bridge `KB_JWT_WINDOW_SECS=0`. The committed `expiry` is the issuer credential `exp` (1819756800, 2027-09-01); see `NOTES.md`, "Expiry decision".

## Measurements

Cycle counts, proving times, memory and the vkey are in `NOTES.md`, "Measured results".
