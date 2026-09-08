# Two devices: browser wallet, phone prover (WP14)

The phone prover (prover-android, prover-ios) holds no Ethereum key. The bridge requires an
EIP-191 address proof from the bound address before it attests (`REQUIRE_ADDRESS_PROOF`), so the
phone's proof must land in a session the investor's browser already bound to their wallet. This
is the handoff that closes that gap; recorded on 2026-09-07 (M3 Max, anvil, verifier-service in
blind-relay mode, bridge debug build, Android emulator `pixel_api35`).

## Flow

1. Browser (app/, bridge mode): `POST /sessions {bound_address}` at the bridge; the wallet signs
   `nachweis:session:<id>` (EIP-191), `POST /sessions/:id/address-proof`. Unchanged.
2. Browser: `GET /sessions/:id/handoff` and the "Prove on your phone" card next to the wallet QR:
   a QR with the compact handoff JSON and the same as a copyable URI.
3. Phone: scans or pastes the handoff, requests the presentation from the relay
   (`POST /relay/request`) with the handoff's bound address and the SAME 32-byte challenge, so the
   KB-JWT nonce `sha256(address20 || challenge32)` equals the bridge session's nonce. Shows the
   wallet QR itself, picks up and decrypts the JWE, proves with the Noir circuit on the phone.
4. Phone: `POST /sessions/<handoff session id>/noir-proof {proof_hex, public_inputs_hex[86]}`. The
   bridge checks subject and nonce against the session, dry-runs `NoirPidVerifier.verify`, sends
   `attestWithProof`. The address proof is the browser's; the phone never signs anything for Ethereum.
5. Browser: the existing `GET /sessions/:id` poll flips to `attested` (evidence on chain, awaiting
   issuer approval; the doors stay closed).
6. Issuer: approves in a separate step, from the app (registry.approve with the operator signer)
   or `POST /sessions/:id/approve` with the bridge's issuer token. Only then is the address
   eligible; revoke withdraws it and only the issuer can re-approve.

## Handoff shape

Compact JSON, in the QR (keys in this order):

    {"v":1,"s":"<session_id uuid>","a":"0x<bound address, 40 hex>","c":"<challenge, 64 hex, no 0x>","r":"<verifier url>","b":"<bridge url>"}

URI, for copy and paste or as a link:

    nachweis://handoff?v=1&s=<session_id>&a=0x<address>&c=<challenge>&r=<url-encoded verifier>&b=<url-encoded bridge>

Bridge endpoint `GET /sessions/:id/handoff` (200 only while the session is `created` or
`presented` and younger than 600 s; 409 otherwise, 404 unknown):

    {"session_id", "bound_address", "challenge_hex", "nonce", "verifier_url", "bridge_url", "expires_at",
     "address_verified", "state", "uri"}

`verifier_url` is `HANDOFF_VERIFIER_URL` (else `VERIFIER_URL`, else null: the phone keeps its own),
`bridge_url` is `HANDOFF_BRIDGE_URL` (else scheme and `Host` of the request; the emulator needs
`http://10.0.2.2:<port>`). Every parser (app/src/lib/handoff.ts, companion/src/handoff.ts,
prover-android `net/Handoff.kt`) accepts all three forms, lowercases the address, strips a `0x`
from the challenge, recomputes the nonce and rejects a `nonce` field that disagrees, `v` other
than 1, a non-UUID session, a challenge that is not 32 bytes, and non-http(s) URLs. `r` and `b`
are optional (the phone falls back to its typed URLs).

What the phone checks before using a handoff (`companion handoff`, Android "Apply handoff"):
`GET /sessions/:id` exists, `state` is `created` or `presented`, `nonce` equals the handoff's,
`bound_address` equals the handoff's; it warns when `address_verified` is false (the bridge will
answer 409 to the proof unless it runs with `REQUIRE_ADDRESS_PROOF=false`).

## Run on this machine

    scripts/two-device-local.sh            # companion as the phone
    scripts/two-device-local.sh --phone    # plus the Android emulator (app installed, adb attached)

The script builds verifier-service and the bridge (release, every run), runs `bun install` in
`companion/` when `node_modules` is missing (a fresh checkout), and exits with a `FAIL:` line
naming the command and line whenever a step fails. It starts anvil (8545; `FAIL` if the port is
taken, set `ANVIL_PORT`), deploys `AttestationRegistry` and a `NoirPidVerifier` pinned to a
fresh companion test issuer, starts verifier-service (relay, 8091) and the bridge (8788,
`REQUIRE_ADDRESS_PROOF=true`, `HANDOFF_VERIFIER_URL`), then plays the browser with curl and
`cast wallet sign` (anvil key 1 is the investor) and the phone with
`companion handoff "<handoff json>" --stub-wallet`. Asserts afterwards, independently of the
companion's output: `GET /sessions/:id` is `attested` with `proof_system noir-ultrahonk` and
`approved false`, `isEligible(investor, POLICY, 3)` is false until `POST /sessions/:id/approve`
with the issuer token (`BRIDGE_ISSUER_TOKEN`, script default `local-issuer-token`; 401 without it)
makes it true, false for an unrelated address, the handoff now answers 409, revoke closes it and
approve reopens it, and the verifier and bridge logs carry no plaintext marker.

## Real presentation from the official wallet

`scripts/real-proof-local.sh` plays the same route with the presentation the official German test
wallet produced in the G0 run (docs/evidence/g0-2026-09-08.md) instead of a minted one. It takes
the companion session file as `SESSION=/path/to/session.json` (no default: that file holds the
presentation and the client key and lives in the private, gitignored run directory
`docs/evidence/private/runs/<timestamp>/` of the main checkout; the script refuses a path inside
the repository except under `.e2e/`). Only `bound_address`, `challenge_hex`, `nonce`,
`session_id` and the `proof` object are read; the presentation is never printed or copied.

    SESSION=/path/to/private/runs/<timestamp>/session.json scripts/real-proof-local.sh [--keep]

Proof cache: the companion's `prove` writes the proof into the session file itself (`proof`:
`proof_hex`, `public_inputs_hex`, the decoded public inputs, the issuer's SEC1 key, timings) and
keeps its work files in `proof-<first 8 of the relay session id>/` next to it. The script runs
`prove` only when `proof` is missing (`PROVE_FLAGS="--kb-window 0"` for a stale KB-JWT) and then
uses the cached proof on every run. No verifier-service is needed: the presentation was already
picked up, so the flow starts at the bridge.

What it does, each step timed: pins `NoirPidVerifier` to the proof's `issuer_key_hash` (checked
against sha256 of the recorded SEC1 key; `PID_ISSUER_KEY_HASH` overrides), deploys
`EudiAllowlistChecker(registry, POLICY, 3)` next to `FundToken` and `Subscription`, starts the
bridge in local mode with a fresh random `BRIDGE_ISSUER_TOKEN` and `REQUIRE_ADDRESS_PROOF=true`,
creates the bridge session with the session file's own challenge (so the bridge nonce equals the
nonce inside the proof), signs `nachweis:session:<id>` with anvil key 1 (the bound address
0x7099...79C8), and posts `{proof_hex, public_inputs_hex, tier}` to `POST /sessions/:id/noir-proof`,
the body the companion's `submit` sends. Assertions, in order: proof before the signature 409;
`statusOf` (evidence true, approved false, revoked false, expiry); `isEligible` false;
`subscribe()` reverts; `checkAllowlist` 0x0000; approve without token 401; approve; `statusOf`
approved; `isEligible` true (stranger false); `subscribe()` mined with an NDF balance;
`checkAllowlist` 0x0003 (swap | liquidity, stranger 0x0000); revoke; `statusOf` revoked and
approval cleared; `isEligible` false; `subscribe()` reverts `NotEligible`; checker 0x0000;
re-approve reopens all three; the same proof on a second session is refused (registry
`NonceConsumed`, 502 from the bridge); 0 plaintext markers in the bridge log. Ends with
`REAL-PROOF-LOCAL PASS`, gas figures and `summary.json` in `RUN_DIR` (default `.e2e/real-proof`).

The replay check found a nonce gap after the reverted `attestWithProof` (alloy's cached nonce
filler, 2026-09-08); fixed in e8baf6a, the bridge now reads the nonce from the chain before every send.

## Recorded timeline, companion as the phone

    [   0.25 s] anvil on http://127.0.0.1:8545
    [   1.63 s] AttestationRegistry 0x5FbDB2315678afecb367f032d93F642f64180aa3, NoirPidVerifier 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853
    [   2.15 s] verifier-service (relay) on http://127.0.0.1:8091
    [   2.39 s] bridge on http://127.0.0.1:8788 (debug build, REQUIRE_ADDRESS_PROOF=true)
    [   2.43 s] browser: bridge session 954c50f2-7e93-4c58-aa74-a8c7e5a51c40 for 0x7099...79C8, nonce 4f42a435...e75362
    [   2.48 s] browser: wallet signed nachweis:session:954c50f2-... (EIP-191, anvil key 1), bridge set address_verified
    [   2.50 s] browser: handoff {"session_id":"954c50f2-...","bound_address":"0x7099...79c8","challenge_hex":"ce7d4e15...e029",
                "nonce":"4f42a435...e75362","verifier_url":"http://127.0.0.1:8091","bridge_url":"http://127.0.0.1:8788","expires_at":1788815997}
    [   2.52 s] phone (companion): request with the handoff's challenge, stub wallet, pickup, prove, submit to session 954c50f2-...
                    0.01 s  +  0.01 s  bridge session checked (address_verified true)
                    0.01 s  +  0.00 s  relay session created                 (POST /relay/request with the handoff's address and challenge; relay nonce == handoff nonce)
                    0.02 s  +  0.01 s  stand-in wallet posted the JWE
                    0.02 s  +  0.00 s  wallet responded (status responded)
                    0.02 s  +  0.00 s  JWE picked up
                    0.02 s  +  0.00 s  JWE decrypted locally
                    7.52 s  +  7.50 s  proved (bb prove 4.29 s)
                    8.17 s  +  0.65 s  attested on chain (tx 0x12f3503a...626a5f)   (POST noir-proof to the handoff session; no new session, no address proof)
                    8.18 s  +  0.00 s  bridge session attested
    [  10.94 s] assert: session attested (noir-ultrahonk) in 0x12f3503a..., gas 4,582,908; isEligible(investor) true, isEligible(stranger) false; handoff now 409
    [  10.95 s] assert: plaintext markers in verifier and bridge logs: 0
    TWO-DEVICE (companion) OK

The first run of the day proved in 20.2 s (cold nargo and bb caches); the run above is the second.

## Recorded timeline, Android emulator as the phone

The bundled test vector's address `0xf99e...55dc` has no known private key and its issuer key is
not in the repo, so this phase deploys a second `NoirPidVerifier` pinned to the vector's issuer
hash (`0xb5235958...fd26`, the deploy script default), points the registry at it, and restarts the
bridge with `REQUIRE_ADDRESS_PROOF=false` and handoff URLs at `10.0.2.2`. With a real wallet
presentation on the phone the first phase's bridge (address proof required) applies unchanged.

    [  11.46 s] phone (emulator): NoirPidVerifier 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e registered for the policy
    [  11.78 s] phone (emulator): bridge restarted with REQUIRE_ADDRESS_PROOF=false
    [  11.81 s] browser: session 8f8e9230-f253-4ee7-9d2b-543508796979 bound to 0xf99e...55dc (vector challenge);
                handoff URI nachweis://handoff?v=1&s=8f8e9230-...&a=0xf99e...55dc&c=7426bd0e...9df2&b=http%3A%2F%2F10.0.2.2%3A8788&r=http%3A%2F%2F10.0.2.2%3A8091
    [  11.88 s] phone (emulator): adb shell am start -n org.nachweis.prover/.MainActivity --es handoff '<uri>'
    23:10:08  app: handoff: bridge session 8f8e9230-... bound to 0xf99e...55dc, address proof missing, nonce 306863157ddb59f4...
              (Session screen: "Joined bridge session 8f8e9230-...", verifier and bridge URLs filled from the handoff)
    23:11:12  app: test presentation loaded, 4966 bytes                        (tap "Load test presentation")
    23:11:27  app: inputs derived: 6787 witness values, issuer_key_hash 0xb5235958..., expiry 1819756800, nonce 0x306863157ddb59...
    23:11:46  app: SRS ready: 1048577 points; proving
    23:11:56  app: proof 10304 B, 86 public inputs, execute 712 ms, prove 6660 ms, wall 9986 ms, peak RSS 1729 MB, on-device verify true
    23:15:08  app: noir-proof accepted: {"attested":{"attester":"0xf39f...2266","bits":"0x3","expiry":1819756800,...}
    23:15:08  app: bridge state: attested attested in 0x150d6db1284451cd32d57a59ead9d1764ee5cb55aac028a680c63c0ebe6c16f2
    [ 313.60 s] assert: phone session 8f8e9230-... attested in 0x150d6db1..., gas 4,582,800; isEligible(0xf99e...55dc) true
    TWO-DEVICE (emulator) OK

The three minutes between proof and submit are the operator driving the emulator over adb
(`uiautomator dump` for button bounds, `input tap`); the app itself submits in under a second.
The phone's proof carried the bridge session's nonce because the handoff's challenge equals the
vector's, which is the whole point: the KB-JWT nonce binds the proof to the session the browser
signed.

## Recorded timeline, ChromeOS ARC device as the phone (2026-09-08)

Same script, `ANDROID_SERIAL=192.168.0.35:5555 scripts/two-device-local.sh --phone --phone-timeout 900`,
with the Android container of a Lenovo IdeaPad Duet 3 Chromebook (`strongbad`, Android 13, 3.2 GB,
Snapdragon 7c Gen 2) attached over Wi-Fi (`adb connect 192.168.0.35:5555`). `adb reverse` works on
ARC, so the handoff URLs stayed at `127.0.0.1` and the device reached the Mac's relay and bridge
through the adb connection; no LAN IP and no bind change were needed. Device numbers in
`prover-android/README.md`, "Measured on device".

    [  12.78 s] phone (device 192.168.0.35:5555): adb reverse for ports 8091 and 8788
    [  13.11 s] phone (emulator): bridge restarted with REQUIRE_ADDRESS_PROOF=false
    [  13.14 s] browser: session 72eb3db9-1998-4e30-967e-3b2be065a21f bound to 0xf99e...55dc (vector challenge);
                handoff URI nachweis://handoff?v=1&s=72eb3db9-...&a=0xf99e...55dc&c=7426bd0e...9df2&b=http%3A%2F%2F127.0.0.1%3A8788&r=http%3A%2F%2F127.0.0.1%3A8091
    [  13.56 s] phone: app started with the handoff
    23:21:35  app: handoff: bridge session 72eb3db9-... bound to 0xf99e...55dc, address proof missing, nonce 306863157ddb59f4...
    23:22:23  operator: adb shell am force-stop, then am start ... --ez autoprove true --es handoff '<uri>'
              (autoprove and the handoff in one intent: load vector, derive, prove; the handoff joins the session in parallel)
    23:22:24  app: handoff applied again (same session), inputs derived, copying assets / loading SRS
    23:22:31  app: SRS ready: 1048577 points; proving
    23:23:23  app: proof 10304 B, 86 public inputs, execute 2112 ms, prove 41352 ms, wall 51725 ms, peak RSS 1696 MB, on-device verify true
    23:23:48  operator: input tap "Continue to submit" (bounds from uiautomator dump), 23:23:53 "Submit to bridge"
    23:23:53  app: noir-proof accepted: {"attested":{"attester":"0xf39f...2266","bits":"0x3","expiry":1819756800,...}
    23:23:53  app: bridge state: attested attested in 0x49204192f8ca6c5aa914c3f71a00953a62ad27c6e41ebd84a9c53b6226610246, awaiting issuer approval
    [ 153.66 s] assert: phone session 72eb3db9-... attested in 0x49204192..., gas 4,583,016; isEligible(0xf99e...55dc) false before and true after the issuer approved
    TWO-DEVICE (emulator) OK

Of the 140 s phone phase, 52 s is the proof on the device, 8 s SRS load, under 1 s the submit
(tap to `attested`), and the rest is the operator (relaunch, uiautomator dump, taps). The bridge
attested from the device's proof: the same `POST /sessions/:id/noir-proof` body the emulator
sent, dry-run through `NoirPidVerifier.verify` and mined by `attestWithProof`.

Before this run the companion phase failed once with `bb verify` "verification failed at pairing
check": the worktree's gitignored `circuits/pid-sdjwt/out/adapted/vk` was the WP13 file while
`nargo compile` had produced the WP22 circuit. `bb write_vk -b target/pid_sdjwt.json -o out/adapted
-t evm` in `circuits/pid-sdjwt` fixed it (the result equals the committed
`prover-android/app/src/main/assets/pid_sdjwt_evm.vk`). The companion writes the VK only when the
file is missing, so a stale one survives a circuit change.

## What the iOS app mirrors

- Parse the same two forms (compact JSON `{v,s,a,c,r,b}` and `nachweis://handoff?…`), plus the
  bridge body; lowercase address, strip `0x` from the challenge, recompute and cross-check the nonce.
- Before using it: `GET /sessions/:id`, require `created` or `presented`, matching `nonce` and
  `bound_address`; show whether `address_verified` is set.
- The relay request must use the handoff's bound address and challenge verbatim; refuse if the
  relay's nonce differs from the handoff's.
- Submit posts `noir-proof` to the handoff's session id; never `POST /sessions`, never an address
  proof. A 409 means the browser has not signed yet.
- Optional: register the `nachweis://` URL scheme so the URI opens the app; a paste field is enough
  for the demo.

## Known state

- `cargo test --test anvil noir_proof` fails on `main` before this branch (the stored Noir fixture
  proof answers 422 from the `NoirPidVerifier.verify` dry run against the current `contracts/out`);
  the handoff assertions live in the mock pipeline test, which passes.
- No camera scan on Android (paste, clipboard button, `--es handoff`, `nachweis://` link). A scan
  would need CameraX on top of zxing.
