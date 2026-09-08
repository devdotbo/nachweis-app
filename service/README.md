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
| `OPERATOR_PRIVATE_KEY` | key that sends `attestWithProof`, `attestByOperator`, `approve`, `revoke`; must be an operator of `POLICY_ID` for the last three. The nonce is read from the chain (`eth_getTransactionCount` pending) before every send, so a reverted send leaves no gap for the next one; the key must not sign from another process at the same time | unset |
| `BRIDGE_ISSUER_TOKEN` | bearer token for the issuer routes `attest-operator`, `approve` (by session) and `revoke`: `Authorization: Bearer <token>`. Unset: those routes answer 503 and a warning is logged at startup; nothing privileged runs unauthenticated | unset |
| `REGISTRY` | `AttestationRegistry` address | unset |
| `NOIR_VERIFIER` | `NoirPidVerifier` address for the client-side Noir path: `POST /sessions/:id/noir-proof` dry-runs `verify` with an `eth_call` before sending, so a bad proof answers 422 with the typed revert instead of a failed transaction | unset: no dry run |
| `POLICY_ID` | `0x` + 32-byte hex, or any string which is `keccak256`-hashed | `nachweis.pid.over18.v1` = `0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f` |
| `REQUIRE_ADDRESS_PROOF` | require the EIP-191 address proof before `attest` and `attest-operator` | `true` (`false` for scripted demos) |
| `HANDOFF_VERIFIER_URL` | verifier (blind relay) base URL advertised in `GET /sessions/:id/handoff` for the phone prover, e.g. `http://10.0.2.2:8091` for the Android emulator | unset: `VERIFIER_URL`, else null (the phone keeps its own) |
| `HANDOFF_BRIDGE_URL` | this bridge's base URL as the phone reaches it, advertised in the handoff | unset: scheme and `Host` of the handoff request |
| `CORS_ORIGINS` | comma-separated allowed origins for the browser app, e.g. `http://localhost:5173` | unset: any origin |
| `VERIFIER_URL` | verifier-service base URL; enables verifier mode (see below) | unset: local mode |
| `VERIFIER_RESULT_TOKEN` | shared secret sent as `X-Result-Token` on the verifier's `GET /result/:id`; must equal the verifier's `RESULT_TOKEN`. The verifier serves the raw presentation only with `RESULT_INCLUDES_PRESENTATION=true` there and only to a caller with this token (401 without it, 503 if the verifier has no token configured); the bridge names the variable in its error | unset: no header sent, verifier mode fails at the first poll |
| `PROOF_MODE` | `mock`, `execute`, `compressed`, `groth16` | `mock` |
| `PROVER_ARTIFACTS` | directory with `calldata-groth16.json` (mock proof), `vkey.txt`, optionally the guest ELF `nachweis-pid-program` | `../prover-sp1/fixtures` |
| `PROVER_ELF` | explicit guest ELF path; else `PROVER_ARTIFACTS/nachweis-pid-program`, else `../prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program` | unset |
| `EXPECTED_VCT` | vct the statement expects | `urn:eudi:pid:de:1` |
| `EXPECTED_AUD` | KB-JWT `aud` the statement expects (the verifier's `client_id`) | `https://self-issued.me/v2` |
| `KB_JWT_WINDOW_SECS` | KB-JWT freshness window on the SP1 route (`POST /sessions/:id/presentation`, verifier mode): `iat` must not be older than this many seconds, and `exp`, when the wallet signs one, must lie within this many seconds ahead of now (the official German test wallet signs no KB-JWT `exp`, so `iat` alone decides); checked after the native statement run, before proving. Not applied on the Noir route (`POST /sessions/:id/noir-proof`): the bridge receives no KB-JWT there, the companion's `--kb-window` is the only freshness check (see `docs/trust-boundaries.md`). `0` disables the check (only for the stored fixture, whose KB-JWT expired five minutes after minting) | `600` |
| `ISSUER_KEY_SEC1_HEX` | issuer P-256 key, SEC1 uncompressed; when unset the key is read from the `x5c` leaf certificate in the issuer JWT header (that is what a real ERICA credential needs; the synthetic fixture needs the override because its header copies the ERICA x5c) | unset |
| `SP1_PROVER` | sp1-sdk prover selection: `cpu` (local), `mock`, `network` | sp1 default |
| `RUST_LOG` | tracing filter. At `info` every non-2xx answer leaves one `warn` line with method, path, status and the error text (`request refused`) | `info` |

Fixture caveat: the synthetic prover fixture in `../prover-sp1/fixtures` carries ERICA's `x5c` but is signed with a fresh issuer key, so the bridge needs `ISSUER_KEY_SEC1_HEX` (from `input.json`, `issuer_key_sec1_hex`) for the fixture, while a real ERICA credential takes the issuer key from the `x5c` leaf and must run without the override.

Groth16 wrapping uses the in-process gnark prover (`native-gnark`, default feature, needs Go).
Build with `--no-default-features` to let sp1-sdk use the Docker image instead.

## Endpoints

| method, path | body | effect |
|---|---|---|
| `POST /sessions` | `{bound_address, challenge_hex?}` | new session; challenge = 32 random bytes unless given; nonce = hex(sha256(address20 ‖ challenge32)). Verifier mode creates the presentation request first and uses the verifier's session id as `session_id`, so the app polls one id. Returns `{session_id, nonce, challenge_hex, openid4vp_uri, request_uri, mode, address_proof_message}` |
| `POST /sessions/:id/address-proof` | `{signature}` | EIP-191 personal-message signature over `nachweis:session:<session_id>` by the bound address (`personal_sign` in the wallet). Recovers the signer with alloy; 401 if it is not `bound_address`. Sets `address_verified` |
| `GET /sessions/:id/handoff` | | two-device flow: what the phone prover needs to join THIS session after the browser wallet signed it: `{session_id, bound_address, challenge_hex, nonce, verifier_url, bridge_url, expires_at, address_verified, state, uri}`. `verifier_url` is `HANDOFF_VERIFIER_URL` (else `VERIFIER_URL`, else null), `bridge_url` is `HANDOFF_BRIDGE_URL` (else scheme and `Host` of this request), `expires_at` = `created_at` + 600 s, `uri` the same as `nachweis://handoff?v=1&s=…&a=…&c=…&b=…&r=…`. 409 once the session is past `presented` or the handoff has expired, 404 for unknown ids. The phone requests the presentation with the same challenge (same nonce), then posts `noir-proof` here; the address proof stays the browser's |
| `GET /sessions/:id` | | `state`, `detail` (one human-readable line), `error`, `address_verified`, public values, proof, `tx_hash`, decoded `Attested` event, `approved` (issuer approval as last seen on chain), `approve_tx_hash`, `revoke_tx_hash`; 404 for unknown ids. The presentation is never returned |
| `POST /sessions/:id/presentation` | `{sd_jwt_presentation}` | local mode entry: runs the statement natively (422 with the statement's error on failure), then generates the proof per `PROOF_MODE`. Returns `{status, public_values_hex, public_values, proof_hex, proof_system, vkey, cycles}`. Blocks until the proof is done |
| `POST /sessions/:id/noir-proof` | `{proof_hex, public_inputs_hex[86], tier?}` | client-side path (`/companion`): the holder's device decrypted the blind-relayed presentation and proved the statement with `/circuits/pid-sdjwt`; the bridge receives only the bb proof (10,304 bytes) and the 86 public input field elements. Decodes them as `NoirPidVerifier` does (subject 20, issuerKeyHash 32, over18, expiry, nonce 32), requires `subject == bound_address`, `nonce == session nonce`, over18 = 1, expiry ahead of now (422 otherwise), with `REQUIRE_ADDRESS_PROOF` the address proof (409), dry-runs `NoirPidVerifier.verify` when `NOIR_VERIFIER` is set (422 with the typed revert), then sends `attestWithProof(subject, Decision, abi.encode(bytes proof, bytes32[] publicInputs), [subject, policyId, bits, expiry])`. `created` or `proved` -> `proved` -> `attested` (evidence on chain, awaiting issuer approval). Returns `{status: attested, path: noir, tx_hash, attested, public_values, call}`. The bridge never sees a presentation on this path |
| `POST /sessions/:id/attest` | `{tier?}` | `attestWithProof` with the session's proof; 409 unless the session is `proved` and (with `REQUIRE_ADDRESS_PROOF`) `address_verified`, and 409 for a session proved on the phone (`proof_system noir-ultrahonk`: the `noir-proof` route attests it in the same request, so a poll can see `proved` while that transaction is in flight). Reverts come back as 502 with the typed error decoded (registry, `Sp1PidVerifier`, gateway) plus the raw revert data. Evidence only: the subject is not eligible until the issuer approves. Returns `{tx_hash, attested, call}` |
| `POST /sessions/:id/approve` | | issuer route (bearer token). `approve(subject, POLICY_ID)` from the operator key for the session's bound address: sets `approved`, clears `revoked`. 409 unless the session is `attested` or `revoked`. Both doors (FundToken transfer check, Subscription, the Uniswap checker) open only after this. Returns `{status: approved, tx_hash, approved, chain: statusOf}` |
| `POST /sessions/:id/revoke` | | issuer route (bearer token). `revoke(subject, POLICY_ID)` for the session's bound address; 409 unless `attested` or `approved`. The session moves to `revoked`; `approve` reopens it |
| `POST /sessions/:id/attest-operator` | `{tier?, bits?}` | issuer route (bearer token). `attestByOperator` (fallback when no proof route exists): stores the decision and approves in one transaction, the session goes straight to `approved`. Needs at least a natively verified session. `bits` overrides the proof-path bits (default `0x3` = identity evidence \| over 18, which is `FundToken.DEFAULT_REQUIRED_BITS`); bits `0x4` (EU resident) and `0x8` (not sanctioned) are reserved and required nowhere |
| `POST /revoke` | `{subject}` | issuer route (bearer token). `revoke(subject, POLICY_ID)` by address; sessions bound to that address move to `revoked` |
| `GET /health` | | mode, proof mode, registry, operator, `issuer_routes` (`token` or `disabled`) |

## State machine

```
created ──presentation──> presented ──native statement ok──> verified ──> proving ──> proved ──attest──> attested ──approve──> approved
   │                          │                                                │                            ▲                 │
   └── verifier rejected /    └── statement failed (422, error text) ──> failed <── proof failed          approve ──── revoked <── revoke
       wallet timeout
```

`attested` means evidence on chain, awaiting issuer approval: `isEligible` is still false. `approved`
means the issuer called `approve` (both doors open); `revoke` withdraws it (`revoked`) and only
`approve` reopens it, a replayed proof cannot (`DecisionRevoked`). `failed` is terminal and
carries `error`. `attest-operator` may run from `verified` onward and lands in `approved`
directly (the operator signed the decision). The client-side Noir path (`noir-proof`) skips `presented` and
`verified`: it goes `created -> proved -> attested` in one request, because the statement was
checked and proved on the holder's device. With `PROOF_MODE=execute` or `compressed` the session reaches `proved`
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

Local mode (`VERIFIER_URL` unset): the caller posts the compact SD-JWT presentation
(`issuerJwt~d1~…~dN~kbJwt`) to `POST /sessions/:id/presentation`. The wallet must have been asked
for the bridge's nonce and audience, which the caller arranges out of band. Nothing in front of
the bridge checks the issuer's trust chain or the status list in this mode.

Verifier mode (`VERIFIER_URL` set): `POST /sessions` calls the verifier's `POST /request
{"nonce"}` to create the OpenID4VP request with the bridge's nonce and then polls
`GET /result/:id` for the verified presentation (2 s interval, 10 min timeout), sending
`VERIFIER_RESULT_TOKEN` as `X-Result-Token`. Both endpoints exist on the verifier's
`nachweis-relay` branch (`docs/bridge-mode.md` there). The verifier serves the presentation only
with `RESULT_INCLUDES_PRESENTATION=true` and `RESULT_TOKEN` set; by default its result is a
minimized summary without the disclosed values, and this bridge then fails with a message naming
the flag. The verifier's own checks (decryption, issuer signature, x5c chain to the trust anchor
when `TRUST_ANCHOR_PATH` is set, status list when `LIVE_STATUS` is set, vct, holder binding,
nonce, aud, sd_hash, KB-JWT freshness) run in front of the bridge on this route, and the
verifier and the bridge both see the plaintext presentation: that is the SP1 route's plaintext
boundary. The Noir route does not pass through here; its presentation goes through the verifier's
blind relay as ciphertext, and the bridge receives proof and public inputs only. Which checks
each route performs, and by whom, is tabulated in `docs/trust-boundaries.md`.

## Proof modes

- `mock`: public values from the native run of the statement (real for this session), proof bytes
  and vkey from `PROVER_ARTIFACTS/calldata-groth16.json`. Only a `MockProofVerifier` accepts this;
  the pipeline runs in well under a second. A warning is logged when the fixture's public values
  differ from the session's.
- `execute`: runs the guest ELF, returns cycles and public values, no proof (434,181 cycles for
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

1. Resolved: both proofs commit the issuer credential `exp` only (it used to be
   `min(issuer exp, KB-JWT exp)`, and real ERICA KB-JWTs carry `exp = iat + 300`, so the on-chain
   decision expired five minutes after the presentation). KB-JWT freshness is enforced off
   chain, and where depends on the route: on the SP1 route the bridge checks `iat` (and `exp` when
   present) against its clock after the native statement run (`KB_JWT_WINDOW_SECS`, default 600) and
   answers 422 `KB-JWT freshness: ...` before proving; on the Noir route the bridge never sees
   the KB-JWT, and the companion's `--kb-window` (default 600) is the only freshness check.
   The fixture's expiry (1819756800, 2027-09-01) lies ahead of real time, so the anvil test runs
   on a plain `anvil` and disables the window only for the stale fixture KB-JWT (and checks that
   the default window rejects it).
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

- `cargo test --lib`: ABI encoding of the proof argument and the `publicInputs` layout; decoding of
  the Noir public inputs against `contracts/test/fixtures/noir/public_inputs.bin`; the native
  statement run with synthetic presentations (`nachweis_pid_hostlib::synth`, no real credential):
  a KB-JWT without `exp` passes the default window and commits the issuer `exp`, a stale `iat`
  or an expired `exp` is rejected as `KB-JWT freshness: ...`.
- `cargo test --test anvil`: starts `anvil` on a free port, deploys `AttestationRegistry` and
  `MockProofVerifier` from `contracts/out` (runs `forge build` if missing), sets verifier and
  operator, then drives the HTTP API in mock mode with the fixture vector: nonce matches the
  fixture KB-JWT, address proof (wrong signer 401, right signer sets `address_verified`),
  wrong challenge fails with the statement's nonce error, `attest` emits
  `Attested` with bits `0x3` and `statusRef = keccak(session id)` but `isEligible` stays false
  (`approved` false, session `attested`), the issuer routes answer 401 without the token and 503
  without a configured token, `approve` makes `isEligible` true (session `approved`), `revoke`
  makes it false and blocks re-attestation, `approve` reopens it, `revoke` by session closes it,
  `attest-operator` reopens and approves in one step, revoke again. Skips with
  a message when `anvil` is not installed.
- `cargo test --test anvil reverted_send`: a send that reverts at gas estimation (`approve` on a
  subject without a decision, `NoDecision`) followed by `attestByOperator` and `revoke`, both required
  to land within 10 s and the chain nonce to advance by exactly two. With alloy's cached nonce manager
  the second send is queued one ahead of the chain and never mined (the WP24 observation).
- `cargo test --test anvil noir_proof`: deploys `ZKTranscriptLib`, the bb-generated `HonkVerifier`
  (linked, `optimizer_runs = 1` artifact) and a `NoirPidVerifier` pinned to the fixture issuer, then
  posts `contracts/test/fixtures/noir/{proof,public_inputs}.bin` to `noir-proof`: wrong session
  nonce 422, 85 inputs 400, one flipped proof byte 422 from the `verify` dry run (no tx), the real
  proof attests through the on-chain UltraHonk verification with bits `0x3`, `isEligible` false
  until `approve` with the issuer token makes it true, a second post on the attested session 409, and with `REQUIRE_ADDRESS_PROOF` the endpoint answers
  409 until the bound address has signed.

## Privacy statement

Server mode (this branch): the bridge sees the full presentation (names and other disclosed
claims in the SD-JWT, the holder key, the issuer certificate). It keeps it in process memory for
the session's lifetime, never logs it, never returns it, and never writes it to disk. What leaves
the bridge is the ABI-encoded public values (two hashes, the over-18 bit, the bound address,
expiry, the nonce commitment), the proof, and the `Decision`. The chain learns which address
holds a decision for which policy and nothing else.

Blind-relay mode (`/companion` plus `POST /sessions/:id/noir-proof`): the wallet response is
relayed encrypted to the holder's device, the statement runs and proves there with the Noir
circuit, and the bridge only ever handles the proof bytes and the 86 public input field elements.
See `/companion/README.md` for the end-to-end run.

## Video run

```
export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$HOME/.foundry/bin:$PATH"
cd service && cargo build --release
# anvil in another terminal: plain anvil (the fixture's expiry, 2027-09-01, lies ahead of real time)
export RPC_URL=http://127.0.0.1:8545
export OPERATOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export REGISTRY=<deployed AttestationRegistry with setVerifier(POLICY_ID, verifier) and setOperator(POLICY_ID, operator, true)>
export POLICY_ID=nachweis.pid.over18.v1          # default; keccak256 -> 0xd27260f1…d05f
export REQUIRE_ADDRESS_PROOF=true                # false for a scripted run without a wallet signature
export BRIDGE_ISSUER_TOKEN=local-issuer-token    # bearer token for approve, revoke, attest-operator; unset disables them (503)
export CORS_ORIGINS=http://localhost:5173
export PROOF_MODE=mock                      # or groth16 with SP1_PROVER=cpu and the SP1 adapter as verifier
export PROVER_ARTIFACTS=$PWD/../prover-sp1/fixtures
export PROVER_ELF=$PWD/../prover-sp1/target/elf-compilation/riscv64im-succinct-zkvm-elf/release/nachweis-pid-program
export ISSUER_KEY_SEC1_HEX=$(python3 -c "import json;print(json.load(open('../prover-sp1/fixtures/input.json'))['issuer_key_sec1_hex'])")   # fixture only; unset for a real ERICA credential
export KB_JWT_WINDOW_SECS=0                     # fixture only (its KB-JWT is stale); default 600 for a real presentation
# verifier mode: the verifier runs with RESULT_INCLUDES_PRESENTATION=true and RESULT_TOKEN=<secret>
# export VERIFIER_URL=http://127.0.0.1:8080
# export VERIFIER_RESULT_TOKEN=<secret>
RUST_LOG=info ./target/release/nachweis-bridge
```
