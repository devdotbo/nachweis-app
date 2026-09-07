# prover-mobile-core: the on-phone prover for pid-sdjwt (Android and iOS)

Rust crate with uniffi bindings. It turns a `Prover.toml` text (the circuit
inputs, derived by the app from the SD-JWT presentation exactly like
`circuits/tools/gen-prover.ts`) into an UltraHonk proof that verifies with
the desktop VK and the Solidity verifier. One code path for both phones;
toolchain reasoning in `../prover-android/TOOLCHAIN.md`.

Versions: Noir crates `v1.0.0-beta.21` (git tag), `barretenberg-rs
=5.0.0-nightly.20260324` (prebuilt static Barretenberg for arm64-android,
x86_64-android, arm64-ios, arm64-ios-sim, arm64/amd64 darwin, linux),
uniffi 0.29.

## Public API (uniffi, all functions synchronous and blocking)

```
init_srs(g1_path: String, g2_path: String) -> Result<u32, ProverError>
    Loads the bn254 SRS into Barretenberg once per process (idempotent).
    g1: raw bn254_g1.dat slice, 64 bytes per point, >= 2^20 + 1 points for
    this circuit (67,108,928 bytes); g2: bn254_g2.dat (128 bytes). Both as
    served by https://crs.aztec.network/{g1,g2}.dat and cached by bb in
    ~/.bb-crs. Returns the number of points.

prove_pid_sdjwt(circuit_json_path: String, vk_path: String, prover_toml: String,
                low_memory: bool) -> Result<ProveResult, ProverError>
    Parses prover_toml against the ABI of the compiled artifact, solves the
    witness, proves UltraHonk with keccak transcript and ZK (= bb prove -t evm)
    using the supplied VK (bb write_vk -t evm output). Requires init_srs.

ProveResult {
    proof: Vec<u8>,              flat proof, 32 bytes per field (10,304 B here)
    public_inputs: Vec<Vec<u8>>, 86 x 32 bytes: subject[20], issuer_key_hash[32],
                                 over18, expiry (u64), nonce[32]; one byte per
                                 field for the byte arrays, big-endian
    vk_hash: Vec<u8>,            empty when the VK was supplied (bb behaviour)
    witness_ms: u64, prove_ms: u64,
    peak_rss_bytes: u64          VmHWM on Android/Linux, ru_maxrss on macOS/iOS-like
}

execute_pid_sdjwt(circuit_json_path: String, prover_toml: String)
    -> Result<Vec<Vec<u8>>, ProverError>
    Witness only; returns the 66 return values (issuer_key_hash[32], over18,
    expiry, nonce[32]) as 32-byte fields. Fast check that the inputs solve.

verify_pid_sdjwt(vk_path: String, proof: Vec<u8>, public_inputs: Vec<Vec<u8>>)
    -> Result<bool, ProverError>
    Same settings as bb verify -t evm.

compute_vk(circuit_json_path: String) -> Result<Vec<u8>, ProverError>
    keccak/evm VK of the artifact (slow, about 1.4 GB); for a one-off check
    that a bb build reproduces the desktop VK.

circuit_stats(circuit_json_path: String) -> Result<CircuitStats, ProverError>
    CircuitStats { num_gates, num_gates_dyadic, num_acir_opcodes }

peak_rss_bytes() -> u64
prover_version() -> String

ProverError::Failed { msg: String }   (thrown as an exception in Kotlin/Swift)
```

The artifact is `circuits/pid-sdjwt/target/pid_sdjwt.json` (nargo compile);
its ABI drives the TOML parsing, so a revised circuit with other bounds needs
no change here as long as `Prover.toml` matches the new ABI. The app derives
the byte-array sizes from that ABI (`abi.parameters[*].type`).

## Build

Host (macOS) and the fixture test (proves the committed vector, writes
`target/host-proof/{proof,public_inputs}`):

    cargo test --release -- --nocapture
    bb verify -k ../circuits/pid-sdjwt/out/adapted/vk -p target/host-proof/proof -i target/host-proof/public_inputs -t evm

Android (arm64; `rustup target add aarch64-linux-android`, `cargo install cargo-ndk`,
NDK 29; the app needs NDK 29's `libc++_shared.so` next to the cdylib):

    export ANDROID_NDK_HOME=$HOME/Library/Android/sdk/ndk/29.0.13599879
    cargo ndk -t arm64-v8a -p 30 -o ../prover-android/app/src/main/jniLibs build --release
    cargo run --release --bin uniffi-bindgen -- generate \
        --library target/release/libnachweis_prover.dylib --language kotlin \
        --out-dir ../prover-android/app/src/main/java --no-format
    # or simply: ../prover-android/scripts/build-rust.sh

iOS (`rustup target add aarch64-apple-ios aarch64-apple-ios-sim`; Xcode):

    cargo build --release --target aarch64-apple-ios          # device: target/aarch64-apple-ios/release/libnachweis_prover.a
    cargo build --release --target aarch64-apple-ios-sim      # simulator
    cargo run --release --bin uniffi-bindgen -- generate \
        --library target/release/libnachweis_prover.dylib --language swift \
        --out-dir target/swift
    # target/swift: NachweisProver.swift, NachweisProverFFI.h, NachweisProverFFI.modulemap
    xcodebuild -create-xcframework \
        -library target/aarch64-apple-ios/release/libnachweis_prover.a -headers target/swift/headers \
        -library target/aarch64-apple-ios-sim/release/libnachweis_prover.a -headers target/swift/headers \
        -output target/NachweisProver.xcframework

For the xcframework put `NachweisProverFFI.h` and a `module.modulemap`
(contents of `NachweisProverFFI.modulemap`) into `target/swift/headers`.
The static library links `libc++` (`-lc++` is implied by the barretenberg-rs
build script); iOS ships libc++ with the OS, so nothing to bundle there.
Barretenberg's `barretenberg-static-arm64-ios.tar.gz` is downloaded by the
crate's build script on first build of each target.

Mopro is not used: `mopro-ffi` 0.3.x pins its own noir-rs (beta.8) and
provides nothing the crate needs beyond uniffi.

## Runtime notes

- Memory: 2.1 GB peak RSS on the host for the 2^20-gate circuit; expect
  about the same on the phone. `low_memory = true` switches Barretenberg to
  file-backed polynomials (`BB_SLOW_LOW_MEMORY`), roughly half the RAM for
  about twice the time.
- Threads: Barretenberg uses all cores it sees.
- The SRS must be a file (read into memory once, 64 MB); keep it in the app
  bundle uncompressed.
