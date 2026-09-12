# G0 runbook: official test wallet against the blind relay

One reproducible path from a clean Mac shell to a recorded pass or fail.
Spec: docs/spec-g0.md.
Evidence: docs/evidence/README.md.

Conventions. FACT means read from code or a file, with the citation. Spec
means taken from the OpenID4VP specification, not verified against the
sandbox wallet. Unverified means nobody has observed it yet; the run will.
Fixture values are labelled fixture and are never live evidence.

Repositories:

- companion and circuits (this worktree):
  this repository (nachweis-app)
- verifier, branch nachweis-relay:
  the verifier relay checkout (VERIFIER_REPO)
- RP private key (outside every repo):
  `RP_KEY_PATH` (the builder's local secrets location)

## 1. Prerequisites

Checked on this Mac on 2026-09-08 (FACT, `--version` output):

| Tool | Required | On this Mac |
|---|---|---|
| rustc / cargo | stable | 1.92.0 (rustup `stable-aarch64-apple-darwin`) |
| bun | any 1.x | 1.3.5 |
| nargo | 1.0.0-beta.21 (pinned: circuits/README.md:15) | 1.0.0-beta.21 at ~/.nargo/bin/nargo |
| bb | 5.0.0-nightly.20260324 (pinned: circuits/README.md:16, companion/README.md:14) | 5.0.0-nightly.20260324 at ~/.bb/bb |
| cloudflared (tunnel, default) | any | 2026.8.2 at /opt/homebrew/bin/cloudflared |
| ngrok (alternative) | any | 3.39.11 at /opt/homebrew/bin/ngrok |
| tailscale (alternative, Funnel) | any | 1.102.3, Funnel has no serve config |

Do not run `noirup --version`: noirup has no version flag and installs the
latest nargo instead. Check with `nargo --version`; restore with
`noirup -v 1.0.0-beta.21` if it drifted.

PATH for every shell below:

```
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"
```

Companion dependencies (once):

```
cd <repo root>/companion && bun install
```

Circuit artifacts: the companion `prove` step needs the compiled circuit and
verification key; see
companion/README.md
(NACHWEIS_CIRCUIT_DIR, NACHWEIS_VK). Not needed for criteria 1 to 6.

Wallet side: the official test wallet with a sandbox PID already issued
(source: https://eudi-wallet.gov.de/en/news/testing-digital-credentials-in-the-eudi-wallet-sandbox
per docs/wiki/decisions.md:28). PIDs in the
sandbox are single-use with a small batch (wiki/open-questions.md:27), so do
not waste presentations on dry runs.

## 2. Build the relay-branch verifier

```
git -C "$VERIFIER_REPO" status --short
cargo build --release --manifest-path "$VERIFIER_REPO/verifier-service/Cargo.toml"
ZK_ARTIFACTS_OPTIONAL=1 cargo test --manifest-path "$VERIFIER_REPO/verifier-service/Cargo.toml"
```

Binary: $VERIFIER_REPO/target/release/verifier-service

State on 2026-09-08 at commit 8517398 (FACT): release build exit 0; 24 tests
pass and 5 fail without `ZK_ARTIFACTS_OPTIONAL=1` because they want a vector
kit that is not on this Mac (verifier-service/src/zk.rs:928). Those five are
the ZK mdoc path, not the relay path.

## 3. Environment for the relay run

All configuration is clap arguments with env fallbacks
(verifier-service/src/main.rs:20-77 in the verifier relay checkout).
There is no relay mode switch: a session is a relay session when it was
created through `POST /relay/request`, and the response handler branches on
that before any parsing (handlers.rs:150-154). The same process serves
bridge sessions if someone calls `POST /request`; for G0 nobody does.

| Variable | Value for G0 | Why |
|---|---|---|
| PUBLIC_URL | `https://<tunnel-host>/` (trailing slash required, main.rs:28) | request_uri and response_uri in the request object |
| PORT / HOST | 8090 / 127.0.0.1 | 8080 is often taken; the tunnel targets this |
| RP_KEY_PATH | the builder's local secrets location, outside every repository | registrar leaf private key (never in a repo) |
| RP_LEAF_PATH | $VERIFIER_REPO/fixtures/live/access-leaf.pem | registrar-issued leaf, signs the request object |
| RELAY_PICKUP_ONCE | true (default, main.rs:69) | one pickup, then 410 and the ciphertext is dropped |
| RESULT_INCLUDES_PRESENTATION | false | keeps `/result/:id` minimal; the relay path does not use it |
| RESULT_TOKEN | placeholder, set only if the verifier build you run defines it | result endpoint auth being added by the verifier teammate; g0-up.sh passes it through unchanged and never prints it |
| TRUST_ANCHOR_PATH | unset for G0 | see below |
| RUST_LOG | info | one relay log line per stored response (handlers.rs:986) |

EXPECTED_AUD: the verifier has no such variable (FACT, grep over
verifier-service/src). The verifier compares the KB-JWT `aud` with the
request object's `client_id` verbatim on the bridge path
(handlers.rs:386-394, verifier-core/src/verify.rs:197-201). On the relay
path the verifier never opens the response, so the aud check is the
companion's: `prove --aud` or `NACHWEIS_EXPECTED_AUD`, default
`PINNED_AUD = x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI`
(companion/src/util.ts:24, cli.ts:179).

Trust anchor for the sandbox issuer: the repo has no anchor for the
official sandbox issuer. `fixtures/oracle/erica-trust-anchor.pem` is the
ERICA VP-debugger test issuer (`CN=Test PID Issuer (DO NOT USE IN
PRODUCTION)`, FACT from `openssl x509 -subject`), and
`synthetic-pid-anchor.pem` is our own test issuer. Setting either would
reject a real sandbox PID on the bridge path and does nothing on the relay
path (the relay handler stores the JWE unopened, handlers.rs:975-986; the
anchor check lives in the verify path, handlers.rs:352). For G0 the issuer
identity is established by the companion from the `x5c` leaf of the live
presentation (companion/src/statement.ts:38-43) and recorded as the live
issuer key hash, `sha256(0x04 || x || y)` (statement.ts:136,
circuits/pid-sdjwt/src/main.nr:315). Turning that hash into a registry
entry is after G0.

## 4. Expose the verifier over HTTPS

The wallet requires an HTTPS response_uri and cannot dial 127.0.0.1
(scripts/tunnel.sh:4-6 in the verifier relay checkout).
Tunnel tool on this Mac: cloudflared 2026.8.2 exists (FACT, section 1), so
nothing needs installing. Quick tunnels need no account and print a random
`https://<words>.trycloudflare.com` hostname per start.

```
cd <repo root>
scripts/g0-up.sh
```

What it does (scripts/g0-up.sh): checks the key and leaf paths and that the
port is free, builds the verifier if the binary is missing, starts
cloudflared, waits for the hostname, starts the verifier with the table
above and `PUBLIC_URL=https://<host>/`, waits for `/health`, writes
`verifier.pid`, `tunnel.pid`, `verifier.log`, `tunnel.log`, `run.txt` and a
secret-free `env.sh` under
docs/evidence/private/runs/<timestamp>/
(gitignored) and prints the public URL. Alternatives: `TUNNEL=ngrok`
(ngrok 3.39.11 exists, needs an ngrok account token configured), or
`TUNNEL=none PUBLIC_URL=https://boozk-2.tail129b4a.ts.net/` after
`tailscale funnel 8090` (Funnel must be enabled for the tailnet; unverified
here).

Confirm the three startup lines before scanning anything:

```
public url : https://<host>/
client_id  : x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI
cert       : registrar-issued leaf
```

Stop everything with `scripts/g0-down.sh` (newest run directory) or
`scripts/g0-down.sh <run-dir>`. The public hostname dies with the tunnel.

## 5. RP certificate, SAN and what the wallet checks

FACT, from the verifier and the fixture:

- The client identifier scheme is `x509_hash`. The verifier builds it as
  `x509_hash:` plus base64url(no pad) of SHA-256 over the leaf DER
  (verifier-service/src/state.rs:190-192 via the upstream
  `X509HashClient`; mirrored in verifier-core/src/crypto.rs:70-75). The
  wallet metadata advertises only this scheme (state.rs:472-473).
- For `access-leaf.pem` that hash is
  `VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI` (recomputed with openssl on
  2026-09-08), so `client_id = x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI`
  (also README.md:247, verifier-core/tests/core.rs:38).
- The request object is a JWS with `x5c` containing exactly one certificate,
  the leaf (state.rs:191 passes `vec![leaf]`). The registrar CA
  (fixtures/live/ca.txt, `CN=German Registrar`, IssuerAltName
  https://sandbox.eudi-wallet.org) is not included in the chain.
- The leaf's subjectAltName is `DNS:localhost` (openssl on
  fixtures/live/access-leaf.pem), subject `CN=Hackathon - Reza`, valid
  2026-06-02 to 2027-06-02.
- The verifier performs no SAN check anywhere (grep over the repo:
  `x509_san_dns` occurs only as a string in a ZK transcript test,
  verifier-zk/src/transcript.rs:141). The ephemeral cert path sets a SAN
  equal to the PUBLIC_URL host (state.rs:184-187), the registrar-leaf path
  never looks at it.
- The verifier's own caveat: docs/live-phone-path.md:40-42 and :129 say a
  strict SAN check against the tunnel host "can fail" and asks to confirm
  what the live wallet checks.

Spec (OpenID4VP 1.0, client identifier prefixes): with `x509_hash` the
wallet validates the `x5c` chain against its trust anchors and checks that
the SHA-256 of the leaf equals the hash in the client_id. The hostname of
request_uri and response_uri is bound to the certificate only under
`x509_san_dns`, which this verifier does not use. Under `x509_hash` the
DNS SAN is not part of the check.

What must be true for the wallet to accept the request (expected, the run
verifies it):

1. The wallet's trust store contains the sandbox registrar CA that issued
   `access-leaf.pem` (it is a sandbox-issued leaf, so this is expected).
2. The leaf is within validity and not revoked (registration certificate
   `fixtures/live/rc-payload.json`, status list idx 8428; unverified live).
3. `sha256(leaf DER)` equals the hash in `client_id`, which holds by
   construction.
4. `response_uri` is HTTPS, which the tunnel provides.
5. The wallet does not additionally enforce SAN against the request host.
   If it does, the consent screen never appears and the wallet shows a
   certificate or client error: that is fail branch "request rejected",
   and the fix is a registrar leaf whose SAN is a pinned tunnel hostname
   (named cloudflared tunnel or the Tailscale Funnel hostname), not a code
   change.

Separate from acceptance: the KB-JWT `aud` the wallet writes. Spec says it
is the client_id string. The companion pins exactly that value (section 3).
Record the observed `aud` verbatim; a mismatch is fail branch "nonce or aud
mismatch" and the fix is `--aud`.

## 6. The run

### 6.1 Companion shell

```
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"
source <repo root>/docs/evidence/private/runs/<timestamp>/env.sh
cd <repo root>/companion
export NACHWEIS_ADDRESS=0x<the bound Ethereum address, 20 bytes>
```

`env.sh` sets `NACHWEIS_VERIFIER_URL=http://127.0.0.1:8090` and
`NACHWEIS_SESSION=<run-dir>/session.json`. The companion talks to the
verifier locally; the request_uri it receives is on the public host and the
companion fetches it over the tunnel itself (cli.ts:106-109), which is
already a tunnel check.

### 6.2 Request (companion)

```
bun run src/cli.ts request --session "$NACHWEIS_SESSION"
```

Prints: challenge and nonce; "signed request checked: advertises our key,
nonce ..., client_id ..." (cli.ts:107-109); the openid4vp URI; a QR in the
terminal. The nonce is `hex(sha256(address20 || challenge32))`
(companion/src/util.ts:27-30) and the companion refuses to continue if the
verifier computed a different one (cli.ts:104). The session file (0600)
holds the private JWK and the pickup token; it stays under the run
directory, which is gitignored.

Optional: `--challenge <64 hex>` for a fixed challenge, `--redirect-uri` to
have the wallet redirect after posting (the verifier appends a
`response_code`, verifier-service/src/relay.rs:280-297).

### 6.3 Phone

1. Open the official test wallet; confirm a PID is present and note the
   wallet version string (Settings or About).
2. Scan the QR from the companion terminal with the wallet's scanner (or the
   iOS camera; the `openid4vp://` scheme opens the wallet).
3. The wallet fetches the request object over the tunnel, validates the RP
   certificate and shows the consent screen listing the requested claims.
   Photograph or screenshot the consent screen with values masked; note
   the claim names shown.
4. Consent and present. The wallet encrypts to the companion key from
   `client_metadata.jwks` (blind-relay.md) and posts to
   `https://<host>/response/<session>`.
5. If the wallet shows an error instead of the consent screen, write down
   the exact text before tapping anything else. That is the fail evidence.

### 6.4 Wait, pick up, decrypt (companion)

```
bun run src/cli.ts wait --session "$NACHWEIS_SESSION" --timeout 600
bun run src/cli.ts pickup --session "$NACHWEIS_SESSION"
```

`wait` polls `status_url` until `responded` (cli.ts:135-153). `pickup`
sends `X-Pickup-Token` (companion/src/relay.ts:88), decrypts ECDH-ES with
the session's private JWK (companion/src/crypto.ts:79-86, cli.ts:159) and
writes the plaintext into the session file. `--show` prints the
presentation: use it only in a shell whose scrollback is not captured, and
never paste the output anywhere outside the private run directory.

Single-pickup evidence: a second `curl -H "X-Pickup-Token: ..." <pickup_url>`
must answer 410 (main.rs:66-69). Do this once, record the status code only.

### 6.5 Parse and prove (companion)

```
bun run src/cli.ts prove --session "$NACHWEIS_SESSION"
```

Before any circuit work the companion parses the presentation
(companion/src/statement.ts:55-141): vct must equal `urn:eudi:pid:de:1`
(statement.ts:71, default from cli.ts:178), the age claim is expected at
JSON path `age_equal_or_over.18` in one of three disclosure shapes
(statement.ts:96-107), the KB-JWT `aud` must equal the pinned client_id
and the nonce must be the session nonce. Its log line
`statement holds natively (...): over18=..., expiry=..., disclosed claims: ...`
(companion/src/prove.ts:107) is the "parsed claim shape" evidence. The
sizes against the circuit bounds are printed by the generator
(circuits/tools/gen-prover.ts:302-304:
`age shape <A|B|C>; header_b64 <n>/2304, payload <n>/2304, tail <n>/768, kb_header <n>/128, kb_payload <n>/384`).
If that line does not reach the companion output, check the run directory
for the generator log or run the generator directly (its usage is in
circuits/tools/gen-prover.ts; unverified whether the companion relays it).

Bounds, FACT from
circuits/pid-sdjwt/src/constants.nr:
`HEADER_B64_MAX = 2304` (line 4), `PAYLOAD_MAX_LEN = 2304` (line 9),
`TAIL_MAX = 768` (line 15), `KB_HEADER_MAX = 128` (line 18),
`KB_PAYLOAD_MAX = 384` (line 21); used in circuits/pid-sdjwt/src/main.nr:299-313.

If `prove` stops in the statement checks, the message names the failing
check; that message (redacted) is the evidence for the age-shape or bounds
branch. A proof is not required for G0 to pass (criteria 1 to 6), it is
required for the next gate.

### 6.6 Submit (optional, after G0)

`bun run src/cli.ts submit` needs the bridge (NACHWEIS_BRIDGE_URL) and a
wallet key; it is out of scope for the G0 verdict. See
companion/README.md:84-86 for the combined `run` form.

### 6.7 Verifier log check

```
RUN=<run-dir>
NONCE=$(python3 -c "import json;print(json.load(open('$RUN/session.json'))['nonce'])")
grep -c "$NONCE" "$RUN/verifier.log"          # must print 0
grep -ciE 'given_name|family_name|birth|address|age_equal' "$RUN/verifier.log"   # must print 0
grep -c "relay: stored the wallet's encrypted response unopened" "$RUN/verifier.log"   # must print 1
```

The only relay log line is handlers.rs:986 with the session id.

### 6.8 Tear down

```
cd <repo root> && scripts/g0-down.sh
```

## 7. Pass and fail record

G0 passes when all six hold (spec-g0.md):

1. wallet accepted the request and posted (consent screen seen, status
   `responded`),
2. companion picked up the stored response, second pickup answered 410,
3. companion decrypted with its own session key (pickup succeeded; the
   request object advertised that key, cli.ts:107-109),
4. KB-JWT nonce equals `hex(sha256(address20 || challenge))` (prove log),
5. verifier log clean (6.7),
6. companion printed the parsed claim shape (prove.ts:107 line).

Fill docs/evidence/g0-template.md
as `docs/evidence/g0-YYYY-MM-DD-<n>.md`. Record at least: wallet app
version and iOS version; the actual `aud`; the vct literal; the age object
shape and its exact JSON path; the address claim keys present; the five
sizes against the bounds; the issuer key hash the companion computed
(label live); `iat`/`exp`. The fixture hash
`b52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26`
(companion/test/companion.test.ts:84) and the README demo hash
(companion/README.md:66) are fixtures; neither may appear in a live field.

## 8. Decision table after G0

| Observation | Branch | Consequence | Owner |
|---|---|---|---|
| Wallet shows a certificate or client error, no consent screen | request rejected | registrar leaf with a pinned tunnel hostname as SAN, or confirm CA trust; rerun G0 | verifier teammate |
| Consent shown, response arrives, but pickup content is plaintext or a JWE the companion key cannot open (kid or epk not ours) | no client-key encryption | SP1 fallback in verifier mode: the verifier holds the key and sees plaintext; the plaintext boundary is the verifier process on this Mac and must be written into the disclosure; the official-wallet flow still has to be run in that mode with its own evidence | lead |
| Decrypts, but vct differs or the age claim is not at `age_equal_or_over.18` (or empty on iOS, wiki/open-questions.md:27) | age shape unsupported | narrow the claim (birthdate fallback per wiki/decisions.md:32) or change statement.ts and the circuit parser | circuit teammate |
| Decrypts, shape ok, one of the five sizes exceeds its bound | bounds exceeded | WP13 follow-up: raise the bound in constants.nr or trim disclosures; recompile, re-measure | circuit teammate |
| `aud` or nonce mismatch | binding broken | inspect the request object the wallet fetched; `--aud` if the wallet writes a different client_id form | companion teammate |
| Verifier log contains a nonce or a claim name | relay not blind | fix the log path before any evidence is published | verifier teammate |

## 9. Smoke test performed without a phone (2026-09-08)

Run from this worktree at commit 8b53400, verifier commit 8517398:
`scripts/g0-up.sh` started cloudflared and the verifier; `/health` answered
over the tunnel; `bun run src/cli.ts request` created a relay session, the
companion fetched the request object over the public host and confirmed it
advertises the companion key and the nonce; `GET <request_uri>` over the
tunnel returned 200 (5739 bytes); `GET <status_url>` returned
`{"status":"pending","pickup_once":true}`; `GET <pickup_url>` without a
token returned 403; the verifier log contained neither the nonce nor any
claim name; `scripts/g0-down.sh` stopped both and the hostname answered
530 afterwards. Unverified until the phone run: wallet acceptance of the
`localhost` SAN leaf, encryption to the client key, the age shape, the
sizes, the issuer key hash.
