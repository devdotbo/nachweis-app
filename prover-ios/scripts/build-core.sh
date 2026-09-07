#!/usr/bin/env bash
# Builds prover-mobile-core for iOS with Mopro (mopro-ffi app_config) and
# copies the bindings into prover-ios/MoproiOSBindings.
#   scripts/build-core.sh            # simulator only (aarch64-apple-ios-sim)
#   scripts/build-core.sh device     # simulator + device (aarch64-apple-ios)
# barretenberg-rs downloads the prebuilt bb static library per target on the
# first build (github.com/AztecProtocol/barretenberg releases).
set -euo pipefail
cd "$(dirname "$0")/../../prover-mobile-core"
ARCHS=aarch64-apple-ios-sim
[ "${1:-}" = "device" ] && ARCHS=aarch64-apple-ios-sim,aarch64-apple-ios
CONFIGURATION=${CONFIGURATION:-release} IOS_ARCHS=$ARCHS IPHONEOS_DEPLOYMENT_TARGET=17.0 cargo run --release --bin ios
rm -rf ../prover-ios/MoproiOSBindings
cp -R MoproiOSBindings ../prover-ios/MoproiOSBindings
ls ../prover-ios/MoproiOSBindings
