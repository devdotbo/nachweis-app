# nachweis-companion

The holder's own device in the blind-relay flow. The official EUDI test wallet on the phone
presents to the verifier as usual, but the verifier only relays an encrypted response it cannot
open (`verifier-service` blind relay, `docs/blind-relay.md` in the verifier repo). This CLI, on
the holder's laptop, generated the encryption key, picks the response up, decrypts it, checks the
statement, proves it in zero knowledge with `/circuits/pid-sdjwt` (Noir, Barretenberg UltraHonk,
evm target), and hands only the proof and its 86 public inputs to the bridge, which sends
`attestWithProof` through `NoirPidVerifier` to the `AttestationRegistry`. Nobody but the holder's
device sees a name.

TypeScript on bun (1.3). Dependencies: `jose` (JWE ECDH-ES), `qrcode` (terminal QR), `viem`
(`--direct` submission and the EIP-191 address proof). `nargo` and `bb` must be installed
(nargo 1.0.0-beta.21, bb 5.0.0-nightly.20260324, see `/circuits/README.md`); `bb prove` takes
about 4 to 6 s on an M3 Max and 1.9 GB of memory.

```
cd companion && bun install
bun run src/cli.ts help
bun test                      # 21 tests: nonce vectors, statement pre-check on the SP1 fixture, minted
                              # presentation vs gen-prover.ts, x5c leaf round trip, JWE round trip, public inputs,
                              # two-device handoff parser (JSON, URI, bridge body, rejections)
```

## Commands

| command | what it does |
|---|---|
| `request` | ephemeral P-256 ECDH key pair, random 32-byte challenge, `POST /relay/request {client_jwk, bound_address, challenge}`; fetches the signed request object and checks that it advertises this key and this nonce (the one check `docs/blind-relay.md` asks a client to make) before printing the `openid4vp://` URI and its QR. Session file written 0600 with the private key, the pickup token, nothing else yet |
| `wait` | polls `GET /relay/status/:id` until `responded` (`--timeout 600`, `--interval 2`) |
| `pickup` | `GET /relay/response/:id` with `X-Pickup-Token` (one-time), decrypts the JWE (ECDH-ES, A128GCM or A256GCM) with the private key, stores the SD-JWT presentation in the session file. Never prints it unless `--show` |
| `prove` | native pre-check with the rules of `prover-sp1/lib` (issuer ES256, vct, disclosures anchored in `_sd`, `age_equal_or_over.18`, KB-JWT under `cnf.jwk`, `aud`, `sd_hash`, nonce = sha256(address ‖ challenge)) plus KB-JWT freshness (`--kb-window 600`, 0 disables); issuer key from the `x5c` leaf (`--issuer-key-sec1` overrides); `Prover.toml` through `circuits/tools/gen-prover.ts` (spawned, unchanged); `nargo execute`; `bb prove -t evm`; `bb verify`; decodes the 86 public inputs and cross-checks them against the pre-check. Working files (input.json, Prover toml, witness) are 0600 and removed afterwards |
| `submit` | bridge path: `POST /sessions {bound_address, challenge_hex}` (same nonce), EIP-191 address proof signed with `--wallet-key`, then `POST /sessions/:id/noir-proof {proof_hex, public_inputs_hex[86], tier}`. `--direct`: sends `attestWithProof` itself with `--sender-key` to `--registry` over `--rpc` and reads back `isEligible` |
| `run` | all of the above in one go, with a timeline at the end. `--stub-wallet ISSUER_KEY_FILE` answers the request inline instead of a phone |
| `handoff X` | two-device flow, the companion as the phone. `X` is what the investor's browser shows after the wallet signed the bridge session ("Prove on your phone" card): the compact JSON `{v:1,s,a,c,r,b}`, the `nachweis://handoff?…` URI, or the bridge's `GET /sessions/:id/handoff` body (`src/handoff.ts` parses all three and recomputes the nonce). Checks that the bridge session exists, still waits for a proof, is bound to that address and carries that nonce, then runs `request` with the handoff's address and challenge (same nonce), `wait` (or `--stub-wallet`), `pickup`, `prove`, and `submit` against THAT bridge session id: no new session, no address proof (the browser wallet gave it; without it the bridge answers 409). `--verifier`/`--bridge` fill URLs the handoff does not carry |
| `status` | the session without secrets or claims; `--registry` adds `isEligible` |
| `issuer-key FILE` | the test issuer: creates a P-256 key and a self-signed leaf plus a self-signed "CA" certificate (two-certificate `x5c`, about 580 DER bytes each, with the extensions of a sandbox issuer certificate; 0600), prints the SEC1 key and its sha256, which `NoirPidVerifier` pins |
| `mint-test-presentation` | the phone stand-in, mirroring `verifier-service/tests/bridge_http.rs` (`mint_presentation`, `answer_as_wallet`): reads the signed request, mints an SD-JWT VC in the 23-claim German PID layout (`vct urn:eudi:pid:de:1`, two-certificate `x5c`, `exp` one year, `cnf.jwk` fresh holder key in ERICA's key order, `status.status_list`, 12 top-level digests, nested `age_equal_or_over`, `address`, `place_of_birth`; disclosures given_name, family_name, `age_equal_or_over.18`) plus a KB-JWT (header with `kid` as ERICA sends it; `nonce`, `aud` = the pinned `client_id`, `iat`, `exp = iat + 300`, `sd_hash`), encrypts to the advertised key, `POST /response/:id`. `--age-shape nested|disclosed|plain` picks how the age object arrives (`circuits/pid-sdjwt/REALISM.md`, section 3), `--minimal` the older three-digest layout |
| `mint-fixture` | the same minter without a verifier: writes `prover-sp1/fixtures/<name>-input.json` and `<name>-over18.sdjwt` (default name `realistic`) with the SP1 fixture's subject and challenge, so the Noir fixtures in `contracts/test/fixtures/noir` can be regenerated (`--issuer-key`, `--out`, `--name`, `--age-shape`, `--issuer-exp`) |

Environment: `NACHWEIS_COMPANION_DIR` (default `~/.nachweis-companion`), `NACHWEIS_SESSION`,
`NACHWEIS_VERIFIER_URL`, `NACHWEIS_BRIDGE_URL`, `NACHWEIS_ADDRESS`, `NACHWEIS_WALLET_KEY`,
`NACHWEIS_CIRCUIT_DIR`, `NACHWEIS_VK`, `NACHWEIS_RPC_URL`, `NACHWEIS_REGISTRY`, `NACHWEIS_SENDER_KEY`.

## End-to-end run on this machine (2026-09-07, M3 Max)

Four processes: verifier-service (blind relay), anvil, the bridge, the companion. No phone: the
companion's `--stub-wallet` mints the presentation and posts it the way the wallet does.

```
export PATH="$HOME/.nargo/bin:$HOME/.bb:$HOME/.foundry/bin:$HOME/.cargo/bin:$HOME/.bun/bin:$PATH"
K0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80          # anvil account 0: deployer, operator
K1=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d          # anvil account 1: the holder's wallet
POLICY=0xd27260f1ca509ba75dea6cd27b2985a96e423550e16db3350d2945e215e3d05f      # keccak256("nachweis.pid.over18.v1")

# 1. verifier-service from the relay worktree (plain http PUBLIC_URL, as its own HTTP tests do)
(cd ../../nachweis-verifier-relay && cargo build -p verifier-service && \
 PORT=8090 PUBLIC_URL=http://127.0.0.1:8090/ ./target/debug/verifier-service)

# 2. anvil, plain
anvil --port 8545 --silent

# 3. test issuer key (its hash is what NoirPidVerifier pins), then the contracts
export NACHWEIS_COMPANION_DIR=/tmp/companion-e2e
bun run src/cli.ts issuer-key /tmp/companion-e2e/issuer.json
#   -> issuer_key_hash 0xfd94cbca40a0b33820c5042bb169a0b45f5e59207e766de7a596093a05280c5a
(cd ../contracts && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY \
   forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast)
#   -> AttestationRegistry 0x5FbDB2315678afecb367f032d93F642f64180aa3
(cd ../contracts && DEPLOYER_PRIVATE_KEY=$K0 POLICY_ID=$POLICY \
   REGISTRY_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3 \
   PID_ISSUER_KEY_HASH=0xfd94cbca40a0b33820c5042bb169a0b45f5e59207e766de7a596093a05280c5a \
   forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url http://127.0.0.1:8545 --broadcast)
#   -> HonkVerifier 0x0165878A594ca255338adfa4d48449f69242Eb8F (24,247 bytes runtime)
#      NoirPidVerifier 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853, registered with setVerifier

# 4. the bridge (local mode; the Noir path needs no prover artifacts)
(cd ../service && cargo build --release && \
 BIND=127.0.0.1:8788 RPC_URL=http://127.0.0.1:8545 OPERATOR_PRIVATE_KEY=$K0 \
 REGISTRY=0x5FbDB2315678afecb367f032d93F642f64180aa3 NOIR_VERIFIER=0xa513E6E4b8f2a923D98304ec87F64353C4D5C853 \
 POLICY_ID=nachweis.pid.over18.v1 REQUIRE_ADDRESS_PROOF=true ./target/release/nachweis-bridge)

# 5. the companion, with the stand-in wallet
bun run src/cli.ts run --verifier http://127.0.0.1:8090 --bridge http://127.0.0.1:8788 \
  --address 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 --wallet-key $K1 \
  --stub-wallet /tmp/companion-e2e/issuer.json --session /tmp/companion-e2e/run1.json
```

Recorded timeline of step 5 (relay session `aa7d4435-c509-46b1-83b1-7c0cb9ca55ca`):

```
    0.01 s  +  0.01 s  relay session created
    0.05 s  +  0.04 s  stand-in wallet posted the JWE          (mint, ECDH-ES A128GCM encrypt, POST /response/:id)
    0.05 s  +  0.00 s  wallet responded (status responded)
    0.05 s  +  0.00 s  JWE picked up                           (one-time pickup, 3,437 chars)
    0.06 s  +  0.00 s  JWE decrypted locally                   (vp_token[pid]: SD-JWT, 3 disclosures, 2,333 bytes)
    4.64 s  +  4.58 s  proved (bb prove 3.96 s)                (pre-check 1 ms, gen-prover 24 ms, nargo execute 0.58 s,
                                                                bb prove 3.96 s, bb verify 10 ms; proof 10,304 bytes, 86 inputs)
    5.29 s  +  0.66 s  attested on chain                       (bridge session, address proof, verify dry run, attestWithProof)
```

With a phone the "wallet responded" line is the human step (scan, consent, network); everything
else stays as measured. An earlier run of the same flow proved in 5.67 s (first `bb prove` after
start, page cache cold).

What was asserted afterwards, independently of the companion's own output:

- The verifier never held plaintext. Its log carries two lines for the relay sessions, both
  `relay: stored the wallet's encrypted response unopened`; `grep -ci 'erika\|mustermann\|vp_token\|given_name\|eyJ'`
  over the log is 0; `GET /relay/status/aa7d4435…` answers `picked_up` and a second pickup with
  the right token answers 410 (the ciphertext left the process on hand-over).
- The bridge never received a presentation: it has no endpoint for one on this path, its log has
  0 plaintext markers, `GET /sessions/:id` shows `proof_system noir-ultrahonk` and no presentation.
- The companion decrypted and proved: `prove` cross-checks the 86 decoded public inputs (subject
  `0x7099…79c8`, issuer key hash `0xfd94…0c5a`, over18 1, expiry 1820346363, nonce `0xda7a…7feb`)
  against its native pre-check, and `bb verify` passed before submission.
- The chain verified: tx `0x65df7408…` used 4,582,956 gas (the on-chain UltraHonk verification),
  `cast call AttestationRegistry.isEligible(0x7099…79c8, POLICY, 3)` is `true`,
  `decisionOf` is `(POLICY, bits 3, tier 1, expiry 1820346363, statusRef keccak(bridge session id), revoked false)`;
  an unrelated address answers `false`.

The same session file can be submitted without the bridge:
`bun run src/cli.ts submit --direct --session … --registry 0x5FbD… --sender-key $K0` sends
`attestWithProof(subject, Decision, abi.encode(bytes proof, bytes32[] inputs), [subject, policyId, 3, expiry])`
itself (any funded key may send; the registry checks the proof, not the sender).

## Two devices: browser wallet plus phone prover

`scripts/two-device-local.sh` in the repo root runs the whole thing on this machine with this CLI as
the phone (`docs/two-device.md` has the recorded timeline): the "browser" part is curl plus
`cast wallet sign` (session, EIP-191 address proof, `GET /sessions/:id/handoff`), the "phone" part is
`companion handoff "$(curl -s $BRIDGE/sessions/$SID/handoff)" --stub-wallet issuer.json`.

## With the iPhone

What changes: only the "wallet responded" step. Instead of `--stub-wallet`, run
`bun run src/cli.ts run …` without it, scan the QR the companion prints with the official EUDI
test wallet, consent to the registered minimal ask (given_name, family_name, age_equal_or_over.18).
The wallet fetches the signed request from `request_uri`, encrypts its `direct_post.jwt` response
to the companion's key (`client_metadata.jwks`, `kid relay-enc-key`), and posts it to the verifier;
`wait` sees `responded` and the rest runs unchanged.

Prerequisites on the verifier side for that scan, from `docs/live-phone-path.md` in the relay
repo: an HTTPS `PUBLIC_URL` reachable from the phone (tunnel), the registrar leaf
(`RP_KEY_PATH`, `RP_LEAF_PATH`) so the `client_id` is the registered one, and
`TRUST_ANCHOR_PATH` (which the relay path does not use to verify, the companion does the checking).

What is unverified until the phone run, and how the companion handles it:

1. The wallet accepting a client-generated encryption key in `client_metadata.jwks` (the open
   question in `docs/blind-relay.md`). If it refuses, the wallet does not post and `wait` times out.
2. Resolved (circuit realism pass, `circuits/pid-sdjwt/REALISM.md`). The circuit pins
   `"aud":"x509_hash:VE3qp3vLVkU8JyVmXkjL7CSDVxVoTFdTv5fAEwmjKOI"`, the `client_id` of the
   registered registrar leaf (`fixtures/live/access-leaf.pem` in the relay repo), and `prove`
   and the stand-in default to the same string (`PINNED_AUD` in `src/util.ts`, checked against
   `constants.nr` by a test). What remains open: whether the sandbox wallet sends the
   `x509_hash` client_id (spec) or the literal `https://self-issued.me/v2` (ERICA's simulator
   does); in the second case the constant is one line, plus VK, verifier and fixtures. A new
   registrar leaf changes the constant the same way. The bridge's SP1 path (`EXPECTED_AUD`)
   still defaults to the literal; set it to the `client_id` for a real wallet.
3. The issuer key. `prove` takes it from the `x5c` leaf, as the bridge does for a real credential;
   `NoirPidVerifier` must be deployed with `PID_ISSUER_KEY_HASH` = sha256 of the sandbox issuer's
   SEC1 key (the circuit does not check the x5c chain, the contract pins the key).
4. Resolved as far as it can be without a captured sandbox PID (`REALISM.md`, sections 3, 4
   and 7). Bounds now fit a reconstructed 23-claim PID with margin (payload 2304 raw bytes,
   header 2304 base64url chars, KB header with `kid`, KB payload 384); the age object may be
   nested in the payload, disclosed with nested digests, or disclosed with plain values; digest
   order, whitespace and key order do not matter. Still assumed: `"vct":"urn:eudi:pid:de:1"`
   (three vct literals are in circulation), an `exp` in the issuer payload, `alg`/`typ` within
   the first 96 decoded header bytes. `gen-prover.ts` refuses with the exact reason otherwise.
5. `enc`. The wallet may pick A256GCM; both are accepted on decrypt.

## Privacy statement

The ephemeral private key, the pickup token, the decrypted presentation and the proof live in
one session file (0600, `NACHWEIS_COMPANION_DIR`). Files that carry the presentation during
proving (input.json, the `Prover-companion-*.toml` in the circuit package, the witness) are
0600 and removed when `prove` returns, also on failure. Nothing prints a claim value unless
`pickup --show` is asked for. Logs go to stderr and name claim names, byte counts, hashes,
addresses and the nonce, never values. What leaves the device: the public key and the
challenge (to the verifier), the proof, the 86 public inputs and an EIP-191 signature (to the
bridge or the chain).
