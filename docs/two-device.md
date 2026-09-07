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
5. Browser: the existing `GET /sessions/:id` poll flips to `attested`.

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

The script starts anvil (8545), deploys `AttestationRegistry` and a `NoirPidVerifier` pinned to a
fresh companion test issuer, starts verifier-service (relay, 8091) and the bridge (8788,
`REQUIRE_ADDRESS_PROOF=true`, `HANDOFF_VERIFIER_URL`), then plays the browser with curl and
`cast wallet sign` (anvil key 1 is the investor) and the phone with
`companion handoff "<handoff json>" --stub-wallet`. Asserts afterwards, independently of the
companion's output: `GET /sessions/:id` is `attested` with `proof_system noir-ultrahonk`,
`isEligible(investor, POLICY, 3)` is true and false for an unrelated address, the handoff now
answers 409, and the verifier and bridge logs carry no plaintext marker.

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
