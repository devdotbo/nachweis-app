#!/usr/bin/env bash
# Puts the bn254 G1 SRS (2^20 + 1 points, 67,108,928 bytes, bb's g1.dat
# layout: 64 bytes per point, no header) into the app bundle resources.
# Uses bb's local cache when present, otherwise the first bytes of the Aztec
# transcript. Byte-identical to what `bb prove` used on the desktop.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=NachweisProver/Resources/bn254_g1.dat
BYTES=67108928
if [ -f "$HOME/.bb-crs/bn254_g1.dat" ] && [ "$(stat -f %z "$HOME/.bb-crs/bn254_g1.dat")" -ge "$BYTES" ]; then
  head -c "$BYTES" "$HOME/.bb-crs/bn254_g1.dat" > "$OUT"
else
  curl -sSL -H "Range: bytes=0-$((BYTES - 1))" https://crs.aztec.network/g1.dat -o "$OUT"
fi
echo "$OUT: $(stat -f %z "$OUT") bytes (sha256 $(shasum -a 256 "$OUT" | cut -c1-16)…)"
