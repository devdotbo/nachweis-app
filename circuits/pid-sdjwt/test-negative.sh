#!/usr/bin/env bash
# Negative tests: every tampered witness must fail `nargo execute`.
# (nargo -p silently ignores prover names containing a dot, hence Prover_neg_*.)
# Usage: ./test-negative.sh [input.json]   (default: prover-sp1/fixtures/input.json)
set -u
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
cd "$(dirname "$0")"
INPUT="${1:-../../prover-sp1/fixtures/input.json}"
fail=0
for mode in issuer-sig age-disclosure nonce kb-sig; do
  name="Prover_neg_${mode//-/_}"; bun run ../tools/gen-prover.ts "$INPUT" "$name.toml" "--tamper=$mode" > /dev/null || { echo "gen failed for $mode"; exit 1; }
  if out=$(nargo execute -p "$name" "neg_${mode//-/_}" 2>&1); then
    echo "FAIL  $mode: witness solved, expected an assertion failure"; fail=1
  else
    msg=$(echo "$out" | grep -o 'Assertion failed: .*' | head -1)
    echo "ok    $mode rejected: ${msg:-non-zero exit}"
  fi
done
# positive control
bun run ../tools/gen-prover.ts "$INPUT" Prover.toml > /dev/null
if nargo execute pid_witness > /dev/null 2>&1; then echo "ok    untampered witness solves"; else echo "FAIL  untampered witness does not solve"; fail=1; fi
exit $fail
