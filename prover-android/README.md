# prover-android: on-phone Noir prover for Attestat (app id org.nachweis.prover, display name Nachweis Prover)

An Android app (Kotlin, Compose, minSdk 30, arm64) that takes the encrypted
EUDI wallet response from the blind relay, decrypts it on the phone, derives
the `pid_sdjwt` circuit inputs, generates the UltraHonk proof on the phone and
submits proof and public inputs to the bridge. The phone holds no Ethereum
key and never sends the presentation anywhere.

Toolchain decision and versions: `TOOLCHAIN.md`. Measurements: below.

## Layout

    ../prover-mobile-core/  shared Rust core (mopro/uniffi): input derivation, witness, UltraHonk keccak proof
    app/         Android app; app/src/main/java/org/nachweis/prover
      circuit/   PublicInputs.kt (86-word decode), IssuerKey.kt (x5c leaf), Codec.kt
      crypto/    EcKeys.kt (P-256 JWK), Jwe.kt (ECDH-ES A128GCM/A256GCM compact decrypt)
      net/       RelayClient.kt (/relay/request, /relay/status, /relay/response), BridgeClient.kt
      prover/    ProverService.kt (asset staging, SRS load, prove)
      ui/        FlowViewModel.kt, Screens.kt (Session, Waiting, Pickup, Prove, Submit)
    app/src/main/java/uniffi/mopro/mopro.kt   generated bindings (gitignored, scripts/build-rust.sh)
    app/src/main/assets/
      pid_sdjwt.json          compiled circuit (nargo 1.0.0-beta.21), committed
      pid_sdjwt_evm.vk        desktop VK, bb write_vk -t evm, committed (1,888 B)
      pid_sdjwt_evm.vk_hash   2e13794a...8a64, equals VK_HASH in contracts/src/noir/PidSdJwtUltraHonkVerifier.sol
      bn254_g1.dat            SRS, 2^20 + 1 points, 64 MB, gitignored (scripts/prepare-assets.sh)
      bn254_g2.dat            128 B
      test-vector.json        prover-sp1/fixtures/realistic-input.json (realistic PID presentation; circuit assets regenerated for WP22)
    scripts/build-rust.sh     cargo ndk build of the core with a Zig linker wrapper, libc++_shared.so, Kotlin bindings
    scripts/prepare-assets.sh SRS and test vector into assets

## Build

Prerequisites: Rust (1.89+), `rustup target add aarch64-linux-android`,
`cargo install cargo-ndk`, Zig (`brew install zig`, the linker for the
Android .so, see `TOOLCHAIN.md`), Android SDK with an NDK (27) and platform
35, JDK 17
(`export JAVA_HOME=...`), network for the first build (barretenberg-rs downloads
`libbb-external.a`, Gradle downloads AGP 8.13.2 / Kotlin 2.2.21).

    cd prover-android
    scripts/prepare-assets.sh          # SRS from ~/.bb-crs or crs.aztec.network
    scripts/build-rust.sh              # prover-mobile-core -> app/src/main/jniLibs/arm64-v8a + java/uniffi/mopro
    ./gradlew testDebugUnitTest        # JWE (RFC 7518 C, round trip), public inputs decode
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

0. Two-device handoff (the investor's browser holds the wallet, this phone proves): paste the
   handoff the web app shows after the wallet signed the bridge session ("Prove on your phone"
   card: the QR's compact JSON `{v:1,s,a,c,r,b}` or the `nachweis://handoff?…` URI) into "Paste
   handoff" and tap "Apply handoff" (`net/Handoff.kt`, unit test `HandoffTest`). The app checks
   the bridge session (`GET /sessions/:id`: exists, still `created`/`presented`, same nonce) and
   fills session id, bound address, challenge, verifier and bridge URLs. "Request presentation"
   then reuses that challenge, so the relay nonce equals the bridge session's nonce, and Submit
   posts `noir-proof` to that session id; the address proof is the browser wallet's, the phone
   never needs an Ethereum key. Scripted: `adb shell am start -n org.nachweis.prover/.MainActivity
   --es handoff '<uri or json>'`, or a `nachweis://handoff?…` link (intent filter). No camera
   scan (would need CameraX on top of zxing; paste and link only).
1. Session: verifier (relay) URL, bridge URL, bound address. "Request
   presentation" generates a P-256 key (in memory) and
   a 32-byte challenge, calls `POST /relay/request`, checks that the returned
   nonce equals `sha256(address || challenge)`.
2. Waiting: the `openid4vp://` URI as QR (cross-device) and as a link
   (same device); polls `GET /relay/status/:id` every 2 s.
3. Pickup: `GET /relay/response/:id` with `X-Pickup-Token` (one-time), JWE
   decrypt (ECDH-ES, A128GCM or A256GCM) with the session key, shows only
   "presentation received, N bytes". The debug checkbox lists the disclosed
   claims.
4. Prove: derives the circuit inputs twice, in Kotlin (`ProverInputs.kt`,
   bounds from the artifact ABI; unit test compares it line by line with the
   `Prover.toml` of `gen-prover.ts`) and in Rust (`prover-mobile-core`
   `derive_inputs`), and refuses to continue if the two TOMLs differ. The
   Rust witness is proved with the bundled desktop VK (keccak, ZK), verified
   on device, and execute time, proof time, wall time and peak RSS
   (`ru_maxrss` of the app process) are shown. The public inputs are checked
   against the derived expectation (subject, nonce, all 86 words).
5. Submit: `POST /sessions` (bound address + the same challenge, so the
   bridge computes the same nonce) if no bridge session exists, then
   `POST /sessions/:id/noir-proof {proof_hex, public_inputs_hex[86]}`
   (`service/src/noir.rs`: decodes the inputs, checks subject, nonce, over18
   and expiry, dry-runs `NoirPidVerifier.verify`, sends `attestWithProof`,
   answers `{status: attested, tx_hash}`), then polls `GET /sessions/:id`
   and shows `state` and `detail`. With `REQUIRE_ADDRESS_PROOF=true` the
   bridge answers 409 until an EIP-191 address proof was posted for the
   session; the phone holds no Ethereum key, so for the phone path use the
   two-device handoff (step 0: the browser wallet signed the session), run the
   bridge with `REQUIRE_ADDRESS_PROOF=false`, or post the address proof from
   the holder's wallet (`companion submit --wallet-key`) for the same session
   id, which the app shows. "Copy proof JSON" puts the same body on the
   clipboard for manual submission (`companion/README.md` has the laptop
   version of this whole flow).

"Load test presentation" on the Session screen skips 1 to 3 with the bundled
realistic vector (`prover-sp1/fixtures/realistic-input.json`, address
`0xf99e...55dc`, issuer key = its `x5c` leaf).

## Measurements

All numbers below are from the ANDROID EMULATOR, not a device: AVD
`pixel_api35` (Android 15, arm64 system image, 8 cores of an Apple M3 Max, 8
GB RAM) on 2026-09-07, WP13 circuit (1,038,584 gates, 2^20), realistic test
vector, `adb shell am start -n org.nachweis.prover/.MainActivity --ez autoprove true`.

| run | execute (witness) | prove (UltraHonk keccak, ZK) | wall (derive + SRS + prove + verify) | peak RSS (ru_maxrss) | on-device verify |
| --- | --- | --- | --- | --- | --- |
| 1, cold (assets copied to app storage first) | 760 ms | 6,924 ms | 10,124 ms (+2.6 s asset copy before) | 1,734 MB | true |
| 2, warm | 755 ms | 6,725 ms | 9,980 ms | 1,752 MB | true |
| 3, "low memory mode" on | 738 ms | 6,724 ms | 9,976 ms | 1,734 MB | true |

- The proof pulled from the emulator (`adb pull /sdcard/Android/data/org.nachweis.prover/files/{proof,public_inputs}`)
  verifies on the desktop with the desktop VK:
  `bb verify -k circuits/pid-sdjwt/out/adapted/vk -p proof -i public_inputs -t evm`
  -> "Proof verified successfully". `public_inputs` is byte-identical to the
  desktop `bb prove` output (2,752 bytes); the proof bytes differ (ZK
  randomness), as expected. Flipping the over18 word makes `bb verify` fail.
- The wall time above execute + prove is the SRS load (64 MB file, 2^20 + 1
  points, done inside `prove` again although cached), JNA marshalling of the
  6,787 witness strings and the on-device verify.
- Low memory mode is a no-op in this core build (the reconciled core only
  sets `BB_SLOW_LOW_MEMORY` in the environment after the library is loaded,
  which Barretenberg reads at startup); memory stays at 1.7 GB. Left in the
  UI so the Pixel run can tell whether a future core build changes it.
- Desktop reference for the same artifact (M3 Max, 16 threads): `bb prove`
  about 5 to 6 s, 2.1 to 2.4 GB RSS. The emulator's 6.7 s comes from 8
  emulated cores; the Pixel 10 (Tensor G5, 8 cores) is expected in the 10 to
  20 s band, which the device run will settle.

## Measured on device (ChromeOS ARC, 2026-09-08)

The first physical device run. Not a phone: the Android container (ARC) of a
Lenovo IdeaPad Duet 3 Chromebook, `ro.product.model` `strongbad`, Android 13
(SDK 33), ChromeOS R151-16733.60.0, arm64-v8a, 3.2 GB RAM (`MemTotal`
3,269,444 kB), 8 cores (`/proc/cpuinfo`: 2x CPU part 0x804 + 6x 0x805, the
Kryo Gold/Silver pair of a Snapdragon 7c Gen 2). Reached over Wi-Fi
(`adb connect 192.168.0.35:5555`; every command below carries
`-s 192.168.0.35:5555` because a headless emulator shares the adb server).
WP22 circuit assets (the committed `pid_sdjwt_evm.vk`, hash `2e13794a...`),
realistic test vector, debug APK 103.7 MB, `adb install -r` took 22 s and
succeeded without any ChromeOS setting beyond ADB debugging.

    adb -s 192.168.0.35:5555 shell am force-stop org.nachweis.prover
    adb -s 192.168.0.35:5555 logcat -c
    adb -s 192.168.0.35:5555 shell am start -n org.nachweis.prover/.MainActivity --ez autoprove true
    adb -s 192.168.0.35:5555 logcat -d -v time NachweisProver:I '*:S'

| run | execute (witness) | prove (UltraHonk keccak, ZK) | wall (derive + SRS + prove + verify) | peak RSS (ru_maxrss) | asset copy + SRS load | on-device verify | killed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1, cold (fresh install, `dumpsys meminfo` every 2 s) | 2,189 ms | 49,038 ms | 59,929 ms | 1,650 MB | 8.4 s | true | no |
| 2, warm (`dumpsys meminfo` every 5 s) | 2,190 ms | 46,950 ms | 57,641 ms | 1,688 MB | 8.5 s | true | no |
| 3, warm (no sampling) | 2,193 ms | 47,566 ms | 58,219 ms | 1,664 MB | 7.6 s | true | no |
| 4, warm, two-device run (handoff + autoprove) | 2,112 ms | 41,352 ms | 51,725 ms | 1,696 MB | 7.1 s | true | no |

- Process start to proof line: 71 s on the cold run (`Start proc` 23:14:09.2,
  proof 23:15:20.6), about 63 s warm. Budget for the demo: one minute of
  "Proving..." on this class of device, versus 10 s on the emulator and 5 s
  with desktop `bb`.
- All three proofs of runs 1 to 3 were pulled
  (`adb -s 192.168.0.35:5555 pull /sdcard/Android/data/org.nachweis.prover/files/proof`,
  same for `public_inputs`) and verify on the Mac with the committed asset VK:
  `bb verify -k prover-android/app/src/main/assets/pid_sdjwt_evm.vk -p proof -i public_inputs -t evm`
  -> "Proof verified successfully" (bb 5.0.0-nightly.20260324). `public_inputs`
  (2,752 B) is identical across the runs and to the desktop output; the proof
  bytes differ per run (ZK randomness).
- Memory: `ru_maxrss` 1.65 to 1.70 GB, the same as the emulator; `dumpsys
  meminfo` sampled at most 1,630 MB TOTAL RSS. On 3.2 GB the container ran
  the proof next to ChromeOS without killing the app: logcat carried 278
  `lowmemorykiller` lines of the form "Skipping kill; 60868 kB freed
  elsewhere" / "cache and free below min for oom_score_adj 950" during the
  first seconds of the SRS load (it reclaimed page cache, killed nothing), 0
  `Killing` lines from ActivityManager, process id unchanged through all
  runs. `android:largeHeap="true"` is already set in the manifest; low memory
  mode was not needed. A second memory-heavy Android app or a large Chrome
  tab in the same session may change that; not tested.
- The 2 s `dumpsys meminfo` sampling of run 1 costs about 2 s of prove time
  versus run 3; run 4 (no sampling, second process of the minute) is the
  fastest at 41 s, so the band on this device is 41 to 49 s prove.
- `adb reverse tcp:8788 tcp:8788` works on ARC (the app reached the Mac's
  bridge and relay at `127.0.0.1`), so `scripts/two-device-local.sh --phone`
  runs unchanged with `ANDROID_SERIAL=192.168.0.35:5555`; see
  `docs/two-device.md`.
- Gotcha hit on the way: `circuits/pid-sdjwt/out/adapted/vk` is a gitignored
  build output. A worktree that still holds the WP13 file makes the
  companion's `bb verify` fail ("verification failed at pairing check")
  although its `nargo compile` is fresh; `bb write_vk -b target/pid_sdjwt.json
  -o out/adapted -t evm` regenerates it (result byte-identical to the
  committed asset VK).

Pixel 10 results: not yet measured (device arrives later); add a row here.


## Device day checklist (Pixel 10; the ARC run above followed steps 2 to 5 and 7 with `adb connect <ip>:5555` instead of USB)

1. Phone: Settings > About phone > tap Build number 7 times; Settings >
   System > Developer options > USB debugging on. Connect USB, accept the RSA
   prompt, `adb devices` shows the phone as `device`.
2. `adb install -r app/build/outputs/apk/debug/app-debug.apk` (arm64-v8a
   APK, about 90 MB with the SRS). No release signing needed for the demo.
3. Cold run: open the app, "Load test presentation", "Derive circuit inputs",
   "Prove on this device", or from the Mac
   `adb shell am start -n org.nachweis.prover/.MainActivity --ez autoprove true`
   and `adb logcat -s NachweisProver:I`. Repeat once warm (`adb shell am
   force-stop org.nachweis.prover` first; the second run skips the asset copy).
4. Record both runs in the table above with the phone's model, Android
   version and whether low memory mode was on.
5. Byte compatibility: `adb pull /sdcard/Android/data/org.nachweis.prover/files/proof`
   and `.../public_inputs` (written after every proof), then
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

- No camera QR scanning (URLs and the handoff are pasted or arrive as an
  intent); the QR the app shows is for the wallet phone to scan.
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
- The app does not sign the EIP-191 address proof (no Ethereum key on the
  phone); see step 5 above.
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
