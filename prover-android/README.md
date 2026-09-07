# prover-android: on-phone Noir prover for Nachweis

An Android app (Kotlin, Compose, minSdk 30, arm64) that takes the encrypted
EUDI wallet response from the blind relay, decrypts it on the phone, derives
the `pid_sdjwt` circuit inputs, generates the UltraHonk proof on the phone and
submits proof and public inputs to the bridge. The phone holds no Ethereum
key and never sends the presentation anywhere.

Toolchain decision and versions: `TOOLCHAIN.md`. Measurements: below.

## Layout

    ../prover-mobile-core/  Rust cdylib (uniffi), shared with the iOS app: Prover.toml -> witness -> UltraHonk keccak proof
    app/         Android app; app/src/main/java/org/nachweis/prover
      circuit/   ProverInputs.kt (port of circuits/tools/gen-prover.ts), PublicInputs.kt, IssuerKey.kt
      crypto/    EcKeys.kt (P-256 JWK), Jwe.kt (ECDH-ES A128GCM/A256GCM compact decrypt)
      net/       RelayClient.kt (/relay/request, /relay/status, /relay/response), BridgeClient.kt
      prover/    ProverService.kt (asset staging, SRS load, prove)
      ui/        FlowViewModel.kt, Screens.kt (Session, Waiting, Pickup, Prove, Submit)
      core/      generated uniffi bindings (gitignored, scripts/build-rust.sh)
    app/src/main/assets/
      pid_sdjwt.json          compiled circuit (nargo 1.0.0-beta.21), committed
      pid_sdjwt_evm.vk        desktop VK, bb write_vk -t evm, committed (1,888 B)
      pid_sdjwt_evm.vk_hash   c0d55f4d...5018, equals contracts/test/fixtures/noir/vk_hash.bin
      bn254_g1.dat            SRS, 2^20 + 1 points, 64 MB, gitignored (scripts/prepare-assets.sh)
      bn254_g2.dat            128 B
      test-vector.json        prover-sp1/fixtures/input.json (synthetic PID presentation)
    scripts/build-rust.sh     cargo ndk build + libc++_shared.so + uniffi Kotlin bindings
    scripts/prepare-assets.sh SRS and test vector into assets

## Build

Prerequisites: Rust (1.89+), `rustup target add aarch64-linux-android`,
`cargo install cargo-ndk`, Android SDK with NDK 27 and platform 35, JDK 17
(`export JAVA_HOME=...`), network for the first build (barretenberg-rs downloads
`libbb-external.a`, Gradle downloads AGP 8.13.2 / Kotlin 2.2.21).

    cd prover-android
    scripts/prepare-assets.sh          # SRS from ~/.bb-crs or crs.aztec.network
    scripts/build-rust.sh              # prover-mobile-core -> app/src/main/jniLibs/arm64-v8a + bindings
    ./gradlew testDebugUnitTest        # ProverInputs vs Prover.toml, JWE, public inputs
    ./gradlew assembleDebug            # app/build/outputs/apk/debug/app-debug.apk

Host check of the Rust core (proves the committed vector, writes the proof for
`bb verify`):

    cd prover-mobile-core && cargo test --release -- --nocapture
    bb verify -k ../../circuits/pid-sdjwt/out/adapted/vk -p target/host-proof/proof -i target/host-proof/public_inputs -t evm

`circuits/pid-sdjwt/target` and `out/adapted` come from the commands in
`circuits/README.md`; `REFRESH_CIRCUIT=1 scripts/prepare-assets.sh` copies a
regenerated circuit and VK into the assets (do this together with the
Solidity verifier).

## Install and run

    adb install -r app/build/outputs/apk/debug/app-debug.apk
    adb shell am start -n org.nachweis.prover/.MainActivity

Emulator: `~/Library/Android/sdk/emulator/emulator -avd pixel_api35 -memory 8192 -cores 8`
(AVD `pixel_api35`: Pixel 8 profile, `system-images;android-35;google_apis;arm64-v8a`,
8 GB RAM, 8 cores; created with `avdmanager create avd -n pixel_api35 -k
"system-images;android-35;google_apis;arm64-v8a" -d pixel_8`, then
`hw.ramSize=8192`, `hw.cpu.ncore=8` in `~/.android/avd/pixel_api35.avd/config.ini`).
From the emulator the host is `10.0.2.2` (defaults in the Session screen:
verifier `http://10.0.2.2:8080`, bridge `http://10.0.2.2:8787`).

## Flow in the app

1. Session: verifier (relay) URL, bridge URL, bound address, optional issuer
   key override. "Request presentation" generates a P-256 key (in memory) and
   a 32-byte challenge, calls `POST /relay/request`, checks that the returned
   nonce equals `sha256(address || challenge)`.
2. Waiting: the `openid4vp://` URI as QR (cross-device) and as a link
   (same device); polls `GET /relay/status/:id` every 2 s.
3. Pickup: `GET /relay/response/:id` with `X-Pickup-Token` (one-time), JWE
   decrypt (ECDH-ES, A128GCM or A256GCM) with the session key, shows only
   "presentation received, N bytes". The debug checkbox lists the disclosed
   claims.
4. Prove: derives `Prover.toml` like `circuits/tools/gen-prover.ts` (unit test
   compares both line by line for the test vector), solves the witness, proves
   with the bundled desktop VK, verifies on device, shows witness time, proof
   time, wall time and peak RSS (`VmHWM` of the app process). Public inputs
   are decoded and the nonce and subject are compared with the expected ones.
5. Submit: `POST /sessions` (bound address + the same challenge) on the bridge
   if no session exists, then `POST /sessions/:id/noir-proof
   {proof_hex, public_inputs_hex[]}` and polls `GET /sessions/:id` until
   `attested` or `failed`. "Copy proof JSON" puts the same body on the
   clipboard for manual submission.

"Load test presentation" on the Session screen skips 1 to 3 with the bundled
synthetic vector (address `0xf99e...55dc`, the issuer key override from the
vector, since the synthetic credential is not signed by its `x5c` leaf).

## Measurements

EMULATOR_RESULTS_PLACEHOLDER

## Device day checklist (Pixel 10)

1. Phone: Settings > About phone > tap Build number 7 times; Settings >
   System > Developer options > USB debugging on. Connect USB, accept the RSA
   prompt, `adb devices` shows the phone as `device`.
2. `adb install -r app/build/outputs/apk/debug/app-debug.apk` (arm64-v8a
   APK, about 90 MB with the SRS). No release signing needed for the demo.
3. Cold run: open the app, "Load test presentation", "Derive circuit inputs",
   "Prove on this device". Read witness / prove / wall / peak RSS from the
   screen or `adb logcat | grep -i nachweis`. Repeat once warm (the second
   run skips the asset copy and the SRS load is cached in the process).
4. Record both runs in the table above with the phone's model, Android
   version and whether low memory mode was on.
5. Byte compatibility: "Copy proof JSON", `adb shell` clipboard or paste into
   a file on the Mac, split into `proof` and `public_inputs` (hex to bytes),
   `bb verify -k circuits/pid-sdjwt/out/adapted/vk -p proof -i public_inputs -t evm`.
6. Wallet path (needs the verifier service with the registrar leaf reachable
   from the phone, see `nachweis-verifier-relay/docs/blind-relay.md`): enter
   the public verifier URL, "Request presentation", scan the QR with the
   wallet phone or tap the link on the same device, "Pick up and decrypt",
   then prove and submit as above. If the wallet refuses the relay's
   `client_metadata.jwks`, that is the open question in the relay doc, not
   an app bug.
7. Memory watch: `adb shell dumpsys meminfo org.nachweis.prover` during the
   proof; if the process is killed, retry with "Low memory mode".

## What the app does not do

- No camera QR scanning of a verifier URL (URLs are typed or pasted); the QR
  the app shows is for the wallet phone to scan.
- No Android Keystore key: ECDH key agreement in the Keystore needs API 31,
  and the key lives for one session; it stays in process memory.
- No `redirect_uri` handling for the same-device return; the app polls
  status instead.
- No local verification of the presentation beyond what the circuit proves
  (issuer signature, disclosure digest, KB-JWT nonce and signature). Issuer
  trust (x5c chain), status list and KB-JWT freshness are the bridge's job.
- No wallet or relay interaction was exercised end to end on a real wallet
  yet; the relay client follows `docs/blind-relay.md` and the JWE code is
  unit tested against RFC 7518 appendix C and a self-encrypted round trip.
- The bridge endpoint `POST /sessions/:id/noir-proof` is being added on
  branch wp5-companion; the client implements the agreed shape. Until it is
  merged, the Submit step answers 404 and "Copy proof JSON" is the way out.
- x86_64 emulator images are not built by default (`ABIS="arm64-v8a x86_64"
  scripts/build-rust.sh` adds them; barretenberg-rs has a prebuilt
  x86_64-android library).

## Licences

- `prover-mobile-core/` and `app/` are new code for this repository (repository licence).
- The structure of the Rust core follows `zkmopro/noir-rs` `main`
  (MIT/Apache-2.0); no file is copied.
- The reference app `eid-privacy/zkp-android` (MPL-2.0) was read for its
  Mopro/uniffi layout, Gradle setup and the JNA dependency; the Gradle
  wrapper scripts (`gradlew`, `gradlew.bat`, `gradle-wrapper.jar`) were
  copied from it, which are Gradle's own Apache-2.0 files. No MPL-2.0 source
  is included.
- `barretenberg-rs` and the prebuilt Barretenberg static library are
  Apache-2.0 (Aztec); Noir crates MIT/Apache-2.0; zxing core Apache-2.0;
  OkHttp Apache-2.0; JNA Apache-2.0/LGPL-2.1.
