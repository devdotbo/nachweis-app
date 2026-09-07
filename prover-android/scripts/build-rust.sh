#!/usr/bin/env bash
# Builds prover-mobile-core for Android and drops the results into the app:
#   app/src/main/jniLibs/arm64-v8a/{libprover_mobile_core.so, libc++_shared.so}
#   app/src/main/java/uniffi/mopro/mopro.kt        (package uniffi.mopro, mopro's convention)
#
# Why not `cargo run --bin android` (mopro-ffi's plain cargo-ndk build): the
# prebuilt Barretenberg Android library is built with Zig's clang and links
# against upstream libc++ (`std::__1`), while every NDK ships libc++ in the
# `std::__ndk1` namespace (checked: NDK 27 and NDK 29 libc++_shared.so). A
# plain cargo-ndk link produces a .so whose dlopen fails with
# "cannot locate symbol _ZTTNSt3__119basic_ostringstream...". mopro-cli's Noir
# adapter solves it the same way as below (cli/src/build/android_noir.rs):
# link with `zig cc`, which bakes Zig's static `__1` libc++ into the .so, with
# the NDK's bionic headers and crt via a ZIG_LIBC file, plus `-lc++_shared`
# for the rest of the C++ world.
#
# Needs: rustup target aarch64-linux-android, cargo-ndk, an NDK (27 is fine),
# zig (brew install zig; 0.16 used here), curl and tar (barretenberg-rs
# downloads libbb-external.a on the first build), and a host build of the
# core for the Kotlin bindings (done here).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$(cd "$HERE/../prover-mobile-core" && pwd)"
APP="$HERE/app"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/27.* | tail -1)}"
ZIG="${ZIG:-$(command -v zig)}"
API=30
TRIPLE=aarch64-linux-android
ABI=arm64-v8a
HOST_TAG="$(ls "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt")"
SYSROOT="$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG/sysroot"
WORK="$CORE/build/zig-android"
mkdir -p "$WORK"

# Zig ships no Android libc: point it at the NDK's bionic headers and crt objects.
cat > "$WORK/libc-$TRIPLE.txt" <<CONF
include_dir=$SYSROOT/usr/include
sys_include_dir=$SYSROOT/usr/include/$TRIPLE
crt_dir=$SYSROOT/usr/lib/$TRIPLE/$API
msvc_lib_dir=
kernel32_lib_dir=
gcc_dir=
CONF
cat > "$WORK/cc-$TRIPLE.sh" <<WRAP
#!/bin/sh
set -e
export ZIG_LIBC="$WORK/libc-$TRIPLE.txt"
exec "$ZIG" cc -target $TRIPLE -L "$SYSROOT/usr/lib/$TRIPLE/$API" -L "$SYSROOT/usr/lib/$TRIPLE" "\$@" -lc++_shared
WRAP
chmod +x "$WORK/cc-$TRIPLE.sh"

cd "$CORE"
# C code (blake3 etc.) is compiled by the NDK clang that cargo-ndk selects; only the final link goes through zig.
RUSTFLAGS="${RUSTFLAGS:-} -Clinker=$WORK/cc-$TRIPLE.sh" \
  cargo ndk -t "$ABI" --platform "$API" -o "$WORK/jniLibs" build --release
mkdir -p "$APP/src/main/jniLibs/$ABI"
cp "$WORK/jniLibs/$ABI/libprover_mobile_core.so" "$APP/src/main/jniLibs/$ABI/"
cp "$SYSROOT/usr/lib/$TRIPLE/libc++_shared.so" "$APP/src/main/jniLibs/$ABI/"

# Kotlin bindings from the host build (same crate, same uniffi metadata); zig-linked
# .so files lose the .symtab uniffi-bindgen reads, hence the host dylib.
cargo build --release
HOST_LIB="$(ls "$CORE"/target/release/libprover_mobile_core.{dylib,so} 2>/dev/null | head -1)"
UNIFFI_VERSION="$(grep -A1 '^name = "uniffi"$' "$CORE/Cargo.lock" | tail -1 | sed 's/version = "\(.*\)"/\1/')"
BINDGEN="$WORK/uniffi-bindgen-cli"
if [ ! -x "$BINDGEN/target/release/uniffi-bindgen-cli" ]; then
  mkdir -p "$BINDGEN/src"
  printf '[package]\nname = "uniffi-bindgen-cli"\nversion = "0.1.0"\nedition = "2021"\n[dependencies]\nuniffi = { version = "=%s", features = ["cli"] }\n' "$UNIFFI_VERSION" > "$BINDGEN/Cargo.toml"
  printf 'fn main() { uniffi::uniffi_bindgen_main() }\n' > "$BINDGEN/src/main.rs"
  (cd "$BINDGEN" && cargo build --release)
fi
"$BINDGEN/target/release/uniffi-bindgen-cli" generate --library "$HOST_LIB" --language kotlin --out-dir "$WORK/kt" --no-format
mkdir -p "$APP/src/main/java/uniffi/mopro"
sed 's/^package uniffi.prover_mobile_core$/package uniffi.mopro/' "$WORK/kt/uniffi/prover_mobile_core/prover_mobile_core.kt" > "$APP/src/main/java/uniffi/mopro/mopro.kt"

echo "bindings: $(ls "$APP"/src/main/java/uniffi/mopro)"
echo "jniLibs:"; ls -la "$APP"/src/main/jniLibs/*/
"$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/$HOST_TAG/bin/llvm-readelf" -d "$APP/src/main/jniLibs/$ABI/libprover_mobile_core.so" | grep NEEDED
