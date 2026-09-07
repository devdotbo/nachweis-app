# prover-ios: Nachweis on-phone prover for iPhone (WP12)

SwiftUI app (iOS 17+) that requests a PID presentation through the blind
relay, decrypts the wallet's JWE on the phone, derives the pid-sdjwt circuit
inputs, proves with UltraHonk (Barretenberg via `prover-mobile-core`, built
with Mopro) and submits proof and public inputs to the bridge. The phone holds
no Ethereum key; the verifier never sees the presentation.

Toolchain decision and exact versions: `../prover-mobile-core/TOOLCHAIN.md`.

## Layout

```
project.yml                     xcodegen spec -> NachweisProver.xcodeproj (gitignored)
NachweisProver/                 the app
  App/NachweisProverApp.swift   entry, nachweis:// return URL
  Model/FlowModel.swift         session -> waiting -> pickup -> prove -> submit
  Relay/ClientKey.swift         P-256 key: Secure Enclave (device) or CryptoKit (simulator)
  Relay/JWEDecryptor.swift      ECDH-ES + A128GCM, Concat KDF (RFC 7518 4.6)
  Relay/RelayClient.swift       POST /relay/request, GET /relay/status, GET /relay/response
  Bridge/BridgeClient.swift     POST /sessions, GET /sessions/:id, POST /sessions/:id/noir-proof
  Prover/ProverEngine.swift     calls the core, timing, phys_footprint sampling
  Views/ContentView.swift       the five screens, QR code, log
  Resources/pid_sdjwt.json      nargo artifact (beta.21, WP13 circuit), 3.9 MB
  Resources/vk_keccak.bin       desktop `bb write_vk -t evm` output, 1,888 B (VK hash 0x24a16511...)
  Resources/test_input.json     prover-sp1/fixtures/realistic-input.json (23-claim PID, test issuer x5c)
  Resources/bn254_g1.dat        SRS, 2^20 + 1 points, 64 MB (gitignored; scripts/fetch-srs.sh)
NachweisProverTests/            input derivation parity with gen-prover.ts, JWE tests
MoproiOSBindings/               mopro.swift + module shim (committed), xcframework (gitignored)
scripts/build-core.sh           core -> xcframework (simulator, or `device` for both)
scripts/fetch-srs.sh            SRS from ~/.bb-crs or crs.aztec.network (range request)
scripts/verify-desktop.sh       bb verify of a phone proof against the desktop VK
```

## Build and run (simulator)

Prerequisites: Xcode 26.6 with the iOS platform installed (Xcode > Settings >
Components, or `xcodebuild -downloadPlatform iOS`), `xcodegen` (brew), Rust
1.92 with targets `aarch64-apple-ios-sim` and `aarch64-apple-ios`, an iOS
simulator (`xcrun simctl create "iPhone 16 Pro" com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro com.apple.CoreSimulator.SimRuntime.iOS-18-5`).

```
cd prover-ios
scripts/build-core.sh                 # simulator xcframework (first run downloads bb static lib)
scripts/fetch-srs.sh                  # 64 MB SRS into Resources
xcodegen generate
xcodebuild -project NachweisProver.xcodeproj -scheme NachweisProver \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -derivedDataPath build/DerivedData build
xcodebuild ... test                   # unit tests (parity with Prover.toml, JWE KAT and round trip)
xcrun simctl install booted build/DerivedData/Build/Products/Debug-iphonesimulator/NachweisProver.app
xcrun simctl launch booted io.nachweis.prover --autoprove      # test vector, no taps
```

`--autoprove` loads the bundled test presentation and proves; the app writes
`proof`, `public_inputs` and `prove-summary.txt` into its Documents directory
(`xcrun simctl get_app_container booted io.nachweis.prover data`), which
`scripts/verify-desktop.sh proof public_inputs` checks with `bb verify -t evm`.

Or open `NachweisProver.xcodeproj` in Xcode, pick the simulator, Run.

## Flow in the app

1. Session: bridge URL, verifier (relay) URL, bound address, optional issuer
   key override (empty: x5c leaf), optional `aud` (empty: circuit default),
   redirect URI. Request, in the companion CLI's order: random 32-byte
   challenge, P-256 key (Secure Enclave when available, the ECDH runs inside
   it; CryptoKit in memory on the simulator), `POST /relay/request` with the
   public JWK, the challenge and `redirect_uri`.
2. Waiting: QR of `openid4vp_uri` for a second phone, or "Open in wallet" on
   the same phone; polls `GET /relay/status/:id` every 2 s. The wallet's
   redirect to `nachweis://return?response_code=...` brings the app back and
   moves to pickup (the code is compared with the one from creation).
3. Pickup: `GET /relay/response/:id` with `X-Pickup-Token` (one time),
   decrypt ECDH-ES A128GCM or A256GCM with CryptoKit (Concat KDF, AAD =
   protected header), extract the SD-JWT from `vp_token`. Shows
   "presentation received, N bytes" only.
4. Prove: `derive_inputs` in the core (same as `circuits/tools/gen-prover.ts`),
   then `prove` with the bundled artifact, SRS and keccak VK. Shows witness
   time, bb time, total, peak footprint, local verification, proof hash.
5. Submit: `POST /sessions {bound_address, challenge_hex}` with the same
   challenge (bridge nonce = KB-JWT nonce), then
   `POST /sessions/:id/noir-proof {proof_hex, public_inputs_hex[86], tier: 1}`
   (`service/src/noir.rs`), then polls `GET /sessions/:id` and shows the
   state until `attested`. With `REQUIRE_ADDRESS_PROOF=true` the bridge
   answers 401 until the investor's browser has posted the EIP-191 address
   proof for that session; the phone holds no key.

"Load test presentation" skips 1 to 3 with the bundled synthetic vector.

## Results

MEASUREMENTS_PLACEHOLDER

## Install on the iPhone (free development signing)

The build signs with the "Apple Development" identity of team JTVRXAL73A
already on this Mac (`project.yml`, `CODE_SIGN_STYLE Automatic`). With a free
Apple ID the profile is valid for 7 days and at most 3 apps; no Developer
Program membership needed.

1. Xcode needs the iOS platform of the phone's iOS version installed
   (Xcode > Settings > Components; a "iOS 26.x is not installed" error on the
   device destination means this step).
2. Build the device slice of the core: `scripts/build-core.sh device`
   (adds `aarch64-apple-ios` to the xcframework), then `xcodegen generate`.
3. Plug in the iPhone, unlock it, tap "Trust this computer". In Xcode
   choose the phone as destination; on first use enable Developer Mode on the
   phone (Settings > Privacy & Security > Developer Mode, reboot). Xcode
   registers the device with the team automatically (Signing & Capabilities
   shows the provisioning profile; if it says the bundle id is taken, change
   `PRODUCT_BUNDLE_IDENTIFIER` in `project.yml`).
4. Run. The first launch fails with "Untrusted Developer": on the phone go
   to Settings > General > VPN & Device Management, tap the developer app
   entry, Trust. Launch again.
5. Command line alternative: `xcodebuild -scheme NachweisProver -destination 'platform=iOS,name=<phone name>' -allowProvisioningUpdates build`
   then `xcrun devicectl device install app --device <udid> <path>.app` and
   `xcrun devicectl device process launch --device <udid> io.nachweis.prover --autoprove`.

## Device checklist (iPhone 16 Pro Max)

- [ ] iOS platform for the phone's iOS version installed in Xcode 26.6
- [ ] `scripts/build-core.sh device` done, xcframework has `ios-arm64` and `ios-arm64-simulator`
- [ ] Developer Mode on, computer trusted, developer profile trusted
- [ ] Run with `--autoprove`, read `prove-summary.txt` (or the Prove screen): time, peak footprint, local verify
- [ ] Pull `proof` and `public_inputs` (Xcode > Devices > app > download container, or the Share button on the Prove screen), run `scripts/verify-desktop.sh`
- [ ] Record device numbers below and in the wiki
- [ ] Optional: bridge and verifier reachable from the phone (same Wi-Fi, LAN IP instead of localhost), full relay flow with the wallet on the same phone (`redirect_uri nachweis://return`) or a second phone (QR)
- [ ] Memory: the prover needs about 2 GB; iOS lets a foreground app on a 8 GB phone use that, the simulator has no limit. Watch for Jetsam kills; try "bb low-memory mode" if it dies

## What is stubbed or not done

- Submit was exercised against the request shape in `service/src/noir.rs`,
  not against a running bridge with anvil (the companion README's four-process
  recipe); the address proof step is the browser's.
- Universal link return (https) is not set up; the custom scheme
  `nachweis://return` is. A universal link needs an apple-app-site-association
  on the verifier domain and the Associated Domains entitlement (paid team).
- The issuer key comes from the x5c leaf (the circuit does not check the
  chain, the contract pins issuerKeyHash); the override field exists because
  the synthetic test vector is signed with a fresh key.
- Circuit revisions (wp13): the app reads bounds and witness order from
  `pid_sdjwt.json`; replace that file and `vk_keccak.bin`, set the `aud`
  field to the registered client_id, re-run the parity test with the new
  `Prover.toml`. No Swift constants to change.
- The proof is not sent to NoirPidVerifier directly (no key on the phone).
- No JAR signature check of the relay request (the client could fetch
  `request_uri` and verify the JAR carries its own JWK, see blind-relay.md).
- The SRS is bundled, not downloaded on first run.

## Licences

App code: MIT (repository). Core and its dependencies: see
`../prover-mobile-core/README.md` (noir crates MIT/Apache-2.0, barretenberg
Apache-2.0, mopro-ffi MIT/Apache-2.0, uniffi MPL-2.0). Circuit: MPL-2.0
derivative of eid-privacy/zkp-pocs.
