# circuits: Noir proof of the German PID SD-JWT statement

`pid-sdjwt/` proves, in Noir with Barretenberg UltraHonk, that a German EUDI
PID SD-JWT presentation with holder binding is valid and that the holder is 18
or older, bound to an Ethereum address via the KB-JWT nonce. It is derived from
`eid-privacy/zkp-pocs` `noir/d10_swiyu_jwt` (MPL-2.0, see
`pid-sdjwt/SOURCE.md`); the changes are described in `pid-sdjwt/ADAPTATION.md`.
The statement mirrors `prover-sp1/lib` (see `prover-sp1/NOTES.md`).

## Toolchain (measured on this Mac, M3 Max 16 cores, 128 GB, 2026-09-07)

- nargo 1.0.0-beta.21 (noirc 89a0f0fa), via `noirup -v 1.0.0-beta.21`
- bb 5.0.0-nightly.20260324, via `bbup -nv 1.0.0-beta.21`
- deps: noir_base64 v0.5.0, sha256 v0.3.0 (same as upstream)
- bun 1.x for `tools/gen-prover.ts`; forge 1.7.1 for the verifier build

The upstream repo pins the same Noir/bb pair through devbox
(`noir-versions.v1_0_0-beta_21`, `barretenberg-versions.beta_21`).

## Commands

    export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
    cd circuits/pid-sdjwt
    nargo test                                     # 4 unit tests
    nargo compile                                  # target/pid_sdjwt.json
    bun run ../tools/gen-prover.ts ../../prover-sp1/fixtures/input.json   # Prover.toml
    nargo execute pid_witness                      # target/pid_witness.gz
    bb gates -b target/pid_sdjwt.json
    bb write_vk -b target/pid_sdjwt.json -o out/adapted -t evm
    bb prove -b target/pid_sdjwt.json -w target/pid_witness.gz -k out/adapted/vk -o out/adapted -t evm
    bb verify -k out/adapted/vk -p out/adapted/proof -i out/adapted/public_inputs -t evm
    bb write_solidity_verifier -k out/adapted/vk -o out/adapted/PidSdJwtUltraHonkVerifier.sol
    ./test-negative.sh                             # tampered witnesses must fail

`-t evm` selects the keccak transcript with ZK for the Solidity verifier. The
default target (poseidon2, for recursion / the mobile prover) is also listed
below. `out/` and `target/` are gitignored.

## Measurements

| | baseline d10 (swiyu vector) | adapted pid-sdjwt (minted PID vector) |
| --- | --- | --- |
| `nargo compile` | 6.0 s, 894 MB RSS | 9.8 s, 942 MB RSS |
| ACIR opcodes | 92,811 | 136,027 |
| UltraHonk circuit_size | 453,007 (2^19) | 895,109 (2^20) |
| `nargo execute` | 0.5 s, 173 MB | 0.6 s, 187 MB |
| `bb write_vk` (evm) | 1.5 s, 802 MB | 2.4 s, 1.46 GB |
| `bb prove` (evm, 16 threads) | 2.1 s wall, 13.6 s user, 1.08 GB | 5.7 s wall, 27.2 s user, 1.94 GB |
| `bb prove` (default target, 16 threads) | 2.0 s wall, 13.8 s user, 1.08 GB | 3.5 s wall, 25.7 s user, 1.94 GB |
| `bb prove` (evm, HARDWARE_CONCURRENCY=1) | 9.9 s | 18.5 s |
| `bb verify` | ok | ok |
| proof / public inputs | 9,920 B / 97 inputs | 10,304 B / 86 inputs |

Public inputs of the adapted circuit (one field element per byte): subject
(20), issuer_key_hash (32), over18 (1), expiry (1, u64), nonce (32). For the
minted vector: issuer_key_hash
0x841e741b14eacdfdeca2e96fd95af5b987b5b872f88f8e359df29f7635556656, over18 1,
expiry 1780435560, nonce
0xe6de79975a3b30ad89d7af4e44fcdba843df4b70d4b3307e687e5498bbe0a25d, subject
0xcf02ad5376095e285fc88ae8c1fa240791370c17 (same values as the SP1 fixture).

The doubling comes from the second large SHA-256 (sd_hash over the 3,115 byte
presentation next to the 2,842 byte signing input), the header as input
(2048 vs 36 bytes) and the extra JSON fragment checks; ECDSA count is
unchanged (2). Reducing HEADER_B64_MAX / PAYLOAD_MAX_LEN / TAIL_MAX or reusing
the SHA state of the common prefix (`partial_sha256_var_interstitial`) are the
obvious next cuts; neither was done.

## Negative tests (`pid-sdjwt/test-negative.sh`, all pass)

| tamper | result |
| --- | --- |
| issuer-sig (one bit of r, in raw and base64url form) | rejected: Invalid issuer JWT signature |
| age-disclosure (salt changed) | rejected: age disclosure digest mismatch |
| nonce (challenge changed) | rejected: KB-JWT nonce mismatch |
| kb-sig (one bit of s) | rejected: Invalid KB-JWT signature |
| untampered | witness solves |

Plus `nargo test`: low-s normalisation accepts s and n - s, rejects other s;
timestamp parser accepts a 10 digit exp and rejects an 11 digit one. A Solidity
check with the real proof (throwaway forge test outside the repo): `verify`
returns true at about 2.80 M gas; flipping the over18 public input makes the
verifier revert.

## Solidity verifier

`contracts/src/noir/PidSdJwtUltraHonkVerifier.sol` is the unmodified output of
`bb write_solidity_verifier` (contract name inside stays `HonkVerifier`,
interface `verify(bytes proof, bytes32[] publicInputs) returns (bool)`).
`forge build` in `contracts/` succeeds. Runtime size is 25,176 bytes with the
repo's `optimizer_runs = 200`, 600 bytes over the EIP-170 limit; with
`optimizer_runs = 1` it is 24,246 bytes and deployable (verify gas about 2.85 M).
`via_ir` fails with a Yul stack-too-deep error. The contracts owner needs a
per-file compiler profile or `optimizer_runs = 1` before deploying. Any change
to the circuit changes the VK and requires regenerating this file.

On-chain adapter: `contracts/src/noir/NoirPidVerifier.sol` wraps this verifier
as an `IProofVerifier` for the AttestationRegistry (proof encoding, public input
layout, bits mapping and the EIP-170 workaround via a per-file `optimizer_runs =
1` compilation restriction are documented in `contracts/README.md`, section
NoirPidVerifier). The proof and public inputs of the minted vector are committed
as test fixtures in `contracts/test/fixtures/noir/` (see `SOURCE.md` there);
regenerate them together with the verifier whenever the circuit changes.

## What the circuit does not check

- x5c chain of the issuer header to a trust anchor. The contract must pin
  issuerKeyHash (sha256 of the SEC1 key). Only the first 40 base64url chars of
  the header (alg ES256, typ dc+sd-jwt) are pinned.
- Status list / revocation, iat, nbf, KB-JWT iat, freshness of the challenge
  (the contract compares expiry with block.timestamp and manages challenges).
- The other presented disclosures (given_name, family_name) are only bound via
  sd_hash, not verified against `_sd`.
- Top-levelness of the matched JSON fragments (see ADAPTATION.md).

## What remains for Android packaging

- `eid-privacy-zkp-android` (zkmopro noir-rs, `branch = "v1.0.0-beta.8-3"`)
  is pinned to Noir beta.8 artifacts; `target/pid_sdjwt.json` is compiled with
  beta.21 and the deps need beta.21. The Android agent must move noir-rs to a
  beta.21 compatible branch (or recompile the circuit with a nargo/bb pair the
  mopro build accepts) and rebuild the UniFFI bindings.
- Ship `target/pid_sdjwt.json` (ACIR) plus an SRS of at least 2^20 + 1 points
  (the circuit is 895 k gates, next power of two 2^20, so about 64 MB of SRS)
  to the app; the upstream app ships an SRS for its smaller circuits.
- Witness generation on device: the app must produce the same inputs as
  `tools/gen-prover.ts` (offsets, low-s normalisation, disclosures tail) from
  the wallet's presentation; port that TypeScript to Kotlin or Rust.
- Use the evm target on device if the proof goes on chain directly, otherwise
  the default target and a relay.
- Memory: 1.9 GB peak RSS on the Mac for proving; expect similar on device.

## Mobile estimate (estimate, not measured)

Upstream reports 18.4 s for the baseline on a Galaxy A54 (Exynos 1380). On
this Mac the adapted circuit takes 1.9x the single-thread time of the baseline
(18.5 s vs 9.9 s) and 2.0x the gates. Scaling the A54 figure by 2 gives
about 35 to 40 s on an A54. A Pixel 10 (Tensor G5) is roughly 2x faster per
core and has more big cores than the A54, so 15 to 25 s is the plausible band;
18 s is reachable only if the SRS is preloaded and the multithreaded bb build
is used. Memory (about 2 GB) is the bigger risk on mid-range devices.
