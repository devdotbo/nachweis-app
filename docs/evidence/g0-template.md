# G0 run record

Copy this file to `g0-YYYY-MM-DD-<n>.md` in this directory and fill every
field. Write `unverified` where you did not observe a value; never guess.
Every hash or size below carries a label `live` or `fixture`; the verdict
counts only `live` values. Raw captures go to
docs/evidence/private/
and are not committed.

## Run identity

| Field | Value |
|---|---|
| Date and time (local) | |
| Attempt number | |
| Builder | (role only, no name) |
| Verifier commit (`git -C "$VERIFIER_REPO" rev-parse HEAD`) | |
| Companion commit (`git rev-parse HEAD in the repository root`) | |
| Run directory (from g0-up.sh) | |
| Verdict | pass / fail: branch <name> |

## Environment

| Field | Value |
|---|---|
| Phone model and iOS version | |
| Wallet app name and version string (Settings or About screen) | |
| PID issuance date (sandbox issuer) | |
| Tunnel tool and version | |
| Public hostname used | |
| rustc, bun, nargo, bb versions | |

## Request as the wallet saw it

| Field | Value |
|---|---|
| client_id string (scheme and value) | |
| Request URI host equals public hostname (yes/no) | |
| Wallet accepted the request (consent screen shown) | yes / no, error text: |
| Claims listed on the consent screen (names only) | |
| Wallet encrypted the response (JWE present at pickup) | yes / no |
| JWE alg and enc header values | |
| JWE kid matches the companion key (yes/no) | |

## Response as the companion parsed it

| Field | Value | Label |
|---|---|---|
| Actual `aud` in the KB-JWT | | live |
| Expected `aud` (verifier config) | | config |
| `aud` matches expected | yes / no | |
| Nonce in KB-JWT (hex) | | live |
| hex(sha256(address20 \|\| challenge)) as computed by the companion | | live |
| Nonce matches | yes / no | |
| vct literal | | live |
| Age claim JSON path (for example `age_equal_or_over.18`) | | live |
| Age object shape (keys and value types, no values) | | live |
| Address claim keys present (names only) | | live |
| Issuer (`iss`) | | live |
| Issuer key hash computed by the companion | | live |
| Issuer chain validated against trust anchor (yes/no, anchor file) | | |
| iat / exp of the PID | | live |
| Status list present (yes/no), checked (yes/no) | | |

## Sizes against the circuit bounds

Bounds from
circuits/pid-sdjwt
(WP13). Fill the observed length in bytes of each part.

| Part | Bound | Observed (live) | Within bound |
|---|---|---|---|
| SD-JWT header (base64url) | 2304 | | |
| SD-JWT payload (base64url) | 2304 | | |
| SD-JWT tail (signature and disclosures) | 768 | | |
| KB-JWT payload (base64url) | 384 | | |
| KB-JWT header (base64url) | 128 | | |
| Number of disclosures presented | n/a | | |

## Pass criteria checklist

| # | Criterion | Result | Evidence file (private/) |
|---|---|---|---|
| 1 | Wallet accepted the request and posted a response | | |
| 2 | Companion picked up the stored response (single pickup honoured: second pickup answered 410) | | |
| 3 | Companion decrypted with the companion key | | |
| 4 | KB-JWT nonce equals hex(sha256(address20 \|\| challenge)) | | |
| 5 | Verifier log contains no plaintext (grep for a claim key name and for the nonce; both absent) | | |
| 6 | Companion printed the parsed claim shape | | |
| 7 | Proof generated (bb prove exit 0, proof size) | optional for G0 | |
| 8 | Proof submitted or verified locally | optional for G0 | |

## Fail branch (fill only on fail)

| Field | Value |
|---|---|
| Branch (request rejected / no client-key encryption / age shape / bounds / nonce / plaintext in log) | |
| First error text (redacted) | |
| Decision taken (see docs/spec-g0.md fail branches) | |
| Owner of the follow-up | |

## Redaction confirmation

- [ ] No base64url run longer than 40 characters remains in this file.
- [ ] No pickup or result token, no session id.
- [ ] No claim values (names, dates, addresses).
- [ ] Every hash carries a live or fixture label.
