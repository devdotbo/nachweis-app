#!/usr/bin/env bash
# Builds the Rust core for Android (arm64) and the host, generates the uniffi
# Kotlin bindings and drops everything where Gradle expects it.
#
#   prover-android/scripts/build-rust.sh            # arm64-v8a release
#   ABIS="arm64-v8a x86_64" prover-android/scripts/build-rust.sh
#
# Needs: rustup targets aarch64-linux-android (x86_64-linux-android), cargo-ndk,
# an NDK under $ANDROID_HOME/ndk (ANDROID_NDK_HOME overrides), curl and tar
# (barretenberg-rs downloads the prebuilt libbb-external.a per target).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$(cd "$HERE/../prover-mobile-core" && pwd)"
APP="$HERE/app"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# NDK 29 (LLVM 20): the prebuilt libbb-external.a references libc++ symbols
# (VTT/vtable of basic_stringstream and friends) that the libc++_shared.so of
# NDK 27 does not export; the app must ship the newer libc++_shared.so.
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/29.* | tail -1)}"
ABIS="${ABIS:-arm64-v8a}"
API=30

cd "$CORE"
for abi in $ABIS; do
  cargo ndk -t "$abi" -p "$API" -o "$APP/src/main/jniLibs" build --release
  case "$abi" in
    arm64-v8a) triple=aarch64-linux-android ;;
    x86_64) triple=x86_64-linux-android ;;
    *) echo "unknown abi $abi" >&2; exit 1 ;;
  esac
  # barretenberg links libc++ dynamically; ship the NDK's libc++_shared.so next to the core.
  cp "$ANDROID_NDK_HOME/toolchains/llvm/prebuilt/"*"/sysroot/usr/lib/$triple/libc++_shared.so" "$APP/src/main/jniLibs/$abi/"
done

# Kotlin bindings from the host build of the same crate (library mode).
cargo build --release
HOST_LIB="$(ls "$CORE"/target/release/libnachweis_prover.{dylib,so} 2>/dev/null | head -1)"
OUT="$APP/src/main/java"
rm -rf "$OUT/org/nachweis/prover/core"
cargo run --release --bin uniffi-bindgen -- generate --library "$HOST_LIB" --language kotlin --out-dir "$OUT" --no-format
echo "bindings: $(ls "$OUT"/org/nachweis/prover/core)"
echo "jniLibs:"; ls -la "$APP"/src/main/jniLibs/*/
