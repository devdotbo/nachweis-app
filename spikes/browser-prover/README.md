# Spike: the pid-sdjwt proof inside a Chrome tab

Question: can the client-side Noir proof of the PID presentation (circuit `circuits/pid-sdjwt`,
2^20 gates) run in a browser tab, so the web app decrypts the wallet's JWE and proves without the
desktop companion? Today the proof runs in the companion CLI (bun, native `bb`).

Answer, measured on 2026-09-08 on the M3 Max in Chrome 152: yes. 21 to 22 s from click to a
verified proof, 11 s of that is proving, 2.9 GB renderer RSS, the tab survives, the proof verifies
natively with the committed VK, public inputs and VK are byte-identical to the native run. All
kill criteria pass. Everything here runs on synthetic data (the realistic fixture minted by the
companion, `prover-sp1/fixtures/realistic-input.json`); no real presentation is involved.

## Setup

Pinned packages (see `package.json`):

| package | version | why |
| --- | --- | --- |
| `@aztec/bb.js` | `5.0.0-nightly.20260324` | the same tag as the native `bb 5.0.0-nightly.20260324` (one aztec-packages commit, tag `v5.0.0-nightly.20260324`); `noir-lang/noir` at `v1.0.0-beta.21` pins the same string in `scripts/install_bb.sh` and `examples/browser/package.json` |
| `@noir-lang/noir_js` | `1.0.0-beta.21` | matches `nargo 1.0.0-beta.21`; pins `acvm_js`, `noirc_abi`, `types` at the same version |
| `vite` | 7.3.6 | dev server with COOP/COEP headers and a result sink |

The published noir docs page for noirjs still names beta.20 and `bb.js@3.0.0-nightly.20251104`; it
was not followed for versions.

bb.js API at this tag (`dest/browser/barretenberg/backend.d.ts`): `Barretenberg.new({ threads, memory })`,
`new UltraHonkBackend(bytecode, api)`, `generateProof(witness, { verifierTarget: 'evm' })` (the
`keccak`/`keccakZK` booleans are deprecated aliases; `'evm'` is the ZK keccak flavour of
`bb prove -t evm`), `verifyProof`, `getVerificationKey`. Threads: bb.js uses
`navigator.hardwareConcurrency` (max 32) only when `crossOriginIsolated` is true, otherwise it falls
back silently to the single-threaded wasm. The wasm memory maximum is 2^16 pages (4 GiB, the wasm32
ceiling); on iPhone/iPad user agents bb.js caps it at 2^14 pages (1 GiB).

Files:

- `scripts/prepare-inputs.ts`: copies the committed compiled circuit
  (`prover-android/app/src/main/assets/pid_sdjwt.json`, hash 4525284671767482784, identical to
  `nargo compile` on the current source), runs `circuits/tools/gen-prover.ts` on the fixture and
  converts its `Prover.toml` 1:1 into noir_js's InputMap (`public/generated/inputs.json`), and
  encrypts the presentation the way the wallet does (`companion/src/mint.ts` `answerAsWallet`:
  `{vp_token: {...}}`, ECDH-ES, A128GCM, jose) to a fresh P-256 key (`public/generated/jwe.json`,
  private JWK next to it).
- `src/jwe.ts`: compact JWE decryption with plain WebCrypto (ECDH deriveBits, Concat KDF, AES-GCM
  with the protected header as AAD), no library.
- `src/main.ts`: the page. Decrypts the JWE, checks the decrypted issuer payload equals the circuit
  input, generates the witness with noir_js, proves with bb.js (`verifierTarget: 'evm'`, all
  cores), verifies in the tab, exports the VK, prints timings and the 86 public inputs, POSTs proof,
  public inputs and VK to the dev server.
- `vite.config.ts`: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy:
  require-corp`, `optimizeDeps.exclude` for the wasm packages, and the `/__spike/result` sink that
  writes `results/run-<ts>/{proof,public_inputs,vk,report.json}`.
- `measurements/runs.json`: the three measured runs plus the warm-up run and the native reference.

Run it:

    cd spikes/browser-prover
    bun install
    bun run prepare-inputs          # public/generated/{circuit,inputs,jwe}.json
    bun run dev                     # http://127.0.0.1:5175, click the button
    # native check of a browser proof:
    bb verify -k ../../prover-android/app/src/main/assets/pid_sdjwt_evm.vk \
      -p results/run-<ts>/proof -i results/run-<ts>/public_inputs -t evm

The CRS is fetched by bb.js at runtime from `https://crs.aztec-cdn.foundation` (range request,
`numPoints * 64` bytes, about 67 MB for 2^20 points, `access-control-allow-origin: *` so it works
under COEP) and cached in IndexedDB.

## Numbers

Native reference on the same inputs (`bb prove -t evm`, 16 threads, `/usr/bin/time -l`): 4.13, 4.09,
4.03 s real, 2,231, 2,182, 2,226 MiB max RSS. `bb write_vk -t evm` on the recompiled circuit equals
the committed VK byte for byte (sha256 c3c7bff0..., vk_hash 2e13794a... = `VK_HASH` in
`contracts/src/noir/PidSdJwtUltraHonkVerifier.sol`). Public inputs sha256
4ea8becf... = `contracts/test/fixtures/noir/public_inputs.bin`.

Browser, Chrome 152.0.0.0, `crossOriginIsolated: true`, 16 threads, page reloaded before each run
(CRS and wasm already cached from the warm-up run):

| run | witness | bb init | prove | verify in tab | click to verified | renderer RSS peak | tab |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 1,129 ms | 728 ms | 11,253 ms | 4,373 ms | 21.95 s | 2,883 MiB | survived |
| B | 1,161 ms | 751 ms | 11,233 ms | 4,048 ms | 21.56 s | 2,912 MiB | survived |
| C | 1,122 ms | 708 ms | 11,043 ms | 4,011 ms | 21.14 s | 2,915 MiB | survived |

JWE decryption (WebCrypto): 1 ms. Loading the 3.95 MB circuit JSON from localhost: 16 ms.
Exporting the VK in the tab: about 4 s (not needed in the app, the chain holds the VK).

Warm-up run (cold: first wasm load, CRS download from the CDN): bb init 10,647 ms, prove 11,376 ms,
verify 4,031 ms, renderer RSS peak 2,965 MiB. Its wall time is not comparable because the page then
still polled `performance.measureUserAgentSpecificMemory`, which Chrome delays by up to tens of
seconds per call; that sampler was replaced before runs A to C.

Memory: the renderer RSS was sampled with `ps` every 0.5 s (the only measurement that includes the
bb.js worker wasm memory). `performance.memory` (main-thread JS heap) peaked at 250 to 310 MiB;
`measureUserAgentSpecificMemory` taken after proving reported 288 to 339 MiB, i.e. bb.js had
already released the proving memory. The 2.9 GB peak is below the 4 GiB wasm32 ceiling by about
1.1 GB; native bb needs 2.2 GB for the same proof.

Proof: 10,304 bytes, 86 public inputs, in every run. Decoded public inputs in every run: subject
0xf99edde971f4e9c88715a79ca78963284a2955dc, issuer_key_hash
0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26, over18 1, expiry
1819756800, nonce 0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762, equal to what
`gen-prover.ts` predicts and to the committed fixture.

Verification: `verifyProof` in the tab returned true in all three runs. Natively, all three browser
proofs pass `bb verify -k <committed VK> -p proof -i public_inputs -t evm` ("Proof verified
successfully"), and also with the native run's `public_inputs` file in place of the browser's.
`cmp` shows the browser `public_inputs` byte-identical to the native run and to the committed
fixture, and the VK exported by bb.js byte-identical to the committed `pid_sdjwt_evm.vk`. Proof
bytes differ from the native proof after byte 256, as expected for the ZK flavour.

## Kill criteria

| criterion | result | verdict |
| --- | --- | --- |
| under 120 s wall time in Chrome on this Mac | 21.1 to 22.0 s click to verified (11.0 to 11.3 s prove) | pass |
| verifies with the same VK, public inputs byte-identical to native | native `bb verify -t evm` with the committed VK passes for all three proofs; `public_inputs` and exported VK `cmp` equal | pass |
| under the browser memory limit, no tab crash | renderer RSS peak 2,883 to 2,965 MiB, below the 4 GiB wasm cap, tab alive in all four runs | pass |
| wasm build pinned to a bb.js matching bb 5.0.0-nightly.20260324 | `@aztec/bb.js@5.0.0-nightly.20260324`, same tag; VK equality is the proof that the proving system matches | pass |

## Integration estimate for app/: medium

- Hosting: the app page that proves must be served with COOP `same-origin` and COEP
  `require-corp`, otherwise bb.js runs single-threaded (expect a several-fold slower proof,
  unmeasured). COEP `require-corp` forces every cross-origin resource the page loads (wallet
  relay, RPC, fonts, analytics) to send CORS or CORP headers; the Aztec CRS CDN does. This is the
  main decision point: either the whole app is isolated or the prover lives on its own isolated
  route/origin (iframe or separate page) and talks to the app by postMessage.
- Download size: bb.js 3.7 MB threaded wasm (inlined as base64 JS, 2.8 MB gzip), acvm_js 2.6 MB wasm
  (0.75 MB gzip), noirc_abi 0.6 MB (0.24 MB gzip), circuit artifact 3.95 MB (2.1 MB gzip; 2.9 MB /
  1.8 MB gzip if stripped to `bytecode` and `abi`), CRS about 67 MB on first proof (cached in
  IndexedDB afterwards). Roughly 6 MB gzip of code plus 67 MB CRS on the first proof; cold bb init
  measured at 10.6 s on a fast line.
- Code: the companion's `statement.ts` pre-check and `prove.ts` public-input cross-check port to
  the browser as is (they are bun/WebCrypto code); `gen-prover.ts` needs a small port from
  `node:crypto`/`Buffer` to WebCrypto/Uint8Array or a shared module; the JWE path is 60 lines of
  WebCrypto (`src/jwe.ts`). The relay pickup and the submit path already exist in the companion.
- Review burden: one Vite/hosting config change, one worker-isolation decision, three ported
  modules, a bundle-size budget. No circuit, contract or VK change.
- Threads: bb.js caps at 32 and uses all logical cores; on a 4-core laptop the 11 s prove will be
  slower (unmeasured).

## Unverified

- Mobile Safari: not measured. From the bb.js source, iPhone/iPad user agents get a 1 GiB wasm
  memory cap (2^14 pages), and this proof peaks at 2.2 GB natively and 2.9 GB in Chrome, so an iOS
  proof of this circuit is expected to fail. Desktop Safari and Android Chrome: not measured.
- Firefox: not measured.
- Single-threaded (non-isolated) timing: not measured.
- The `ps` RSS peak is attributed to the renderer process with the largest RSS during the run
  (pid 16645, 2.9 GB; the next largest renderer stayed under 450 MiB); Chrome's task manager was
  not used to confirm the pid-to-tab mapping.
- The on-chain path itself was not exercised here; native `bb verify -t evm` with the committed VK
  is the decisive proxy, and the committed VK equals `VK_HASH` in the Solidity verifier.
