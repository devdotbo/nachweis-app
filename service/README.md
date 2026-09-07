# nachweis-bridge

Service bridge between the EUDI verifier and the `AttestationRegistry`: it turns one verified
SD-JWT PID presentation into one on-chain eligibility decision, with the SP1 proof of the
statement in `prover-sp1/lib` in the loop. Rust (axum, tokio, alloy, sp1-sdk 6.1.0).

```
cargo build --release          # the sp1 executor and setup are unusably slow in a debug build
cargo test                     # unit tests + the anvil end-to-end test (skips if anvil is missing)
./target/release/nachweis-bridge
```

## Environment

| variable | meaning | default |
|---|---|---|
| `BIND` | listen address | `127.0.0.1:8787` |
| `RPC_URL` | Ethereum JSON-RPC (anvil, Sepolia) | unset: attest and revoke endpoints answer 503 |
| `OPERATOR_PRIVATE_KEY` | key that sends `attestWithProof`, `attestByOperator`, `revoke`; must be an operator of `POLICY_ID` for the last two | unset |
| `REGISTRY` | `AttestationRegistry` address | unset |
| `POLICY_ID` | `0x` + 32-byte hex, or any string which is `keccak256`-hashed | `nachweis.pid.over18.v1` = `0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f` |
| `REQUIRE_ADDRESS_PROOF` | require the EIP-191 address proof before `attest` and `attest-operator` | `true` (`false` for scripted demos) |
| `CORS_ORIGINS` | comma-separated allowed origins for the browser app, e.g. `http://localhost:5173` | unset: any origin |
| `VERIFIER_URL` | verifier-service base URL; enables verifier mode (see below) | unset: local mode |
| `PROOF_MODE` | `mock`, `execute`, `compressed`, `groth16` | `mock` |
| `PROVER_ARTIFACTS` | directory with `calldata-groth16.json` (mock proof), `vkey.txt`, optionally the guest ELF `nachweis-pid-program` | `../prover-sp1/fixtures` |
| `PROVER_ELF` | explicit guest ELF path; else `PROVER_ARTIFACTS/nachweis-pid-program`, else `../prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program` | unset |
| `EXPECTED_VCT` | vct the statement expects | `urn:eudi:pid:de:1` |
| `EXPECTED_AUD` | KB-JWT `aud` the statement expects (the verifier's `client_id`) | `https://self-issued.me/v2` |
| `ISSUER_KEY_SEC1_HEX` | issuer P-256 key, SEC1 uncompressed; when unset the key is read from the `x5c` leaf certificate in the issuer JWT header (that is what a real ERICA credential needs; the synthetic fixture needs the override because its header copies the ERICA x5c) | unset |
| `SP1_PROVER` | sp1-sdk prover selection: `cpu` (local), `mock`, `network` | sp1 default |
| `RUST_LOG` | tracing filter | `info` |

Fixture caveat: the synthetic prover fixture in `../prover-sp1/fixtures` carries ERICA's `x5c` but is signed with a fresh issuer key, so the bridge needs `ISSUER_KEY_SEC1_HEX` (from `input.json`, `issuer_key_sec1_hex`) for the fixture, while a real ERICA credential takes the issuer key from the `x5c` leaf and must run without the override.

Groth16 wrapping uses the in-process gnark prover (`native-gnark`, default feature, needs Go).
Build with `--no-default-features` to let sp1-sdk use the Docker image instead.

## Endpoints

| method, path | body | effect |
|---|---|---|
| `POST /sessions` | `{bound_address, challenge_hex?}` | new session; challenge = 32 random bytes unless given; nonce = hex(sha256(address20 ‖ challenge32)). Verifier mode creates the presentation request first and uses the verifier's session id as `session_id`, so the app polls one id. Returns `{session_id, nonce, challenge_hex, openid4vp_uri, request_uri, mode, address_proof_message}` |
| `POST /sessions/:id/address-proof` | `{signature}` | EIP-191 personal-message signature over `nachweis:session:<session_id>` by the bound address (`personal_sign` in the wallet). Recovers the signer with alloy; 401 if it is not `bound_address`. Sets `address_verified` |
| `GET /sessions/:id` | | `state`, `detail` (one human-readable line), `error`, `address_verified`, public values, proof, `tx_hash`, decoded `Attested` event; 404 for unknown ids. The presentation is never returned |
| `POST /sessions/:id/presentation` | `{sd_jwt_presentation}` | local mode entry: runs the statement natively (422 with the statement's error on failure), then generates the proof per `PROOF_MODE`. Returns `{status, public_values_hex, public_values, proof_hex, proof_system, vkey, cycles}`. Blocks until the proof is done |
| `POST /sessions/:id/attest` | `{tier?}` | `attestWithProof` with the session's proof; 409 unless the session is `proved` and (with `REQUIRE_ADDRESS_PROOF`) `address_verified`. Reverts come back as 502 with the typed error decoded (registry, `Sp1PidVerifier`, gateway) plus the raw revert data. Returns `{tx_hash, attested, call}` |
| `POST /sessions/:id/attest-operator` | `{tier?, bits?}` | `attestByOperator` (fallback demo); needs at least a natively verified session. `bits` overrides the proof-path bits (default `0x3` = identity evidence \| over 18, which is `FundToken.DEFAULT_REQUIRED_BITS`); bits `0x4` (EU resident) and `0x8` (not sanctioned) are reserved and required nowhere |
| `POST /revoke` | `{subject}` | `revoke(subject, POLICY_ID)` |
| `GET /health` | | mode, proof mode, registry, operator |

## State machine

```
created ──presentation──> presented ──native statement ok──> verified ──> proving ──> proved ──attest──> attested
   │                          │                                                │
   └── verifier rejected /    └── statement failed (422, error text) ──> failed <── proof failed
       wallet timeout
```

`failed` is terminal and carries `error`. `attest-operator` may run from `verified` onward and
also lands in `attested`. With `PROOF_MODE=execute` or `compressed` the session reaches `proved`
with `proof_hex: null`; `attest` then answers 409, because there is no on-chain proof.

## Sequence

```
wallet / app          bridge                         verifier-service          prover (sp1)         AttestationRegistry
    │  POST /sessions {bound_address}  │                    │                        │                      │
    │──────────────────────────────────>│ challenge, nonce  │                        │                      │
    │                                   │ POST /request {nonce}  (verifier mode)     │                      │
    │                                   │───────────────────>│                        │                      │
    │  {session_id, nonce, openid4vp_uri}│<──────────────────│                        │                      │
    │<──────────────────────────────────│                    │                        │                      │
    │  OpenID4VP presentation (KB-JWT nonce = nonce, aud = client_id)                 │                      │
    │──────────────────────────────────────────────────────>│ verify (trust, status) │                      │
    │                                   │ GET /result/:id    │                        │                      │
    │                                   │<──── presentation ─│  (or local mode: POST /sessions/:id/presentation)
    │                                   │ native statement (lib): signatures, disclosures, sd_hash, nonce binding
    │                                   │ GuestInput ─────────────────────────────────>│ execute / prove      │
    │                                   │<──── publicValues (192 B), proof bytes ──────│                      │
    │  POST /sessions/:id/attest        │                    │                        │                      │
    │──────────────────────────────────>│ attestWithProof(subject, Decision, abi.encode(publicValues, proof), publicInputs[4])
    │                                   │────────────────────────────────────────────────────────────────────>│ IProofVerifier.verify
    │  {tx_hash, Attested event}        │<───────────────────────────────────────────────────────── Attested ─│
    │<──────────────────────────────────│
```

## How the presentation reaches the bridge

Local mode (`VERIFIER_URL` unset, the only mode that works against the verifier as it is today):
the caller posts the compact SD-JWT presentation (`issuerJwt~d1~…~dN~kbJwt`) to
`POST /sessions/:id/presentation`. The wallet must have been asked for the bridge's nonce and
audience, which the caller arranges out of band.

Verifier mode (`VERIFIER_URL` set): `POST /sessions` calls the verifier to create the
OpenID4VP request with the bridge's nonce and then polls for the verified presentation (2 s
interval, 10 min timeout). This needs two additions in `verifier-service/src/handlers.rs`, which
does not have them yet:

1. `POST /request {"nonce"}` returning `{"session", "authorization_request", "request_uri"}`:
   `create_request` currently mints `Uuid::new_v4()` as the nonce and only `GET /` (HTML) calls it.
   Change: take the nonce from the JSON body instead of `Uuid::new_v4()` and return the pair as JSON.
2. `GET /result/:id` returning `{"status": "verified", "presentation": "<compact SD-JWT>"}`
   (`"pending"` / `"rejected"` otherwise): `SessionResult::Verified` stores only the parsed
   `VerifiedPid` (disclosed view, no raw token). Change: keep the presentation string `p` from
   `verify_vp_token` next to it (`SessionResult::Verified(Box<VerifiedPid>, String)`) and serve it.

Both are read-side additions; the verifier's own checks (x5c chain to the trust anchor, status
list, freshness window) stay in front of the bridge, which then proves the statement subset.

## Proof modes

- `mock`: public values from the native run of the statement (real for this session), proof bytes
  and vkey from `PROVER_ARTIFACTS/calldata-groth16.json`. Only a `MockProofVerifier` accepts this;
  the pipeline runs in well under a second. A warning is logged when the fixture's public values
  differ from the session's.
- `execute`: runs the guest ELF, returns cycles and public values, no proof (430,143 cycles for
  the fixture; execute plus vkey setup takes seconds in a release build).
- `compressed`: STARK proof, verified locally, not submittable on chain.
- `groth16`: on-chain proof (`4-byte selector ‖ Groth16 proof`, 356 bytes); about 5 minutes on an
  M3 Max with the 6.2 GB `~/.sp1/circuits/groth16/v6.1.0` artifacts present.

## On-chain encoding (single place: `src/chain.rs`)

- `Decision { policyId: POLICY_ID, bits, tier (body, default 1), expiry: publicValues.expiry, statusRef: keccak256(session id string), revoked: false }`
- `bits = 1 (identity evidence) | 2 (over 18 when publicValues.over18 == 1)`, as the SP1 adapter on `wp2b-sp1-verifier` derives them
- `proof = abi.encode(bytes publicValues, bytes sp1ProofBytes)` (`encode_proof_arg`)
- `publicInputs = [bytes32(subject), policyId, bytes32(bits), bytes32(expiry)]`

## Known mismatches between prover output and contracts

1. `expiry = min(issuer exp, KB-JWT exp)`. Real ERICA KB-JWTs carry `exp = iat + 300`, so the
   on-chain decision expires five minutes after the presentation, and `isEligible` turns false
   right after the demo. The fixture's expiry (1780435560) is already in the past, which is why
   the anvil test starts the chain at `--timestamp 1780435000`. Suggested prover change: commit the
   issuer `exp` only and let the bridge (which already sees the presentation) enforce KB-JWT
   freshness off chain, or commit both values separately.
2. `policyId` is not in the public values; the adapter has to pin `issuerKeyHash`, `vctHash` and
   the vkey per policy and check `publicInputs[1]` against its own mapping.
3. Resolved: the FundToken demo policy requires `REQUIRED_BITS = 0x3` (identity evidence, over 18),
   exactly the bits the proof path asserts (`FundToken.DEFAULT_REQUIRED_BITS`, the deploy script
   default). Bits `0x4` (EU resident) and `0x8` (not sanctioned) are reserved and not required.
4. Replay: the registry consumes `verifier.nonceOf(proof)` once per policy (`NonceConsumed`). With the
   SP1 adapter that is the nonce from the public values, so one proof attests once. With
   `MockProofVerifier` the nonce is `keccak256` of the first payload of an
   `abi.encode(bytes, bytes)` proof (the public values for the SP1 shape), else `keccak256(proof)`,
   so distinct proofs attest and the same proof twice reverts `NonceConsumed`. `tier` and
   `statusRef` are unbound by design.

## Tests

- `cargo test --lib`: ABI encoding of the proof argument and the `publicInputs` layout.
- `cargo test --test anvil`: starts `anvil` on a free port, deploys `AttestationRegistry` and
  `MockProofVerifier` from `contracts/out` (runs `forge build` if missing), sets verifier and
  operator, then drives the HTTP API in mock mode with the fixture vector: nonce matches the
  fixture KB-JWT, address proof (wrong signer 401, right signer sets `address_verified`),
  wrong challenge fails with the statement's nonce error, `attest` emits
  `Attested` with bits `0x3` and `statusRef = keccak(session id)`, `isEligible` true, `revoke`
  makes it false and blocks re-attestation, `attest-operator` reopens it, revoke again. Skips with
  a message when `anvil` is not installed.

## Privacy statement

Server mode (this branch): the bridge sees the full presentation (names and other disclosed
claims in the SD-JWT, the holder key, the issuer certificate). It keeps it in process memory for
the session's lifetime, never logs it, never returns it, and never writes it to disk. What leaves
the bridge is the ABI-encoded public values (two hashes, the over-18 bit, the bound address,
expiry, the nonce commitment), the proof, and the `Decision`. The chain learns which address
holds a decision for which policy and nothing else.

Blind-relay mode is the client-side follow-up on branch `nachweis-relay`: the wallet response is
relayed encrypted to the holder's device, the statement runs and proves there, and the bridge only
ever handles public values and proof bytes.

## Video run

```
export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$HOME/.foundry/bin:$PATH"
cd service && cargo build --release
# anvil in another terminal: anvil --timestamp 1780435000   (fixture) or plain anvil (fresh credential)
export RPC_URL=http://127.0.0.1:8545
export OPERATOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export REGISTRY=<deployed AttestationRegistry with setVerifier(POLICY_ID, verifier) and setOperator(POLICY_ID, operator, true)>
export POLICY_ID=nachweis.pid.over18.v1          # default; keccak256 -> 0xd27260f1…d05f
export REQUIRE_ADDRESS_PROOF=true                # false for a scripted run without a wallet signature
export CORS_ORIGINS=http://localhost:5173
export PROOF_MODE=mock                      # or groth16 with SP1_PROVER=cpu and the SP1 adapter as verifier
export PROVER_ARTIFACTS=$PWD/../prover-sp1/fixtures
export PROVER_ELF=$PWD/../prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program
export ISSUER_KEY_SEC1_HEX=$(python3 -c "import json;print(json.load(open('../prover-sp1/fixtures/input.json'))['issuer_key_sec1_hex'])")   # fixture only; unset for a real ERICA credential
RUST_LOG=info ./target/release/nachweis-bridge
```
