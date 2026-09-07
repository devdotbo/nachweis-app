# prover-mobile-core

Shared Rust core of the Nachweis on-phone provers (iOS `prover-ios/`, Android
`prover-android/`). One crate, built with Mopro (mopro-ffi) into a Swift
package (xcframework) and Kotlin bindings (JNI). Toolchain choice and
versions: `TOOLCHAIN.md`.

Responsibilities:

1. Input derivation from an SD-JWT presentation (`src/inputs.rs`): the port
   of `circuits/tools/gen-prover.ts` at WP13 (offsets, three age shapes,
   disclosure digests, sd_hash, nonce check, low-s normalisation, bounded
   vectors, issuer key from the x5c leaf). Tested for parity with the
   committed `circuits/pid-sdjwt/Prover.toml` of the realistic vector
   (`tests/gen_prover_parity.rs`).
2. Witness execution with acvm at the circuit's Noir version and UltraHonk
   proving/verification with barretenberg-rs at the desktop bb version
   (`src/noir.rs`), keccak transcript with ZK (`bb prove -t evm`).
3. UniFFI bindings (`src/lib.rs`, `#[uniffi::export]`) for Swift and Kotlin.

## API (UniFFI, same names in Swift camelCase and Kotlin)

```
derive_prover_inputs(presentation, bound_address, challenge_hex) -> String   // Prover.toml text, x5c issuer key, pinned aud
derive_inputs(circuit_json_path, presentation, issuer_key_sec1_hex, bound_address_hex, challenge_hex, expected_aud)
    -> DerivedInputs { prover_toml, witness: Vec<String>, issuer_key_hash_hex, over18, expiry,
                       nonce_hex, subject_hex, issuer_key_sec1_hex, public_inputs_hex: Vec<String> }
    // issuer_key_sec1_hex "" = from the x5c leaf of the issuer JWT header (as bridge and companion do)
    // expected_aud "" = the circuit's pinned aud (PINNED_AUD, the registered client_id x509_hash:VE3q...)
circuit_dyadic_size(circuit_json_path) -> u32                   // 1_048_576 for pid-sdjwt
setup_srs(circuit_json_path, srs_path) -> u32                   // points loaded (dyadic + 1)
compute_verification_key(circuit_json_path, srs_path, on_chain) -> Vec<u8>   // heavy; apps bundle the desktop VK
prove(circuit_json_path, srs_path, vk, witness, on_chain, low_memory)
    -> ProofResult { proof: Vec<u8>, public_inputs: Vec<Vec<u8>>, execute_ms, prove_ms, peak_rss_bytes }
verify(proof, public_inputs, vk, on_chain) -> bool
```

Errors: `CoreError::Input(msg)` (presentation does not fit the circuit) and
`CoreError::Prover(msg)` (acvm or bb).

- `circuit_json_path`: the nargo artifact `pid_sdjwt.json` (2.2 MB), bundled.
- `srs_path`: bb-format `g1.dat`, first 2^20 + 1 points (64 MB), bundled or
  downloaded on first run (`prover-ios/scripts/fetch-srs.sh` shows both).
- `vk`: `circuits/pid-sdjwt/out/adapted/vk` from `bb write_vk -t evm`
  (1,888 bytes), bundled; `on_chain = true` selects the keccak transcript.
- `witness`: `DerivedInputs.witness`, 6,787 decimal strings for the WP13
  circuit. The order and the BoundedVec capacities are read from the
  artifact's ABI (`Bounds::from_abi`, `CircuitInputs::to_flat_witness(abi)`),
  so a bound change is a swap of `pid_sdjwt.json` and the VK; a parameter the
  core does not derive fails loudly (see TOOLCHAIN.md, Circuit revisions).
- `ProofResult.proof` is byte for byte what `bb prove` writes to `proof`
  (10,304 bytes); `public_inputs` concatenated is bb's `public_inputs`
  (86 x 32 bytes: subject 20, issuer_key_hash 32, over18, expiry, nonce 32).
  Submit as `POST /sessions/:id/noir-proof {proof_hex, public_inputs_hex[]}`.

## Build

```
cargo test --no-default-features --features uniffi     # input derivation parity, no bb needed
cargo test --release --test prove_desktop -- --nocapture  # desktop proof, then bb verify (see file header)
CONFIGURATION=release IOS_ARCHS=aarch64-apple-ios-sim,aarch64-apple-ios IPHONEOS_DEPLOYMENT_TARGET=17.0 cargo run --release --bin ios
    # -> MoproiOSBindings/{mopro.swift, MoproBindings.xcframework}
CONFIGURATION=release ANDROID_ARCHS=arm64-v8a ANDROID_NDK=... cargo run --release --bin android
    # -> MoproAndroidBindings/  (not run here)
```

The first build per target downloads the bb static library (about 150 MB).

## Licences

- This crate: MIT (repository licence).
- noir-lang/noir crates (acvm, nargo): MIT or Apache-2.0.
- barretenberg (static library) and barretenberg-rs: Apache-2.0.
- mopro-ffi, uniffi: MIT / Apache-2.0 / MPL-2.0 (uniffi).
- The circuit derives from eid-privacy/zkp-pocs (MPL-2.0, see `circuits/pid-sdjwt/SOURCE.md`).
