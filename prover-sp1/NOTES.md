# Nachweis SP1 spike (R1 feasibility), 2026-09-07

Goal: prove the SD-JWT PID verification (issuer ES256, disclosure digests, KB-JWT ES256,
sd_hash, nonce bound to an Ethereum address) inside the SP1 zkVM and wrap it as Groth16
for the SP1VerifierGateway on Sepolia (0x397A5f7f3dBd538f23DE225B51f532c34448dA9B,
supports V5.x.y and V6.1.0).

## Toolchain
- sp1up -v v6.1.0  ->  cargo-prove sp1 (d454975 2026-04-11)
- sp1-sdk, sp1-zkvm, sp1-build, sp1-lib, sp1-primitives all pinned "=6.1.0"
  (semver ^6 otherwise pulls 6.7.0 and the guest link fails with undefined `syscall_halt`;
  the host fails in sp1-recursion-machine against sp1-hypercube 6.7.0).
- Patched crates ([patch.crates-io] in nachweis-pid/Cargo.toml):
  p256 tag patch-p256-13.2-sp1-6.0.0, sha2 tag patch-sha2-0.10.9-sp1-6.0.0.
- serde_json (alloc), base64 0.22, alloy-sol-types 1.x compile unchanged in the guest.
- Host: rustc 1.92, Go 1.27 (for sp1-sdk feature native-gnark), Docker Desktop 29.6.2.

## Layout
- nachweis-pid/lib      shared verification (runs natively and in the guest)
- nachweis-pid/program  SP1 guest: reads GuestInput, calls prove_statement, commits ABI bytes
- nachweis-pid/script   host: --check-fixture, --synth, --execute, --prove, --verify
- nachweis-pid/fixtures synthetic vector, input.json, proofs, logs, calldata

## Statement proved (guest, all checks are asserts, any failure aborts the proof)
1. issuer JWT: alg ES256, signature over `header.payload` verifies under the private
   input issuer key (SEC1, 65 bytes); vct == expected; _sd_alg sha-256
2. every presented disclosure hashes (base64url(sha256(disclosure))) into a signed `_sd`
   array, top level or nested through an accepted disclosure (fixed point)
3. over18 := the `age_equal_or_over` object (plain in the payload, or itself disclosed)
   has a disclosure named "18" with value true anchored in its `_sd`; else false
4. holder key from cnf.jwk (P-256); KB-JWT alg ES256, typ kb+jwt, signature verifies
5. KB-JWT aud == expected; sd_hash == base64url(sha256("issuerJwt~d1~...~dN~"))
6. KB-JWT nonce == lowercase hex, no 0x prefix (64 chars), of sha256(subject || challenge)
   Byte layout of the preimage: subject = 20-byte Ethereum address, then the challenge
   bytes exactly as given by the server (32 bytes recommended; the guest input carries
   a [u8; 32]). sha256 was chosen over keccak so the hash stays on the SP1 sha2
   precompile; the hex encoding matches the verifier relay branch and the front end.
7. expiry := min(issuer exp, KB-JWT exp), 0 if neither present. No wall clock in the
   guest; the contract compares expiry with block.timestamp.
Not in the guest (host or contract side): x5c-to-trust-anchor chain (the contract pins
issuerKeyHash instead), status list, freshness window.

## Public values (alloy sol!, ABI encoded, 192 bytes = 6 words)
Solidity binding for the contracts team (abi.decode(publicValues, (PublicValues))):

    struct PublicValues {
        bytes32 issuerKeyHash;  // word 0: sha256(issuer P-256 key, SEC1 uncompressed, 65 bytes)
        bytes32 vctHash;        // word 1: sha256("urn:eudi:pid:de:1")
        uint8   over18;         // word 2: 1 or 0
        address subject;        // word 3: bound Ethereum address
        uint64  expiry;         // word 4: unix seconds, min(issuer exp, KB exp), 0 if none
        bytes32 nonce;          // word 5: sha256(subject || challenge)
    }

Contract call shape: ISP1Verifier(0x397A5f7f3dBd538f23DE225B51f532c34448dA9B)
.verifyProof(PROGRAM_VKEY, publicValues, proofBytes), with PROGRAM_VKEY from
`cargo run --release --bin vkey` (fixtures/vkey.txt) and proofBytes = proof.bytes()
(4-byte verifier selector + Groth16 proof), see fixtures/calldata-groth16.json.

## Fixtures
- verifier/fixtures/oracle/erica-vp-VALID.sdjwt discloses only given_name and family_name
  and its nonce is a UUID, so it cannot satisfy checks 3 and 6. The shared lib verifies it
  natively (over18=false), which cross-checks the parser, digests, sd_hash and both
  signatures against a real capture.
- fixtures/synthetic-over18.sdjwt: minted by `--synth --header-from <erica fixture>`:
  ERICA issuer header copied verbatim (x5c included, for realistic size: issuer JWT 2929
  chars, presentation 3482 chars), fresh issuer and holder P-256 keys, top level _sd
  [given_name, family_name, birthdate], nested age_equal_or_over._sd for 12/14/16/18/21/65,
  presented disclosures given_name, family_name, 18; KB-JWT nonce = hex(sha256(address || challenge))
  for a random address and challenge. fixtures/v1-b64nonce/ keeps the earlier vector whose nonce
  was base64url encoded (the first Groth16 run started on it).

## Reproduce
    export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$PATH:/opt/homebrew/bin"
    sp1up -v v6.1.0 && cargo prove --version
    cd /Users/bioharz/git/nachweis-sp1-spike/nachweis-pid
    (cd program && cargo prove build)
    cargo build --release -p nachweis-pid-script
    B=target/release/nachweis-pid
    $B --check-fixture /Users/bioharz/git/eudi-wallet-hackathon/verifier/fixtures/oracle/erica-vp-VALID.sdjwt
    $B --synth --out fixtures --header-from /Users/bioharz/git/eudi-wallet-hackathon/verifier/fixtures/oracle/erica-vp-VALID.sdjwt
    SP1_PROVER=cpu RUST_LOG=info $B --execute --input fixtures/input.json
    time SP1_PROVER=cpu RUST_LOG=info $B --prove --system compressed --input fixtures/input.json
    /usr/bin/time -l env SP1_PROVER=cpu RUST_LOG=info $B --prove --system groth16 --input fixtures/input.json
    $B --verify fixtures/proof-groth16.bin
    cargo run --release --bin vkey

## Measured results (this Mac, M3 Max 16 cores, 128 GB, 2026-09-07)
- execute: 430,143 cycles, 1,750 syscalls (final hex-nonce vector; 424,513 on the base64 one)
- compressed, SP1_PROVER=cpu: 59.0 s prove, 70.2 s real incl. setup, 574 s user, peak RSS 28.3 GB
- groth16 native (sp1-sdk native-gnark, Go 1.27, arm64, no Docker): 263.8 s prove, 274.6 s real,
  peak RSS 31.4 GB; stages core ~55 s, shrink 4 s, wrap ~145 s, gnark prover 17.4 s
  (15,972,262 constraints, bn254). First run took 2641.8 s because it downloaded the 6.2 GB
  v6.1.0 groth16 artifacts to ~/.sp1/circuits/groth16/v6.1.0 (7.8 GB extracted), one time.
- Docker (amd64 sp1-gnark:v6.1.0) was pulled but not needed; not exercised.
- vkey 0x00b092add2a7d3fffa027c1178c7b0d77155f3c9e078925928fcfce4b39a4cc9 (fixtures/vkey.txt)
- proof bytes 356 = 4-byte selector 0x4388a21c + Groth16 proof; publicValues 192 bytes
  (fixtures/calldata-groth16.json). Verified locally with sp1-sdk (`--verify`).
- Sepolia gateway 0x397A5f7f3dBd538f23DE225B51f532c34448dA9B routes(0x4388a21c) =
  0xb69f2584CBcFf99a58C4e7002E8b89Af54a6f4e2, frozen=false; that verifier reports
  VERSION() "v6.1.0" and VERIFIER_HASH() 0x4388a21c687f...ee696 (read-only eth_call via cast,
  no transaction sent). No deployment done.
