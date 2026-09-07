#!/usr/bin/env bash
# Builds prover-mobile-core for Android through mopro-ffi's build entry point
# (cargo ndk --link-libcxx-shared + uniffi-bindgen) and copies the result into
# the app: jniLibs/<abi>/{libprover_mobile_core.so, libc++_shared.so} and
# app/src/main/java/uniffi/mopro/mopro.kt (package uniffi.mopro).
#
#   prover-android/scripts/build-rust.sh                 # arm64-v8a release
#   ANDROID_ARCHS=arm64-v8a,x86_64 prover-android/scripts/build-rust.sh
#
# Needs: rustup target aarch64-linux-android, cargo-ndk, NDK 29 (LLVM 20: the
# prebuilt Barretenberg Android library was built with Zig clang 20 and needs
# that libc++_shared.so; NDK 27's lacks the basic_stringstream VTT symbols),
# curl and tar (barretenberg-rs downloads libbb-external.a per target).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CORE="$(cd "$HERE/../prover-mobile-core" && pwd)"
APP="$HERE/app"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export ANDROID_NDK_HOME="${ANDROID_NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/29.* | tail -1)}"
export ANDROID_NDK="${ANDROID_NDK:-$ANDROID_NDK_HOME}"
export ANDROID_ARCHS="${ANDROID_ARCHS:-arm64-v8a}"
export CONFIGURATION="${CONFIGURATION:-release}"

cd "$CORE"
cargo run --release --bin android

rm -rf "$APP/src/main/jniLibs" "$APP/src/main/java/uniffi"
mkdir -p "$APP/src/main/jniLibs" "$APP/src/main/java"
cp -R "$CORE/MoproAndroidBindings/jniLibs/." "$APP/src/main/jniLibs/"
cp -R "$CORE/MoproAndroidBindings/uniffi" "$APP/src/main/java/"
echo "bindings: $(ls "$APP"/src/main/java/uniffi/mopro)"
echo "jniLibs:"; ls -la "$APP"/src/main/jniLibs/*/
