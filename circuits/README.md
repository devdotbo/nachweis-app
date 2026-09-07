# circuits: Noir proof of the German PID SD-JWT statement

`pid-sdjwt/` proves, in Noir with Barretenberg UltraHonk, that a German EUDI
PID SD-JWT presentation with holder binding is valid and that the holder is 18
or older, bound to an Ethereum address via the KB-JWT nonce. It is derived from
`eid-privacy/zkp-pocs` `noir/d10_swiyu_jwt` (MPL-2.0, see
`pid-sdjwt/SOURCE.md`); the changes are described in `pid-sdjwt/ADAPTATION.md`,
the realism pass (registered `client_id` as `aud`, bounds for a 23-claim PID,
three age object shapes, KB header with `kid`) in `pid-sdjwt/REALISM.md`.
The statement mirrors `prover-sp1/lib` (see `prover-sp1/NOTES.md`); the plain
age object shape (C) is Noir and companion only, the SP1 guest is unchanged.

## Toolchain (measured on this Mac, M3 Max 16 cores, 128 GB, 2026-09-07; the realistic column after the realism pass)

- nargo 1.0.0-beta.21 (noirc 89a0f0fa), via `noirup -v 1.0.0-beta.21`
- bb 5.0.0-nightly.20260324, via `bbup -nv 1.0.0-beta.21`
- deps: noir_base64 v0.5.0, sha256 v0.3.0 (same as upstream)
- bun 1.x for `tools/gen-prover.ts`; forge 1.7.1 for the verifier build

The upstream repo pins the same Noir/bb pair through devbox
(`noir-versions.v1_0_0-beta_21`, `barretenberg-versions.beta_21`).

## Commands

    export PATH="$HOME/.nargo/bin:$HOME/.bb:$PATH"
    cd circuits/pid-sdjwt
    nargo test                                     # 9 unit tests
    nargo compile                                  # target/pid_sdjwt.json
    bun run ../tools/gen-prover.ts ../../prover-sp1/fixtures/realistic-input.json   # Prover.toml
    nargo execute pid_witness                      # target/pid_witness.gz
    bb gates -b target/pid_sdjwt.json
    bb write_vk -b target/pid_sdjwt.json -o out/adapted -t evm
    bb prove -b target/pid_sdjwt.json -w target/pid_witness.gz -k out/adapted/vk -o out/adapted -t evm
    bb verify -k out/adapted/vk -p out/adapted/proof -i out/adapted/public_inputs -t evm
    bb write_solidity_verifier -k out/adapted/vk -o out/adapted/PidSdJwtUltraHonkVerifier.sol
    ./test-negative.sh                             # tampered witnesses must fail; age shapes B, C and the minimal layout must solve
    (cd ../../companion && bun run src/cli.ts mint-fixture --issuer-key ~/.nachweis-companion/noir-fixture-issuer.json)   # re-mint the vector

`-t evm` selects the keccak transcript with ZK for the Solidity verifier. The
default target (poseidon2, for recursion / the mobile prover) is also listed
below. `out/` and `target/` are gitignored.

## Measurements

| | baseline d10 (swiyu vector) | adapted pid-sdjwt (minted vector, before the realism pass) | realistic pid-sdjwt (realistic vector) |
| --- | --- | --- | --- |
| `nargo compile` | 6.0 s, 894 MB RSS | 12.6 s, 942 MB RSS | 15.7 s, 1.69 GB RSS |
| ACIR opcodes | 92,811 | 135,831 | 255,170 |
| UltraHonk circuit_size | 453,007 (2^19) | 894,846 (2^20) | 1,038,584 (2^20, 10 k gates of headroom) |
| `nargo execute` | 0.5 s, 173 MB | 0.6 s, 189 MB | 0.9 s, 226 MB |
| `bb write_vk` (evm) | 1.5 s, 802 MB | 1.7 s, 1.44 GB | 2.0 s, 1.80 GB |
| `bb prove` (evm, 16 threads) | 2.1 s wall, 13.6 s user, 1.08 GB | 6.0 s wall, 25.8 s user, 1.84 GB (re-measured 2026-09-07 before the change; 3.5 s on an earlier run) | 4.0 s wall, 26.2 s user, 2.25 GB (4.2 s inside the companion run) |
| `bb prove` (evm, HARDWARE_CONCURRENCY=1) | 9.9 s | 18.5 s | 19.7 s |
| `bb verify` | ok | ok | ok |
| proof / public inputs | 9,920 B / 97 inputs | 10,304 B / 86 inputs | 10,304 B / 86 inputs |
| vector: header b64 / payload raw / tail / KB payload raw | 36 / (swiyu payload) / - / - | 1,855 / 739 / 186 / 200 | 2,138 / 1,563 / 186 / 228 (+ KB header 58 with kid) |
| bounds: HEADER_B64_MAX / PAYLOAD_MAX_LEN / TAIL_MAX / KB_PAYLOAD_MAX | - | 2048 / 1024 / 512 / 320 | 2304 / 2304 / 768 / 384 (+ KB_HEADER_MAX 128, AGE_OBJ_DISC_MAX 512) |

Public inputs of the circuit (one field element per byte): subject
(20), issuer_key_hash (32), over18 (1), expiry (1, u64, the issuer credential
exp), nonce (32). For the realistic vector: issuer_key_hash
0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26, over18 1,
expiry 1819756800, nonce
0x306863157ddb59f4e5a56f41aa8591e68b574c8c3475c43d9bd469220be90762, subject
0xf99edde971f4e9c88715a79ca78963284a2955dc (subject and challenge are the SP1
fixture's, so the nonce is the same; the issuer key is the companion test
issuer, whose self-signed leaf is `x5c[0]`).

Why the realistic circuit is only 16 % larger although every bound grew (the
signing input from 3,415 to 5,377 bytes, the sd_hash preimage from 4,013 to
6,232 bytes): the two big hashes share their prefix. `header.payload` is
compressed once up to its last full block (`partial_sha256_var_interstitial`,
84 blocks) and both the signature hash and the sd_hash are finished from that
state with a small in-circuit continuation (2 and 16 blocks), instead of
hashing 54 + 63 blocks separately. The per-position window scans that the age
and `_sd` anchoring first used cost 25 k gates and were replaced by prefix
counts of `]` and `}` over the buffers (no window limits at all). The ACIR
opcode count grew more than the gate count because of the byte-level dynamic
reads of the anchoring checks. The obvious next cut, if the 10 k headroom ever
matters: PAYLOAD_MAX_LEN 2304 to 2240 (one block in the shared prefix and 64
bytes of base64 encoding, about 8 k gates).

## Negative tests (`pid-sdjwt/test-negative.sh`, all pass on the realistic vector)

| tamper | result |
| --- | --- |
| issuer-sig (one bit of r, in raw and base64url form) | rejected: Invalid issuer JWT signature |
| age-disclosure (salt changed; object salt changed in shape C) | rejected: disclosure digest mismatch |
| nonce (challenge changed) | rejected: KB-JWT nonce mismatch |
| kb-sig (one bit of s) | rejected: Invalid KB-JWT signature |
| untampered | witness solves |
| age shape B (object disclosed, nested digests; 630 byte tail), minted fresh | solves; age tamper rejected |
| age shape C (object disclosed, plain values), minted fresh | solves; age tamper rejected |
| minimal layout (three top-level digests, no kid), minted fresh | solves; age tamper rejected |

Plus `nargo test` (9): low-s normalisation accepts s and n - s, rejects other
s; the timestamp parser accepts a 10 digit exp and rejects an 11 digit one; the
SHA-256 continuation equals `sha256_var` for lengths around the block
boundaries; the container check accepts an open array and rejects a closed one;
the disclosure prefix check accepts `["salt","age_equal_or_over",{` and rejects
a name in the salt position. The Solidity side: `contracts/test/NoirPidVerifier.t.sol`
(21 tests) verifies the real proof, `attestWithProof` costs 3.02 M gas, a
flipped over18 reverts.

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
  issuerKeyHash (sha256 of the SEC1 key of the sandbox issuer, read off the x5c
  leaf of the first real credential; `companion prove` and `gen-prover.ts`
  derive the key from the leaf). Of the header only `alg` ES256 and `typ`
  `dc+sd-jwt` or `vc+sd-jwt` are checked, inside its first 96 decoded bytes.
- Status list / revocation, iat, nbf, KB-JWT exp and iat, freshness of the
  challenge (the contract compares the issuer expiry with block.timestamp and
  manages challenges; the bridge checks KB-JWT exp and iat against its clock
  before proving, see `prover-sp1/lib` `check_kb_freshness`).
- The other presented disclosures (given_name, family_name) are only bound via
  sd_hash, not verified against `_sd`.
- Top-levelness of the matched JSON fragments (see ADAPTATION.md). The age
  digest (or `"18":true`) must lie inside the container that the age fragment
  opens, and a disclosed age object must be `["salt","age_equal_or_over",{…`
  with its digest inside some `"_sd":[` array of the signed payload.
- The `aud` is the registered `client_id` of one registrar leaf
  (`x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI`); a new leaf means a
  new constant, VK, verifier and fixtures (REALISM.md, section 1).

## What remains for Android packaging

- `eid-privacy-zkp-android` (zkmopro noir-rs, `branch = "v1.0.0-beta.8-3"`)
  is pinned to Noir beta.8 artifacts; `target/pid_sdjwt.json` is compiled with
  beta.21 and the deps need beta.21. The Android agent must move noir-rs to a
  beta.21 compatible branch (or recompile the circuit with a nargo/bb pair the
  mopro build accepts) and rebuild the UniFFI bindings.
- Ship `target/pid_sdjwt.json` (ACIR) plus an SRS of at least 2^20 + 1 points
  (the circuit is 1,039 k gates, next power of two 2^20, so about 64 MB of SRS)
  to the app; the upstream app ships an SRS for its smaller circuits.
- Witness generation on device: the app must produce the same inputs as
  `tools/gen-prover.ts` (offsets, low-s normalisation, disclosures tail, the
  age shape flags and the raw KB header) from the wallet's presentation; port
  that TypeScript to Kotlin or Rust. Since the realism pass the inputs are:
  `issuer_header_b64`, `hdr_alg_offset`, `hdr_typ_offset`, `payload`,
  `issuer_sig_b64`, `issuer_sig`, `disclosures_tail`, `kb_header`,
  `kb_alg_offset`, `kb_typ_offset`, `kb_payload`, `kb_signature`,
  `issuer_pub_x`, `issuer_pub_y`, `age_salt`, `age_obj_disclosed`,
  `age_leaf_disclosed`, `age_obj_disclosure`, `sd_offset`,
  `age_obj_digest_offset`, `age_sd_offset`, `age_target_offset`, `vct_offset`,
  `cnf_offset`, `x_offset`, `y_offset`, `exp_offset`, `kb_aud_offset`,
  `kb_nonce_offset`, `kb_sd_hash_offset`, `challenge`, `subject` (public).
  `age_digest_index` and the fixed KB header are gone.
- Use the evm target on device if the proof goes on chain directly, otherwise
  the default target and a relay.
- Memory: 2.25 GB peak RSS on the Mac for proving; expect similar on device.

## Mobile estimate (estimate, not measured)

Upstream reports 18.4 s for the baseline on a Galaxy A54 (Exynos 1380). On
this Mac the realistic circuit takes 2.0x the single-thread time of the baseline
(19.7 s vs 9.9 s) and 2.3x the gates. Scaling the A54 figure by 2 gives
about 35 to 40 s on an A54. A Pixel 10 (Tensor G5) is roughly 2x faster per
core and has more big cores than the A54, so 15 to 25 s is the plausible band;
18 s is reachable only if the SRS is preloaded and the multithreaded bb build
is used. Memory (about 2 GB) is the bigger risk on mid-range devices.
