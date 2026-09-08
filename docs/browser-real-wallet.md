# Browser run with the official wallet

The last missing evidence run: the official German test wallet on the iPhone answers the web
app's own relay request. The tab (Chrome on the Mac) creates the relay request, shows the QR,
picks up and decrypts the wallet's answer, proves with bb.js (the WP29 path,
`docs/spec-browser-prover.md`), posts the proof to the bridge, the issuer approves in the app,
the investor subscribes. Everything except the wallet and the tunnel runs on this Mac against a
local anvil. Nothing touches a public chain.

Two commands:

```
scripts/browser-real-wallet-up.sh          # prints the app URL, the public tunnel URL, the run directory, the click sequence
scripts/browser-real-wallet-down.sh        # stops what up started, leaves the logs
```

## 1. Prerequisites

Same as `docs/g0-runbook.md`, section 1, plus the app's toolchain:

- The relay-branch verifier worktree at
  /Users/bioharz/git/ethglobal/nachweis-verifier-relay with a release build (`g0-up.sh` builds it
  when the binary is missing; it does not rebuild an existing one).
- The registrar leaf and its key: /Users/bioharz/git/ethglobal/nachweis-verifier-relay/fixtures/live/access-leaf.pem
  and /Users/bioharz/git/eudi-wallet-hackathon/secrets/rp.key (`RP_LEAF_PATH`, `RP_KEY_PATH`).
  The wallet accepted this leaf over a trycloudflare host in G0.
- `cloudflared` on PATH (`brew install cloudflared`), or `TUNNEL=ngrok`, or `TUNNEL=none
  PUBLIC_URL=https://host/` for a named tunnel.
- Foundry (`anvil`, `forge`, `cast`), `cargo`, `bun`, `jq`, `curl`, `openssl`, `xxd`, `python3`;
  `node_modules` in `app/` and `companion/` (`bun install`, the script runs it when missing).
- Google Chrome on the Mac (the measured browser; Playwright's Chromium is the smoke-test browser).
  Not Safari, not Firefox: the browser path needs `crossOriginIsolated` with `SharedArrayBuffer`
  and about 3 GB of renderer memory.
- The iPhone with the official test wallet and a PID from the sandbox issuer, on any network
  that reaches the internet (the wallet talks only to the tunnel host).
- No other stack on the same ports: the script picks free ports for the verifier, anvil, the
  bridge and the app, so the Android run on 8545 and 8788 can stay up.

## 2. What the up script starts

1. `scripts/g0-up.sh` with the run directory
   `docs/evidence/private/runs/<timestamp>-browser` (gitignored) and a free verifier port:
   cloudflared quick tunnel first, then the verifier in relay mode with `PUBLIC_URL` set to the
   tunnel host, the registrar leaf, `RELAY_PICKUP_ONCE=true`. Set `G0_ENV=<run dir>/env.sh` of a
   g0-up run that is still up to reuse its verifier and tunnel instead.
2. A probe `POST /relay/request` against the local verifier with a throwaway key: the returned
   `request_uri`, `status_url` and `pickup_url` must be under the `PUBLIC_URL` host, otherwise the
   script stops. (The verifier builds all three from `PUBLIC_URL`, `handlers.rs:927-933`.)
3. anvil, `Deploy.s.sol` (registry, FundToken, Subscription; operator anvil key 0),
   `DeployNoirVerifier.s.sol` with `PID_ISSUER_KEY_HASH` pinned to the sandbox PID issuer
   `0xb4f2bfa1df99f06e588d39931b2cfd517a2befe8737c7f86bfa5c668d2abe079` (live value from
   `docs/evidence/g0-2026-09-08.md`; override with the environment variable),
   `EudiAllowlistChecker(registry, POLICY, 3)`.
4. The bridge in local mode: `REQUIRE_ADDRESS_PROOF=true`, `NOIR_VERIFIER`, a fresh
   `BRIDGE_ISSUER_TOKEN` written to `<run dir>/issuer-token` (0600, never printed),
   `HANDOFF_VERIFIER_URL` pointing at the local verifier.
5. The Vite dev server with COOP `same-origin` and COEP `require-corp` (checked with a HEAD
   request), `VITE_VERIFIER_URL=http://127.0.0.1:<verifier port>`, `VITE_BRIDGE_URL`,
   `VITE_RPC_URL`, the contract addresses, and the dev signer keys: anvil key 1 as the investor,
   anvil key 0 as the operator. The issuer approves with `registry.approve` from the page
   (`app/src/lib/chain.ts`), so the app never needs the bridge's issuer token; the token only
   guards the bridge's own `approve`, `revoke` and `attest-operator` routes.
6. A wait for `GET <public url>health` over the tunnel (up to 180 s, `TUNNEL_WAIT_SECS`): a quick
   tunnel registers at once but its hostname takes one to two minutes to resolve, and the tab
   fetches the request object over that host right after the first click.

Hosts as the tab sees them: `POST /relay/request` goes to the local verifier; `GET request_uri`,
the status polls and the one-time pickup go to the tunnel host, the same host the wallet uses;
the bridge session and the `noir-proof` POST go to the local bridge; the RPC reads go to anvil;
bb.js downloads the CRS from `crs.aztec-cdn.foundation` on the first proof. Nothing else leaves
the tab (allowlist in `app/e2e/browser-prover.spec.ts`).

The script prints the app URL, the public URL, the run directory and the click sequence; it
writes `<run dir>/run.txt` (URLs, addresses, commit, no secrets), `env.sh` and `env.json` (for
the Playwright spec).

## 3. The run

On the Mac, in Chrome, open the app URL. Then:

1. Card 1 "Connect wallet": "Connect dev signer". The header chip shows the investor
   `0x7099...79C8`; card "Eligibility" shows "not permitted". If it shows anything else, the anvil
   already holds a decision for this address: run down and up again.
2. Card 2 "Present your ID": "Create presentation request". The dev signer signs
   `nachweis:session:<id>` in the page; the card shows "signed, sent to bridge" and the session id.
3. Card 2b "Prove in this browser" is the selected path (the picker's "In this browser" is
   pressed; on a page without COOP and COEP the card explains why not and offers the phone
   path instead). Click "Prove in this browser". The phase turns to `waiting` and the card shows
   the wallet QR, the `request_uri` (on the tunnel host) and the `client_id` (the registrar one,
   `x509_hash:VE3q...`).
4. Phone: open the official test wallet, scan the QR (the wallet's scanner or the iOS camera; the
   `openid4vp://` scheme opens the wallet). The wallet fetches the request object over the
   tunnel, shows the consent screen with the three requested claims (given name, family name,
   age over 18), consent, present. Note the wallet version string.
5. The tab: `relay status: responded`, then `pickup`, `checking`, `witness`, `init` (the CRS
   download on the first proof in this profile), `proving`, `verifying`, `submitting`,
   `submitted`, and after the next 2 s poll "attested from this browser". About 30 s from the
   status flip on the measured M3 Max (`docs/spec-browser-prover.md`, "Measured numbers"). Card
   "Eligibility" shows "evidence on chain, awaiting issuer approval", both doors closed.
6. Header: "Issuer". The chip shows the operator `0xf39F...2266`. Card "Presentations": the
   session shows "attested (awaiting issuer approval)"; click "Approve". The operator dev key sends
   `registry.approve`; the status turns to "approved".
7. Header: "Investor". "Eligibility" shows "permitted"; card "Two doors, one decision": the
   Subscribe door is "open"; click "Subscribe"; "tx confirmed" and the FundToken balance rises.

Optional checks from a shell (`source <run dir>/env.sh`):

```
cast call --rpc-url $RPC_URL $REGISTRY "statusOf(address,bytes32)(bool,bool,bool,uint64)" \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f
cast call --rpc-url $RPC_URL $CHECKER "checkAllowlist(address,address)(bytes2)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 $FUND_TOKEN
curl -s $BRIDGE_URL/sessions/<session id> | jq '{state, proof_system, approved, tx_hash}'
```

Expected: `statusOf` `(true, true, false, <expiry>)` after the approval (`(true, false, false,
<expiry>)` between attest and approve), the checker `0x0003`, the bridge session `attested` then
`approved` with `proof_system` `noir-ultrahonk`.

## 4. Evidence to record

Copy the raw material into the run directory first (it is gitignored), then write a sanitized
record as `docs/evidence/browser-YYYY-MM-DD.md` following `docs/evidence/README.md`. Record:

- Setup: app commit (`run.txt`), verifier commit (`run.txt` from g0-up), tunnel hostname (a
  random trycloudflare host may stay), `client_id`, wallet app version, iOS version, phone
  model, Chrome version, the issuer key hash NoirPidVerifier was pinned to (label live).
- From card 2b: the timings line (`witness`, `bb_init`, `prove`, `verify`, `jwe_decrypt`,
  `precheck`, `gen_inputs` in ms, threads, cross-origin isolated), the proof size and the public
  input count from the `proof` row, `over 18`, `expiry`, the attest tx hash. The card's log holds
  only phase names, byte counts and milliseconds; copy it whole. The `subject`, `issuer key hash`
  and `nonce` rows are public inputs and may be recorded.
- Wall clock: from the click to `submitted` and to "attested from this browser" (a stopwatch or
  the timestamps in the card's log, first and last line).
- Approve and subscribe tx hashes (from the Issuer card and the doors card, or
  `cast receipt`), `statusOf` before and after the approval, the checker value.
- Verifier log check as in `docs/g0-runbook.md` 6.7: the nonce and the claim names must not
  appear; the line "relay: stored the wallet's encrypted response unopened" must.
  `grep -ci 'given_name\|family_name\|eyJ' <run dir>/verifier.log <run dir>/bridge.log` must be 0
  for both.
- The list of requests the tab made, if you want it: Chrome DevTools, Network, filter by the
  verifier port, the tunnel host and the bridge port; the expected set is in
  `docs/spec-browser-prover.md`, "Measured numbers".

Never commit: the run directory, the `issuer-token` file, the JWE or anything from the pickup, a
screenshot of the consent screen with values, the request object with its `state`.

## 5. Fail branches

| Observation | Cause | What to do |
|---|---|---|
| up stops at "relay probe: request_uri ... is not under PUBLIC_URL" | the verifier was started without the tunnel's `PUBLIC_URL` | do not reuse a stale `G0_ENV`; run down and up again |
| up stops with "did not answer within 180 s" | the quick tunnel registered but the hostname never resolved (cloudflare side) | run down and up again for a new hostname; `TUNNEL_WAIT_SECS` raises the wait; `TUNNEL=ngrok` is the alternative |
| card 2b says the page is not cross-origin isolated | not the dev server, or an extension broke the headers | open the printed app URL in a plain Chrome profile; `curl -I <app url>` must show both headers |
| card 2b shows "iOS Safari caps wasm memory" | the page was opened on the phone | the browser path runs in Chrome on the Mac; the phone only scans the QR |
| the wallet shows a certificate or client error, no consent screen | request rejected | same branch as G0 (`docs/g0-runbook.md`, section 8): check the leaf and the `client_id` in `verifier.log` |
| the wallet consents, the tab stays in `waiting` | the wallet's `direct_post` did not reach the verifier | `curl <status_url>` from the card; `verifier.log` shows the POST or not; check the tunnel log |
| `pickup` fails with 410 | the response was already picked up (a second attempt after a first pickup) | one pickup per relay session: click "Try again", which creates a new relay request; scan again |
| `checking` fails ("issuer", "vct", "aud", "age", "KB") | the presentation differs from the shape the statement check expects | the message names the check; compare with the G0 record's observed shapes; the companion's `pickup` and `prove` on the same session give the same verdict with more detail |
| `proving` fails or the tab crashes | memory: the proof needs about 3 GB in the renderer | close other tabs, retry; the phone prover or the desktop companion are the fallbacks |
| `submitting` fails with 400 from the bridge | `NoirPidVerifier.verify` dry run failed: usually the issuer key hash pin | `run.txt` shows the pinned hash; the card's "issuer key hash" row shows the proof's; they must match (sandbox `0xb4f2...e079`) |
| `submitting` fails with `NonceConsumed` | the same address and challenge were attested before on this anvil | down and up: fresh chain |
| Approve does nothing | the Issuer view is not connected as the operator | the chip must show `0xf39F...2266`; the dev signer switches with the role |
| Subscribe reverts | the approval did not land, or the decision expired | `statusOf` from section 3; `approved` must be true |

## 6. Tear-down

```
scripts/browser-real-wallet-down.sh            # newest *-browser run directory
scripts/browser-real-wallet-down.sh <run dir>  # a specific one
```

Stops the app, the bridge, anvil, then the verifier and the tunnel through `g0-down.sh` (unless
they were reused through `G0_ENV`; then it says so and leaves them). The public hostname is gone
afterwards. The logs, `env.json` and the issuer token stay in the run directory; delete the
directory once the evidence record is written.

## 7. Smoke test without the phone

`scripts/browser-real-wallet-up.sh --stub-issuer` pins NoirPidVerifier to a fresh companion test
issuer (`<run dir>/issuer.json`) instead of the sandbox issuer, and the Playwright spec plays the
wallet with `companion mint-test-presentation --request-uri <the tab's request_uri>` (the request
object is fetched and the JWE posted over the tunnel host, as the phone would):

```
scripts/browser-real-wallet-up.sh --stub-issuer
cd app && APP_E2E_ENV=<run dir>/env.json bunx playwright test e2e/browser-prover.spec.ts
scripts/browser-real-wallet-down.sh
```

The spec (`app/e2e/browser-prover.spec.ts`) accepts the split hosts through `verifierPublicUrl`
in `env.json`: the relay POST must go to the local verifier, the request object, status and
pickup GETs to the public host, and nothing else may leave the tab. It writes
`<run dir>/browser-timings.json`.

Result (2026-09-08, M3 Max, app at 3998714 plus this branch, verifier relay branch 7262a32,
cloudflared quick tunnel, Playwright Chromium 153 headless, cold profile): up in 11 s (the tunnel
hostname answered at once this time; the first attempt of the evening took longer than 30 s, hence
the 180 s wait), the spec passed in 41.9 s. Worker timings in ms: `jwe_decrypt` 1, `precheck` 1,
`gen_inputs` 1, `witness` 1,282, `bb_init` 10,273 (CRS download included), `prove` 10,909,
`verify` 3,943, 16 threads, cross-origin isolated; click to `submitted` 30.5 s, click to
`attested` 32.4 s, in line with runs A to D in `docs/spec-browser-prover.md`. Requests the tab
made between the click and `attested`: `POST http://127.0.0.1:<verifier>/relay/request`,
`GET https://<tunnel>/request/<id>`, `GET https://<tunnel>/relay/status/<id>` (2),
`GET https://<tunnel>/relay/response/<id>`, the three CRS files, the bridge session poll and the
RPC reads, `POST http://127.0.0.1:<bridge>/sessions/<id>/noir-proof`; nothing else. After the
issuer's Approve and the investor's Subscribe, `statusOf` read `(true, true, false, 1820439128)`;
the verifier log held one "stored the wallet's encrypted response unopened" line and no claim
name; the bridge log no claim name. `down` stopped all five processes; nothing was left behind.
