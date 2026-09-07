#!/usr/bin/env bash
# Verifies a proof produced on the phone or simulator against the desktop VK.
#   scripts/verify-desktop.sh <proof.bin> <public_inputs.bin>
# Both files are what the app shares (proof hex, public inputs hex), decoded
# with `xxd -r -p`. The VK is circuits/pid-sdjwt/out/adapted/vk from
# `bb write_vk -t evm` (same bytes as NachweisProver/Resources/vk_keccak.bin).
set -euo pipefail
export PATH="$HOME/.bb:$PATH"
cd "$(dirname "$0")/.."
bb verify -k NachweisProver/Resources/vk_keccak.bin -p "$1" -i "$2" -t evm
