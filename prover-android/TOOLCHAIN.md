# Toolchain decision: Noir 1.0.0-beta.21 + bb 5.0.0-nightly.20260324 on Android

## The problem

The reference app `eid-privacy/zkp-android` pins
`noir_rs = { git = "https://github.com/zkmopro/noir-rs", branch = "v1.0.0-beta.8-3" }`
(Noir 1.0.0-beta.8, bb `1.0.0-nightly.20250723` built from source inside the
`bb` crate). Our circuit `circuits/pid-sdjwt/target/pid_sdjwt.json` is
compiled with nargo 1.0.0-beta.21 and the desktop VK, proof fixtures and the
Solidity verifier `contracts/src/noir/PidSdJwtUltraHonkVerifier.sol` come from
bb 5.0.0-nightly.20260324 (`bbup -nv 1.0.0-beta.21`). A proof made on the
phone must verify with that VK, so the phone needs the same proving system
version, not just "a" bb.

## Option (a), chosen: build on Noir beta.21 crates and barretenberg-rs, no noir-rs

State of zkmopro/noir-rs at 2026-09-07 (`git ls-remote`): branches
`v1.0.0-beta.3-2`, `v1.0.0-beta.7-4`, `v1.0.0-beta.8-3`, `upgrade-noir-beta19`,
`main`; tags `v1.0.0-beta.3`, `v1.0.0-beta.8`, `v1.0.0-beta.19`. Nothing for
beta.21. `main` (= beta.19) no longer builds bb itself; it depends on the
crates.io crate `barretenberg-rs = "=4.2.0-aztecnr-rc.2"` (features `ffi`),
which downloads a prebuilt `libbb-external.a` per target from
`https://github.com/AztecProtocol/barretenberg/releases/download/v<version>/barretenberg-static-<arch>.tar.gz`
(arch: arm64-android, x86_64-android, arm64-darwin, ...).

The same crate exists as `barretenberg-rs = "=5.0.0-nightly.20260324"`
(published 2026-03-24, 516 versions on crates.io) and the matching GitHub
release carries `barretenberg-static-arm64-android.tar.gz` and
`barretenberg-static-x86_64-android.tar.gz` (checked with `curl -I`, HTTP 200).
So instead of forking noir-rs, `prover-android/core` is a small crate that
does what noir-rs `main` does, pinned to our versions:

| piece | version | why |
| --- | --- | --- |
| `acvm`, `bn254_blackbox_solver`, `nargo`, `noirc_abi` | git `noir-lang/noir` tag `v1.0.0-beta.21` | the compiler that produced the artifact; ACIR and witness serialisation formats match what nargo writes and bb reads |
| `barretenberg-rs` | `=5.0.0-nightly.20260324`, `default-features = false`, `features = ["ffi"]` | the bb the desktop VK / Solidity verifier come from; FFI (static) backend, msgpack API `circuit_prove`, `circuit_verify`, `srs_init_srs` |
| `uniffi` | 0.29 (proc macros, library mode bindgen) | Kotlin bindings without mopro-ffi (mopro-ffi 0.3.x pins its own noir) |
| Rust | 1.92.0 (noir beta.21 asks for 1.89) | |
| NDK | 27.0.12077973, API 30 (`cargo ndk -t arm64-v8a -p 30`) | NDK 29 in the SDK directory is an unfinished download |

What the core does (`core/src/lib.rs`):

1. `Format::Toml.parse(prover_toml, &abi)` + `abi.encode` (noirc_abi) exactly
   as `nargo execute` does with `Prover.toml`;
2. `nargo::ops::execute_program` with `Bn254BlackBoxSolver` (the P-256 ECDSA
   and SHA-256 blackboxes), `WitnessStack::serialize` then gunzip;
3. bytecode = base64 decode + gunzip of the artifact's `bytecode` field,
   passed raw (no re-serialisation);
4. `circuit_prove(CircuitInput{bytecode, verification_key: <desktop vk>}, witness, ProofSystemSettings{oracle_hash_type: "keccak", disable_zk: false, ipa_accumulation: false, optimized_solidity_verifier: false})`,
   which is `bb prove -t evm` (keccak transcript, ZK on; `circuits/README.md`);
5. SRS: `srs_init_srs(g1, 2^20 + 1 points, g2)` from files bundled in the app
   (`~/.bb-crs/bn254_g1.dat` slice, 64 MB; the circuit is 2^20 gates).

## Outcome

- Host (Apple M3 Max, `cargo test --release` in `core/`): witness 0.28 s,
  proof 3.5 s (5.9 s cold), peak RSS 2.1 GB, proof 10,304 B, 86 public inputs.
  The proof file verifies with the desktop binary:
  `bb verify -k circuits/pid-sdjwt/out/adapted/vk -p core/target/host-proof/proof -i core/target/host-proof/public_inputs -t evm`
  -> "Proof verified successfully", and `public_inputs` is byte-identical to
  the desktop `bb prove` output. So the crate pair reproduces the desktop
  proving system; the VK hash `c0d55f4d...5018` in
  `contracts/test/fixtures/noir/vk_hash.bin` is the one the app ships.
- Android arm64: `cargo ndk -t arm64-v8a -p 30 build --release` links
  `libbb-external.a` (arm64-android) without changes; the resulting
  `libnachweis_prover.so` is 16 MB and needs `libc++_shared.so` from the NDK
  next to it (barretenberg-rs emits `rustc-link-lib=dylib=c++`). The emulator
  result is in `README.md`.

Build errors hit on the way: one, `to_be_bytes` on `FieldElement` needs
`use acvm::AcirField` (trait method). No patching of any dependency.

## Option (b), not taken: recompile the circuit for beta.8

Not attempted because (a) worked without a fork. It would also have meant a
different VK, a regenerated Solidity verifier and a second circuit build in
the repo. For the record, the blockers it would have met: `noir_base64
v0.5.0` and `sha256 v0.3.0` are beta.19+ era libraries (the upstream
`zkp-pocs` pins the same beta.21 pair through devbox), and the reference
app's `bb` crate builds Barretenberg from source (`cc`), which is slow on a
laptop and has no prebuilt Android binary.

## Things to know

- `barretenberg-rs` downloads the static library at build time with `curl`;
  offline builds need `BB_LIB_DIR` pointing at an unpacked
  `libbb-external.a`.
- bb's low-memory mode (`BB_SLOW_LOW_MEMORY`, file-backed polynomials) is
  exposed as a toggle (`prove_pid_sdjwt(..., low_memory = true)`); it is off
  by default.
- The Rust core never computes the VK on the phone (`compute_vk` exists for a
  one-off check; it needs about 1.4 GB on the desktop). The bundled
  `pid_sdjwt_evm.vk` must be regenerated with every circuit change, together
  with the Solidity verifier.
