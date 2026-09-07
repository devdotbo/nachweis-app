#!/usr/bin/env bash
# Copies the circuit artefacts and the SRS into the app assets.
#   pid_sdjwt.json, pid_sdjwt_evm.vk, pid_sdjwt_evm.vk_hash are committed (regenerate after any circuit change:
#   circuits/README.md, nargo compile + bb write_vk -t evm);
#   bn254_g1.dat (2^20 + 1 points, 64 MB) is gitignored and taken from ~/.bb-crs or downloaded.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
ASSETS="$HERE/app/src/main/assets"
mkdir -p "$ASSETS"
CIRCUIT="$ROOT/circuits/pid-sdjwt"
if [ "${REFRESH_CIRCUIT:-0}" = 1 ]; then
  cp "$CIRCUIT/target/pid_sdjwt.json" "$ASSETS/pid_sdjwt.json"
  cp "$CIRCUIT/out/adapted/vk" "$ASSETS/pid_sdjwt_evm.vk"
  cp "$CIRCUIT/out/adapted/vk_hash" "$ASSETS/pid_sdjwt_evm.vk_hash"
fi
cp "$ROOT/prover-sp1/fixtures/realistic-input.json" "$ASSETS/test-vector.json"
POINTS=$(( (1 << 20) + 1 ))
BYTES=$(( POINTS * 64 ))
if [ ! -f "$ASSETS/bn254_g1.dat" ] || [ "$(stat -f %z "$ASSETS/bn254_g1.dat")" -lt "$BYTES" ]; then
  if [ -f "$HOME/.bb-crs/bn254_g1.dat" ] && [ "$(stat -f %z "$HOME/.bb-crs/bn254_g1.dat")" -ge "$BYTES" ]; then
    head -c "$BYTES" "$HOME/.bb-crs/bn254_g1.dat" > "$ASSETS/bn254_g1.dat"
  else
    curl -fL -r "0-$((BYTES - 1))" -o "$ASSETS/bn254_g1.dat" https://crs.aztec.network/g1.dat
  fi
fi
if [ ! -f "$ASSETS/bn254_g2.dat" ]; then
  if [ -f "$HOME/.bb-crs/bn254_g2.dat" ]; then cp "$HOME/.bb-crs/bn254_g2.dat" "$ASSETS/bn254_g2.dat"
  else curl -fL -o "$ASSETS/bn254_g2.dat" https://crs.aztec.network/g2.dat; fi
fi
ls -la "$ASSETS"
