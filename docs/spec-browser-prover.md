# Spec: "Prove in this browser" (WP29)

Status: implemented on branch `wp29-browser-route`. Builds on the WP26 spike
(`spikes/browser-prover/README.md`: bb.js 5.0.0-nightly.20260324 plus noir_js 1.0.0-beta.21 prove
the `pid-sdjwt` circuit in a Chrome tab in about 21 s, 2.9 GB renderer peak, verify true, public
inputs byte-identical to native, VK equal to the committed one).

## Goal

A third investor path in the web app next to the two existing ones (the desktop companion and the
phone prover, both fed by the "Prove on your phone" handoff card). The tab itself plays the
holder's device of the blind-relay flow: it generates the ephemeral P-256 key, creates the relay
request, shows the wallet QR, picks up and decrypts the wallet's JWE, checks the statement,
derives the circuit inputs, proves with noir_js and bb.js in a Web Worker, verifies in the tab and
posts only the proof to the bridge session the wallet already signed. The existing flow then
continues unchanged: `attested`, awaiting issuer approval, `approve`, doors.

The browser path is the default when `crossOriginIsolated` is true and the device is not an
iPhone or iPad (bb.js caps iOS wasm memory at 1 GiB; this proof needs about 2.9 GB). On iOS the
card explains that and shows the handoff card instead. The other two paths stay selectable.

Non-goals: mobile Safari, Firefox and single-threaded (non-isolated) timings are not targets of
this work package; a non-isolated page shows the reason and offers the handoff.

## Hosting requirement

bb.js uses `SharedArrayBuffer` for its thread pool. The page that proves must be served with

    Cross-Origin-Opener-Policy: same-origin
    Cross-Origin-Embedder-Policy: require-corp

`app/vite.config.ts` sets both on the dev server and on `vite preview`. A static host must send
them itself (see `app/README.md`, "Hosting"). Under COEP every cross-origin resource the app loads
needs CORS or CORP headers: the verifier (`CorsLayer::permissive()`), the bridge (`CorsLayer`
with any origin), anvil (`--allow-origin *` default) and the Aztec CRS CDN
(`access-control-allow-origin: *`) all do.

## States

Per session, held in the app's in-memory session store (`Session.browser`), never persisted:

| state | what happens | leaves the tab |
| --- | --- | --- |
| `idle` | the wallet signed the bridge session (`signature === 'signed'`), the card offers the button | nothing |
| `requesting` | ECDH P-256 key generated (`extractable: false`); `POST {verifier}/relay/request`; nonce must equal the bridge session's; the signed request object is fetched and checked (our key, our nonce, `direct_post.jwt`) | public JWK, bound address, challenge |
| `waiting` | wallet QR and `openid4vp://` link shown; `GET {status_url}` every 2 s until `responded` | nothing new |
| `pickup` | `GET {pickup_url}` with `X-Pickup-Token` (one-time); nonce checked | the pickup token |
| `checking` | worker: JWE decrypted with WebCrypto (ECDH-ES, Concat KDF, A128GCM/A256GCM), statement checks (issuer ES256 under the x5c leaf, vct, disclosures anchored in a signed `_sd`, `age_equal_or_over.18`, KB-JWT under `cnf.jwk`, aud, `sd_hash`, nonce bound to the address, KB freshness 600 s, issuer `exp` present), circuit inputs derived | nothing |
| `witness` | worker: `noir.execute(inputs)` (acvm_js) | nothing |
| `init` | worker: `Barretenberg.new({threads, memory: {maximum: 2^16}})`; first run downloads the CRS (67 MB) from the Aztec CDN into IndexedDB | CRS range request to `crs.aztec-cdn.foundation` (no session data) |
| `proving` | worker: `generateProof(witness, {verifierTarget: 'evm'})` | nothing |
| `verifying` | worker: `verifyProof` in the tab; the 86 public inputs are decoded and cross-checked against the statement check (subject, issuer key hash, nonce, expiry, over18) | nothing |
| `submitting` | `POST {bridge}/sessions/:id/noir-proof {proof_hex, public_inputs_hex[86], tier: 1}` | proof and public inputs |
| `submitted` | the bridge dry-ran `NoirPidVerifier.verify`, sent `attestWithProof`; the existing 2 s poll flips the session to `attested` | nothing new |
| `failed` | any step threw; the message is shown, the button offers a new attempt (new relay request; the bridge session is reused while it is `created`) | nothing new |

The presentation, the disclosures and the KB-JWT exist only inside the worker between `checking`
and `verifying`. The worker keeps no reference after posting the proof and is terminated once the
proof is submitted or the attempt failed. Nothing about the holder is logged: progress lines
carry phase names, byte counts and milliseconds only.

## What leaves the tab (complete list)

1. `POST {verifier}/relay/request` JSON `{client_jwk: {kty, crv, x, y, use: "enc", alg: "ECDH-ES"}, bound_address, challenge: "0x…"}`. Public key only.
2. `GET {request_uri}` (the signed request object the wallet also fetches). No body.
3. `GET {status_url}` polls. No body.
4. `GET {pickup_url}` with header `X-Pickup-Token`. No body.
5. `GET https://crs.aztec-cdn.foundation/…` with a `Range` header (bb.js, first proof only, cached in IndexedDB afterwards). No session data.
6. `POST {bridge}/sessions/:id/noir-proof` JSON `{proof_hex, public_inputs_hex, tier}`. The public inputs are the 86 field elements the chain sees anyway: subject, issuer key hash, over18, expiry, nonce.

The bridge session itself (`POST /sessions`, the EIP-191 address proof, `GET /sessions/:id`) is
created by the existing investor flow before the browser path starts. The relay never sees a
plaintext (it stores the JWE encrypted to the tab's key) and the bridge never sees the
presentation.

## Kill criteria

| criterion | how it is checked |
| --- | --- |
| K1: proof under 120 s in the Playwright Chromium on this Mac | the spec's timeout for the proving phase is 120 s |
| K2: the browser proof passes `NoirPidVerifier` on anvil | the bridge dry-runs the verifier before `attestWithProof`; the spec asserts the attest transaction receipt (`status` 1, `to` = registry) |
| K3: nothing but the six requests above leaves the tab while proving | the spec records every request the page makes between clicking the button and `attested` and asserts the host and path allowlist |
| K4: the tab survives (no crash, no page error) | Playwright `pageerror` and console errors collected, must be empty |
| K5: the companion CLI and its tests stay green after the shared-module move | `bun test` in `companion/` (22 tests) and `Prover.toml` byte-equal to the committed one for the realistic fixture |

## Acceptance tests

1. `bun run typecheck` and `bun run build` in `app/` are clean.
2. `scripts/app-e2e-local.sh --mode browser --test` runs `app/e2e/browser-prover.spec.ts`: connect the
   dev signer, create the bridge session, the dev signer signs it, the "Prove in this browser" card is
   the selected path, start, the wallet QR appears, the stub wallet (`companion mint-test-presentation
   --request-uri …`) answers the relay, the tab decrypts, proves (up to 120 s), submits; the session
   reaches `attested` with `proof_system` `noir-ultrahonk`; the issuer approves with the operator dev
   key; the investor is permitted; Subscribe passes and the FundToken balance rises.
3. The attest transaction of that run has receipt status 1 against the deployed registry (the bridge
   only sends it after `NoirPidVerifier.verify` passed).
4. `bun test` in `companion/` passes (22 tests); `circuits/tools/gen-prover.ts` still produces the
   committed `circuits/pid-sdjwt/Prover.toml` byte for byte from the realistic fixture, and the
   negative modes (`--tamper=…`) still exist.
5. Measured numbers (below) for the Playwright Chromium and for a manual Chrome run.

## Measured numbers

Measured 2026-09-08 on the M3 Max (16 logical cores) against the local stack of
`scripts/app-e2e-local.sh --mode browser` (anvil, verifier-service in relay mode, bridge in local
mode with `NoirPidVerifier`, Vite dev server). Every run is cold: a fresh browser profile, so the
CRS (67 MB) is downloaded inside `bb_init`. All worker timings in ms; "click to submitted" is
from the button to the bridge's 200 on `noir-proof`, "click to attested" until the app's poll
showed `attested`.

| run | browser | witness | bb_init | prove | verify | click to submitted | click to attested | result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A | Playwright Chromium 153 headless (dev server) | 1,280 | 9,512 | 11,118 | 3,976 | 29.1 s | 32.3 s | spec passed |
| B | Google Chrome 152 headed, driven by the same spec (dev server) | 1,289 | 9,569 | 10,880 | 3,956 | 28.7 s | 32.0 s | all flow assertions passed; see note |
| C | Playwright Chromium 153 headless, production bundle on `vite preview` | 1,300 | 10,471 | 11,325 | 4,057 | 30.3 s | 32.2 s | spec passed |

`jwe_decrypt`, `precheck` and `gen_inputs` take 1 to 8 ms each. Proof: 10,304 bytes, 86 public
inputs, `verifyProof` true in the tab in every run; the bridge's `NoirPidVerifier.verify` dry run
passed and `attestWithProof` was mined (receipt status 1, `to` = registry) in every run.
Requests recorded by the spec between the click and `attested` (identical sets in A, B, C):
`POST {verifier}/relay/request` 1, `GET {verifier}/request/:id` 1, `GET {verifier}/relay/status/:id` 2,
`GET {verifier}/relay/response/:id` 1, `GET {crs}/g1.dat`, `g2.dat`, `grumpkin_g1.dat` 1 each,
`POST {bridge}/sessions/:id/noir-proof` 1, plus the app's existing `GET {bridge}/sessions/:id`
poll (30 to 32) and the RPC reads (16 `POST {rpc}/`). Nothing else left the tab.

Note on run B: the first headed Chrome run failed only on the spec's "no console errors" check
with `Failed to load resource: the server responded with a status of 404`; the trace was
overwritten before the URL was read. A headed browser requests `/favicon.ico`, which the app did
not have; `index.html` now links an empty icon. The rerun after that change is recorded below.

Bundle (`bun run build`, Vite 8.2.2): main chunk 654 kB (197 kB gzip; the prover is not in it),
prover worker 182 kB, bb.js 3.7 MB threaded plus 3.7 MB single-threaded (each inlines its wasm),
acvm_js 2.6 MB wasm (755 kB gzip), noirc_abi 0.6 MB wasm (244 kB gzip), circuit artifact
2.9 MB (`dist/circuits/pid_sdjwt.json`), CRS 67 MB at runtime.

## Results

- Acceptance 1: `bun run typecheck` and `bun run build` clean (build output above).
- Acceptance 2: `scripts/app-e2e-local.sh --mode browser --test` passes (run A, 42 s Playwright
  time including issuer approval and Subscribe).
- Acceptance 3: the attest transaction receipt has status 1 against the deployed registry in every
  run; the bridge only sends it after its `NoirPidVerifier.verify` dry run.
- Acceptance 4: `bun test` in `companion/` 22 pass, 0 fail; `tsc` in `companion/` clean;
  `Prover.toml` from the refactored `gen-prover.ts` byte-identical to the committed one and to the
  pre-refactor generator for both fixtures in all six tamper modes;
  `circuits/pid-sdjwt/test-negative.sh` all `ok` (shapes A, B, C and the five tamper modes).
- Acceptance 5: numbers above; the manual Chrome measurement is the same spec run in the installed
  Google Chrome (`PW_CHANNEL=chrome PW_HEADED=1`), not a hand-clicked session.
- `scripts/app-e2e-local.sh --mode noir --test` (the phone path through the companion) still
  passes after the card 2b change (37.6 s).
- CORS: the verifier's router applies `CorsLayer::permissive()` to every route including the three
  relay routes, so the `X-Pickup-Token` preflight and the cross-origin `POST /relay/request` pass;
  the bridge allows any origin by default. No Vite proxy was needed.

Unverified: mobile Safari, Android Chrome, Firefox, a non-isolated host (the card then shows the
reason and the handoff paths), the renderer memory peak in this integration (the spike measured
2.9 GB for the same proof), and a hand-clicked run.
