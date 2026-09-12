#!/usr/bin/env bash
# Export the event commits on the verifier's relay branch as a patch series.
#
# The blind relay and bridge mode were built during ETHOnline 2026 on branch
# nachweis-relay of the builder's pre-existing verifier repository
# (Klartext-ID/klartext-verifier, Apache-2.0). That branch may stay unpushed;
# this script gives the submission a reproducible public copy of the work by
# writing `git format-patch <base>..HEAD` into vendor/verifier-relay-patches/
# together with a README that names the base commit, the exported head, the
# upstream repository and the licence.
#
# Usage: scripts/export-relay-patches.sh [relay-worktree] [base-commit]
# Defaults: $VERIFIER_REPO (else ../nachweis-verifier-relay next to this repository) and a08d72c.
# Review the output for secrets before committing (the script greps for the
# obvious patterns and exits non-zero if any match).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELAY_DIR="${1:-${VERIFIER_REPO:-$(cd "$REPO_ROOT/.." && pwd)/nachweis-verifier-relay}}"
BASE="${2:-a08d72c}"
UPSTREAM_URL="https://github.com/Klartext-ID/klartext-verifier"
OUT_DIR="$REPO_ROOT/vendor/verifier-relay-patches"

if [ ! -d "$RELAY_DIR" ]; then
  echo "relay worktree not found: $RELAY_DIR" >&2
  exit 1
fi

HEAD_SHA="$(git -C "$RELAY_DIR" rev-parse --short HEAD)"
BRANCH="$(git -C "$RELAY_DIR" branch --show-current)"
BASE_LINE="$(git -C "$RELAY_DIR" log -1 --format='%h %ad %s' --date=short "$BASE")"
COUNT="$(git -C "$RELAY_DIR" rev-list --count "$BASE..HEAD")"
LICENCE_LINE="$(grep -m1 -oE 'Apache License|MIT License|Mozilla Public License' "$RELAY_DIR/LICENSE" || echo unverified)"

mkdir -p "$OUT_DIR"

# Stale patches from an earlier export are not deleted by this script; list
# them so the operator can remove them by hand before committing.
existing="$(find "$OUT_DIR" -maxdepth 1 -name '*.patch' | sort)"

git -C "$RELAY_DIR" format-patch --no-signature --no-numbered \
  --output-directory "$OUT_DIR" "$BASE..HEAD" >/dev/null

fresh="$(find "$OUT_DIR" -maxdepth 1 -name '*.patch' | sort)"

{
  echo "# Verifier relay patches"
  echo
  echo "Patch series of the ETHOnline 2026 event work on the builder's pre-existing EUDI verifier."
  echo
  echo "- Upstream repository: $UPSTREAM_URL (licence: $LICENCE_LINE, see LICENSE in that repository)"
  echo "- Base commit: $BASE_LINE"
  echo "- Exported head: $HEAD_SHA on branch $BRANCH, $COUNT commits"
  echo "- Exported on: $(date -u +%Y-%m-%d) by scripts/export-relay-patches.sh"
  echo
  echo "The patches are the complete diff of branch \`$BRANCH\` against the base commit. They are event work and carry the upstream licence (Apache-2.0). Nothing else in that repository was changed during the event."
  echo
  echo "## Apply"
  echo
  echo '```'
  echo "git clone $UPSTREAM_URL"
  echo "cd klartext-verifier"
  echo "git checkout -b $BRANCH $BASE"
  echo "git am /path/to/nachweis-app/vendor/verifier-relay-patches/*.patch"
  echo "cargo test --workspace"
  echo '```'
  echo
  echo "## Series"
  echo
  git -C "$RELAY_DIR" log --reverse --format='- %h %ad %s' --date=short "$BASE..HEAD"
} > "$OUT_DIR/README.md"

status=0
if [ -n "$existing" ]; then
  stale="$(comm -23 <(echo "$existing") <(echo "$fresh") || true)"
  if [ -n "$stale" ]; then
    echo "stale patches from an earlier export, remove by hand before committing:" >&2
    echo "$stale" >&2
    status=1
  fi
fi

# Secret scan: private keys, tokens, raw JWT or JWE material of realistic length.
if grep -nE 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|sk_(live|test)_[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{60,}\.[A-Za-z0-9_-]{40,}' "$OUT_DIR"/*.patch; then
  echo "possible secret or raw credential in the patches above; do not commit" >&2
  status=1
fi

echo "wrote $COUNT patches and README.md to $OUT_DIR (head $HEAD_SHA)"
exit $status
