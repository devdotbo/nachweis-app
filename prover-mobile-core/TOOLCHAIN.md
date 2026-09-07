# prover-mobile-core: toolchain decision (2026-09-07)

## The problem

The circuit artifact `circuits/pid-sdjwt/target/pid_sdjwt.json` is compiled
with nargo 1.0.0-beta.21 and proved on the desktop with
bb 5.0.0-nightly.20260324 (`bbup -nv 1.0.0-beta.21`). The proof must stay
byte-compatible with `contracts/src/noir/PidSdJwtUltraHonkVerifier.sol`
(`bb write_solidity_verifier` from the desktop VK, keccak transcript, ZK on).

Mopro's Noir adapter is a template around the crate `noir` from
github.com/zkmopro/noir-rs. Checked on 2026-09-07 (FACT, GitHub API and the
raw Cargo.toml files):

| source | Noir | bb (barretenberg-rs) | note |
| --- | --- | --- | --- |
| zkmopro/noir-rs `v1.0.0-beta.8-3` (the eid-privacy Android app) | beta.8 | 1.0.0-nightly.20250723 | cannot read beta.21 ACIR |
| zkmopro/noir-rs `main` = tag `v1.0.0-beta.19` (what `mopro init` writes) | beta.19 | =4.2.0-aztecnr-rc.2 | last push 2026-06-09 |
| zkpassport/noir_rs `v1.0.0-beta.20-1` | beta.20 | =4.2.0-aztecnr-rc.2 | |
| zkpassport/noir_rs `v1.0.0-beta.22-1` | beta.22 | =5.0.0 | different bb than the desktop |
| (none) | beta.21 | 5.0.0-nightly.20260324 | what the artifact and VK need |

No noir-rs branch or tag matches beta.21, and none pins the desktop bb.
Recompiling the circuit with another nargo/bb pair would change the VK and
the Solidity verifier (and beta.19's stdlib is not what the circuit's
dependencies, noir_base64 0.5.0 and sha256 0.3.0, were tested against).

## Decision

Skip the noir-rs crate and depend on its two ingredients directly, at the
exact desktop versions:

- `acvm`, `acvm_blackbox_solver`, `bn254_blackbox_solver`, `nargo` from
  github.com/noir-lang/noir at rev `v1.0.0-beta.21` (witness execution; the
  same code path as `nargo execute`).
- `barretenberg-rs = "=5.0.0-nightly.20260324"` (features `ffi`), the crate
  noir-rs main itself uses since PR #37. Its build.rs downloads the prebuilt
  static library `barretenberg-static-{arm64-darwin,arm64-ios,arm64-ios-sim,
  arm64-android,x86_64-linux,...}.tar.gz` for that tag from
  github.com/AztecProtocol/barretenberg/releases and links `bb-external` plus
  `c++`. Offline builds: set `BB_LIB_DIR`.
- `mopro-ffi 0.3.7` for the UniFFI scaffolding and the iOS/Android build
  entry points (`src/bin/ios.rs`, `src/bin/android.rs`).

`src/noir.rs` is a 150-line re-implementation of noir-rs `execute`,
`witness`, `prove`, `verify` and `srs` with the same function shapes, so
moving back to noir-rs when a beta.21 (or later, after a circuit rebuild)
branch appears is a rename. Differences from noir-rs main:

- SRS: `dyadic_size + 1` points (2^20 + 1 = 1,048,577, 64 MB), read from a
  bb-format `g1.dat`; noir-rs main loads 8 x that. The desktop bb used
  exactly 2^20 + 1 points (`~/.bb-crs/bn254_g1.dat` is 67,108,928 bytes).
- No `slow_low_memory` extern statics (not verified to exist in the 5.0.0
  nightly static library); `BB_SLOW_LOW_MEMORY` is set through the
  environment only.
- The proof is returned split (proof bytes, public inputs) like bb's own
  `proof` and `public_inputs` files, not with noir-rs's 4-byte count prefix.

## Verified on the desktop (M3 Max, 2026-09-07)

`cargo test --release --test prove_desktop`: the core solves the fixture
witness (293 ms), proves with the keccak/ZK settings (3.7 s in bb, 5.1 s
total, 2.13 GB peak RSS), the 86 public inputs are byte-identical to the
desktop `bb prove -t evm` output, and `bb verify -k out/adapted/vk ... -t evm`
accepts the core's proof (10,304 bytes). See `tests/prove_desktop.rs`.

## Versions in one place

- Rust 1.92.0 (cargo 1.92.0), targets aarch64-apple-ios, aarch64-apple-ios-sim, aarch64-apple-darwin
- nargo 1.0.0-beta.21 (noirc 89a0f0fa), bb 5.0.0-nightly.20260324 (desktop)
- acvm / nargo crates: noir-lang/noir rev v1.0.0-beta.21
- barretenberg-rs =5.0.0-nightly.20260324 (crates.io), static libs from the matching GitHub release
- mopro-ffi 0.3.7, uniffi as pinned by mopro-ffi
- Xcode 26.6 (17F113), iOS SDK 26.5, simulator runtime iOS 18.5, deployment target iOS 17.0
- Android: same crate with `IOS_ARCHS` replaced by `ANDROID_ARCHS` (arm64-android static lib exists for this bb tag; not built here)
