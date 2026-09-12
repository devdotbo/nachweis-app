# Evidence directory

This directory holds the sanitized record of gate runs (G0 first). Anything
that can identify a person, replay a presentation, or unlock a relay pickup
stays out of git.

## Layout

- /Users/bioharz/git/ethglobal/nachweis-app/docs/evidence/g0-template.md:
  the form the builder copies and fills.
- /Users/bioharz/git/ethglobal/nachweis-app/docs/evidence/g0-YYYY-MM-DD-<n>.md:
  one filled copy per run attempt, committed.
- /Users/bioharz/git/ethglobal/nachweis-app/docs/evidence/private/:
  raw captures (verifier log, companion output, tunnel log, screenshots,
  the stored ciphertext, the decrypted presentation, witness files). Ignored
  by git through docs/evidence/.gitignore. Never commit anything from here,
  never move files out of it without sanitizing.

## Run records

- `sepolia-phone-2026-09-12.md`: official wallet journey on Sepolia (commit 5f17c3a, fresh investor 0xC616…bA44): proof from the official test wallet in the browser, `attestWithProof` mined, approve, subscribe, swap (75.569 NDF for 100 mUSD), revoke, refused swap decoded to Unauthorized(); measured against the readiness review's acceptance steps.

## What may be committed

- Wallet app name and version string, iOS version, phone model.
- The verifier commit hash, companion commit hash, tool versions.
- The public hostname used (it is short-lived; the tunnel is torn down
  after the run) and the client_id string as the wallet saw it.
- The vct literal, the JSON path of the age claim, the list of claim
  names that were present (names of keys, never values).
- Byte lengths of the SD-JWT parts and the KB-JWT parts.
- The issuer key hash as computed by the companion from the live
  presentation, labelled "live" and with the run date. A hash taken from a
  fixture must be labelled "fixture" and must not appear in a live evidence
  field.
- The nonce as hex (it is derived from a public address and a random
  challenge, it reveals nothing about the holder).
- The expiry timestamps (iat, exp) of the PID.
- Verifier log excerpts after redaction (see below).
- Pass or fail per criterion and the branch taken.

## What must never be committed

- The SD-JWT presentation or any disclosure, in any encoding, including
  the encrypted JWE (the JWE is holder-linkable and the companion key may
  be reused in later runs).
- Pickup tokens, result tokens, state or session identifiers of the run.
- Witness files, Prover.toml with real inputs, proof bytes that were made
  from a real PID (these are fine for fixtures, not for live data).
- The companion private key or the RP private key.
- Names, birth dates, addresses, document numbers, portrait data, the
  wallet holder's anything. Address proof evidence is the parsed shape
  (which keys were present) and the byte length, not the values.
- Screenshots of the consent screen that show claim values. A screenshot
  of the consent screen is allowed only with values masked.

## How to redact

1. Copy the raw log into private/ first; work on a copy.
2. Replace every base64url run longer than 40 characters with
   `<b64:len=N>` (N is the original length). One way:
   `perl -pe 's/[A-Za-z0-9_-]{40,}/"<b64:len=".length($&).">"/ge'`.
3. Replace UUIDs and tokens with `<id>` and `<token>`.
4. Replace the public hostname with `<host>` if the tunnel hostname was
   stable (named tunnel); a random trycloudflare hostname may stay.
5. Read the result once more for claim values (a postal code or a city is
   a value, not a shape).
6. Save the result as `g0-YYYY-MM-DD-<n>.md` next to the template and
   commit only that file.

## Fixture versus live

Fixture material lives under
/Users/bioharz/git/ethglobal/nachweis-verifier-relay/fixtures/ and under
the companion and circuit test directories. Hashes, sizes and claim shapes
taken from fixtures are useful for comparison and must be labelled
"fixture" in every evidence field. A G0 verdict rests only on values
labelled "live".
