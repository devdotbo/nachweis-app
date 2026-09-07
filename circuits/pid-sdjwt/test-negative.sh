#!/usr/bin/env bash
# Negative tests: every tampered witness must fail `nargo execute`; positive controls: the
# untampered vector and the other age shapes (B: age object disclosed with nested digests,
# C: disclosed with plain values) and the older minimal layout (no kid) must solve.
# (nargo -p silently ignores prover names containing a dot, hence Prover_neg_*.)
# Usage: ./test-negative.sh [input.json]   (default: prover-sp1/fixtures/realistic-input.json)
set -u
export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
cd "$(dirname "$0")"
INPUT="${1:-../../prover-sp1/fixtures/realistic-input.json}"
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
# positive controls
bun run ../tools/gen-prover.ts "$INPUT" Prover.toml > /dev/null
if nargo execute pid_witness > /dev/null 2>&1; then echo "ok    untampered witness solves"; else echo "FAIL  untampered witness does not solve"; fail=1; fi
# other age shapes and the minimal layout, minted fresh (a throwaway issuer key in a temp dir)
tmp=$(mktemp -d)
for variant in "disclosed" "plain" "nested --minimal"; do
  set -- $variant; shape=$1; extra=${2:-}
  label="shape-$shape${extra:+-minimal}"
  (cd ../../companion && bun run src/cli.ts mint-fixture --issuer-key "$tmp/issuer.json" --out "$tmp" --name "$label" --age-shape "$shape" $extra --quiet > /dev/null) || { echo "FAIL  mint $label"; fail=1; continue; }
  bun run ../tools/gen-prover.ts "$tmp/$label-input.json" "Prover_$label.toml" > "$tmp/$label.log" || { echo "FAIL  gen-prover $label: $(tail -1 "$tmp/$label.log")"; fail=1; continue; }
  if nargo execute -p "Prover_$label" "wit_$label" > /dev/null 2>&1; then echo "ok    $label solves ($(grep -o 'age shape [A-C]' "$tmp/$label.log"))"; else echo "FAIL  $label does not solve"; fail=1; fi
  # the age-disclosure tamper must fail in every shape
  bun run ../tools/gen-prover.ts "$tmp/$label-input.json" "Prover_neg_$label.toml" --tamper=age-disclosure > /dev/null
  if nargo execute -p "Prover_neg_$label" "neg_$label" > /dev/null 2>&1; then echo "FAIL  $label tampered age witness solved"; fail=1; else echo "ok    $label age tamper rejected"; fi
done
# Prover_shape-*.toml and Prover_neg_*.toml are gitignored; the temp dir holds the minted inputs.
exit $fail
