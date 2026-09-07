# Android toolchain notes

The proving core and its toolchain decision live in `../prover-mobile-core`
(`TOOLCHAIN.md` there: Noir crates at `v1.0.0-beta.21`, `barretenberg-rs
=5.0.0-nightly.20260324`, mopro-ffi 0.3.7 for the uniffi scaffolding and the
platform build entry points, no noir-rs since no branch matches beta.21).

Android specifics, measured on this Mac (2026-09-07):

| piece | version | note |
| --- | --- | --- |
| NDK | 27.0.12077973 (compiles C sources, bionic sysroot for the link) | any NDK; the libc++ question is solved by Zig, see below |
| Zig | 0.16.0 (Homebrew) | linker for the Android .so (static `std::__1` libc++), see below |
| cargo-ndk | 3.5.4 (`cargo install cargo-ndk`); `scripts/build-rust.sh` runs `cargo ndk -t arm64-v8a --platform 30 build --release` with the Zig linker wrapper | mopro's `cargo run --bin android` links with the NDK and produces a .so that does not load |
| Rust | 1.92.0, targets `aarch64-linux-android` (`x86_64-linux-android` optional) | |
| AGP / Kotlin / Gradle | 8.13.2 / 2.2.21 (compose plugin) / 9.1.0 | JDK 17 (`JAVA_HOME`) |
| JNA | 5.17.0 (`@aar`) | what the uniffi Kotlin bindings load the .so with |
| minSdk / target | 30 / 35 | |

## libc++: the prebuilt Barretenberg wants `std::__1`, every NDK ships `std::__ndk1`

`libbb-external.a` for arm64-android is built with Zig clang 20.1.2 against
upstream libc++ (`std::__1`). Linked with the NDK (27) the app's
`libprover_mobile_core.so` builds, but on the device `dlopen` fails:

    cannot locate symbol "_ZTTNSt3__119basic_ostringstreamIcNS_11char_traitsIcEENS_9allocatorIcEEEE"
    referenced by ".../lib/arm64/libprover_mobile_core.so"

133 symbols are affected (stringstream VTT/vtables, `to_chars`, `mutex`,
`condition_variable`, `thread`, `locale`, filesystem, ...). The NDK's
`libc++_shared.so` cannot provide them in any version: NDK 27 and NDK r29
both export only `std::__ndk1` symbols (checked with `llvm-nm -D`; the
earlier note that NDK 29 would fix it was wrong, a full NDK 29 download was
started and abandoned once its `libc++_shared.so`, fetched alone out of the
zip with HTTP range requests, showed 0 `__1` symbols).

The fix, the same one mopro-cli uses for its Noir adapter
(`cli/src/build/android_noir.rs`): link the .so with `zig cc -target
aarch64-linux-android`, which statically links Zig's own (`__1`) libc++ and
resolves barretenberg-rs's `-lc++`; a `ZIG_LIBC` file points Zig at the NDK
sysroot (bionic headers, crt objects for API 30) and `-lc++_shared` stays
for the rest. `scripts/build-rust.sh` writes that wrapper and passes it as
`-Clinker` to `cargo ndk` (NDK 27's clang still compiles the C sources);
Kotlin bindings come from the host dylib because the Zig-linked .so has no
`.symtab` for uniffi-bindgen. Zig 0.16.0 from Homebrew.

## Earlier Android-side core (superseded)

Before the shared core existed, this branch carried its own uniffi crate on
the same crate pair (commit c5a2174, moved to `prover-mobile-core` in
491c2c4, replaced by the wp12-ios core in 74b58f2). Its host proof of the
committed vector verified with the desktop `bb verify -t evm` and the desktop
VK, with byte-identical public inputs, which is what settled the crate pair;
the adopted core reproduces that (`prover-mobile-core/TOOLCHAIN.md`,
"Verified on the desktop").
