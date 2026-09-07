# Android toolchain notes

The proving core and its toolchain decision live in `../prover-mobile-core`
(`TOOLCHAIN.md` there: Noir crates at `v1.0.0-beta.21`, `barretenberg-rs
=5.0.0-nightly.20260324`, mopro-ffi 0.3.7 for the uniffi scaffolding and the
platform build entry points, no noir-rs since no branch matches beta.21).

Android specifics, measured on this Mac (2026-09-07):

| piece | version | note |
| --- | --- | --- |
| NDK | 29.0.13599879 (LLVM 20) | required by the prebuilt Barretenberg library, see below |
| cargo-ndk | installed via `cargo install cargo-ndk`; mopro's `cargo run --bin android` calls `cargo ndk -t arm64-v8a build --link-libcxx-shared --lib --release` | |
| Rust | 1.92.0, targets `aarch64-linux-android` (`x86_64-linux-android` optional) | |
| AGP / Kotlin / Gradle | 8.13.2 / 2.2.21 (compose plugin) / 9.1.0 | JDK 17 (`JAVA_HOME`) |
| JNA | 5.17.0 (`@aar`) | what the uniffi Kotlin bindings load the .so with |
| minSdk / target | 30 / 35 | |

## libc++: NDK 27 links, NDK 29 runs

`libbb-external.a` for arm64-android is built with Zig clang 20.1.2. Linked
with NDK 27 (LLVM 18) the app's `libprover_mobile_core.so` builds, but on the
device `dlopen` fails:

    cannot locate symbol "_ZTTNSt3__119basic_ostringstreamIcNS_11char_traitsIcEENS_9allocatorIcEEEE"
    referenced by ".../lib/arm64/libprover_mobile_core.so"

(VTT of `std::basic_ostringstream`; also `basic_istringstream`,
`basic_stringstream` vtables). NDK 27's `libc++_shared.so` does not export
them, NDK 29's does. `scripts/build-rust.sh` therefore defaults to
`$ANDROID_HOME/ndk/29.*` and ships NDK 29's `libc++_shared.so` in
`jniLibs/arm64-v8a` next to the core. NDK 29 was installed with
`sdkmanager --install "ndk;29.0.13599879"` (the SDK's `ndk/29.0.13599879`
directory was an unfinished Android Studio download before).

## Earlier Android-side core (superseded)

Before the shared core existed, this branch carried its own uniffi crate on
the same crate pair (commit c5a2174, moved to `prover-mobile-core` in
491c2c4, replaced by the wp12-ios core in 74b58f2). Its host proof of the
committed vector verified with the desktop `bb verify -t evm` and the desktop
VK, with byte-identical public inputs, which is what settled the crate pair;
the adopted core reproduces that (`prover-mobile-core/TOOLCHAIN.md`,
"Verified on the desktop").
