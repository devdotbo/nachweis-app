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
- Patched crates ([patch.crates-io] in prover-sp1/Cargo.toml):
  p256 tag patch-p256-13.2-sp1-6.0.0, sha2 tag patch-sha2-0.10.9-sp1-6.0.0.
- serde_json (alloc), base64 0.22, alloy-sol-types 1.x compile unchanged in the guest.
- Host: rustc 1.92, Go 1.27 (for sp1-sdk feature native-gnark), Docker Desktop 29.6.2.

## Layout
- prover-sp1/lib      shared verification (runs natively and in the guest)
- prover-sp1/program  SP1 guest: reads GuestInput, calls prove_statement, commits ABI bytes
- prover-sp1/script   host: --check-fixture, --synth, --execute, --prove, --verify
- prover-sp1/fixtures synthetic vector, input.json, proofs, logs, calldata

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
7. expiry := issuer credential exp, 0 if absent. No wall clock in the guest; the contract
   compares expiry with block.timestamp. The KB-JWT exp and iat are parsed but not committed.
Not in the guest (host or contract side): x5c-to-trust-anchor chain (the contract pins
issuerKeyHash instead), status list, KB-JWT freshness (below).

## Expiry decision (2026-09-07, wp9b)
The statement used to commit min(issuer exp, KB-JWT exp). Sandbox and ERICA wallets mint
KB-JWTs with exp = iat + 300 (the recorded ERICA fixture: iat 1780435065, exp 1780435365,
issuer exp 2095795065), so the on-chain Decision expired five minutes after the presentation
and Sp1PidVerifier reverted Expired almost immediately. Now both proofs (this guest and the
Noir circuit) commit the issuer exp only: the credential's lifetime is what the chain should
enforce. KB-JWT freshness is a property of the presentation and is enforced off chain by the
host that sees the presentation: `nachweis_pid_hostlib::check_kb_freshness(&facts, now, window)`
requires iat in [now - window, now + window] and, when the KB-JWT carries one, exp in
(now, now + window]; exp is optional since the official German test wallet signs aud, iat,
nonce and sd_hash only (G0 2026-09-08). The older `nachweis_pid_lib::check_kb_freshness`
(exp required) stays in lib untouched because any edit to lib changes the guest ELF and vkey. The bridge (service) runs it after the native statement run with KB_JWT_WINDOW_SECS
(default 600) and rejects with 422 before proving; this host runs it before --execute/--prove
(--kb-window, --allow-stale-kb for stored fixtures). The guest has no clock, so the KB-JWT
exp cannot be enforced inside the proof without a public "now" input, which would have to be
bound by the contract to block.timestamp anyway. What is lost: a proof generated from a
presentation is no longer self-limiting in time; a relay that verified freshness and then
submits the proof later is trusted for that step (the registry consumes the nonce once, so
the same proof cannot be replayed). The verifier-service's own freshness check stays in front
of the bridge in verifier mode.

## Public values (alloy sol!, ABI encoded, 192 bytes = 6 words)
Solidity binding for the contracts team (abi.decode(publicValues, (PublicValues))):

    struct PublicValues {
        bytes32 issuerKeyHash;  // word 0: sha256(issuer P-256 key, SEC1 uncompressed, 65 bytes)
        bytes32 vctHash;        // word 1: sha256("urn:eudi:pid:de:1")
        uint8   over18;         // word 2: 1 or 0
        address subject;        // word 3: bound Ethereum address
        uint64  expiry;         // word 4: unix seconds, issuer credential exp, 0 if none
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
- fixtures/synthetic-over18.sdjwt: minted by `--synth --header-from <erica fixture>`
  (re-minted 2026-09-07 for the expiry decision): ERICA issuer header copied verbatim (x5c
  included, for realistic size: issuer JWT 2929 chars, presentation 3510 chars), fresh issuer
  and holder P-256 keys, issuer iat = mint time, issuer exp = --issuer-exp (default 1819756800,
  2027-09-01T00:00:00Z, so tests and demos run at real time), top level _sd [given_name,
  family_name, birthdate], nested age_equal_or_over._sd for 12/14/16/18/21/65, presented
  disclosures given_name, family_name, 18; KB-JWT iat = mint time, exp = iat + 300 (as the
  sandbox wallet does, so the stored fixture's KB-JWT is stale: use --allow-stale-kb here and
  KB_JWT_WINDOW_SECS=0 in the bridge), nonce = hex(sha256(address || challenge)) for a random
  address and challenge. Fixture facts: issuerKeyHash
  0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183, subject
  0xF99EDdE971F4e9c88715a79CA78963284A2955dC, expiry 1819756800, nonce
  0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762.

## Reproduce
    export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$PATH:/opt/homebrew/bin"
    sp1up -v v6.1.0 && cargo prove --version
    cd prover-sp1                      # this directory, in the nachweis repository
    (cd program && cargo prove build)
    cargo build --release -p nachweis-pid-script
    B=target/release/nachweis-pid
    $B --check-fixture <klartext-verifier checkout>/fixtures/oracle/erica-vp-VALID.sdjwt
    $B --synth --out fixtures --header-from <klartext-verifier checkout>/fixtures/oracle/erica-vp-VALID.sdjwt   # [--issuer-exp <unix>]
    SP1_PROVER=cpu RUST_LOG=info $B --execute --input fixtures/input.json --allow-stale-kb
    time SP1_PROVER=cpu RUST_LOG=info $B --prove --system compressed --input fixtures/input.json --allow-stale-kb
    /usr/bin/time -l env SP1_PROVER=cpu RUST_LOG=info $B --prove --system groth16 --input fixtures/input.json --allow-stale-kb
    $B --verify fixtures/proof-groth16.bin
    cargo run --release --bin vkey

## Measured results (this Mac, M3 Max 16 cores, 128 GB, 2026-09-07, issuer-exp statement)
- execute: 434,181 cycles, 1,781 syscalls (430,143 / 1,750 with the earlier min-exp statement
  on the previous vector; 424,513 on the base64 one)
- compressed, SP1_PROVER=cpu: 50.5 s prove, 60.3 s real incl. setup, 600 s user, peak RSS 26.1 GB
  (earlier statement: 59.0 s / 70.2 s / 28.3 GB)
- groth16 native (sp1-sdk native-gnark, Go 1.27, arm64, no Docker): 269.6 s prove, 279.5 s real,
  2818 s user, peak RSS 32.4 GB (earlier statement: 263.8 s / 274.6 s / 31.4 GB); stages core
  ~55 s, shrink 4 s, wrap ~145 s, gnark prover ~17 s (15,972,262 constraints, bn254). The first
  ever run took 2641.8 s because it downloaded the 6.2 GB v6.1.0 groth16 artifacts to
  ~/.sp1/circuits/groth16/v6.1.0 (7.8 GB extracted), one time.
- Docker (amd64 sp1-gnark:v6.1.0) was pulled but not needed; not exercised.
- vkey 0x00cc4d3b31d47abf4e069acd7e90fb0efec8aef32da11c78a2eaf01c5552f71f (fixtures/vkey.txt);
  the earlier min-exp statement had 0x00b092add2a7d3fffa027c1178c7b0d77155f3c9e078925928fcfce4b39a4cc9
- proof bytes 356 = 4-byte selector 0x4388a21c + Groth16 proof; publicValues 192 bytes
  (fixtures/calldata-groth16.json). Verified locally with sp1-sdk (`--verify`).
- Sepolia gateway 0x397A5f7f3dBd538f23DE225B51f532c34448dA9B routes(0x4388a21c) =
  0xb69f2584CBcFf99a58C4e7002E8b89Af54a6f4e2, frozen=false; that verifier reports
  VERSION() "v6.1.0" and VERIFIER_HASH() 0x4388a21c687f...ee696 (read-only eth_call via cast,
  no transaction sent). No deployment done. Fork test (contracts/test/Sp1PidVerifier.fork.t.sol,
  2026-09-07, new proof): gateway.verifyProof 225,880 gas (routed V6.1.0 verifier 219,171),
  registry.attestWithProof through Sp1PidVerifier 335,633 gas, at the real head without vm.warp.
