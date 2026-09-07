# Local end-to-end run without a phone

`scripts/e2e-local.sh` proves the whole pipeline on one machine: verifier-service in bridge
mode receives an encrypted SD-JWT presentation, the bridge fetches it, checks the statement,
generates the SP1 proof and attests on an anvil chain forked from Sepolia, so the real
`SP1VerifierGateway` (`0x397A5f7f3dBd538f23DE225B51f532c34448dA9B`) verifies the Groth16 proof.
Then `subscribe()` mints fund tokens and `revoke` closes the door again.

```
scripts/e2e-local.sh --mode groth16          # the run that matters, about 5 minutes
scripts/e2e-local.sh --mode mock             # fixture proof, MockProofVerifier, 10 seconds
scripts/e2e-local.sh --mode execute          # guest run with cycle count, no proof, 20 seconds
scripts/e2e-local.sh --mode groth16 --keep   # leave anvil, verifier and bridge up for the app
```

Nothing is sent to Sepolia. anvil forks `https://ethereum-sepolia-rpc.publicnode.com`
(`--fork-url` overrides it) and every transaction goes to the local anvil URL. Run state, logs
and per-run summaries live in `.e2e/` (gitignored): `anvil.log`, `verifier.log`, `bridge.log`,
`summary-<mode>.json`, `attest-trace-<mode>.txt`.

## What the script does

1. Builds what is missing: `verifier-service` (release, from the relay worktree, `VERIFIER_REPO`,
   default `../nachweis-verifier-relay`), the guest ELF (`cargo prove build`), the bridge
   (release), `forge build`, `bun install` for the wallet helper.
2. Generates a fresh P-256 issuer key and a self-signed certificate (openssl) and computes
   `sha256(SEC1 uncompressed)` of the key.
3. Starts `anvil --fork-url <Sepolia>` on a free port with the deterministic default accounts:
   account 0 deploys, owns the registry and is the bridge's operator key; account 1 is the
   investor. Checks that the gateway address carries code on the fork.
4. `forge script Deploy.s.sol --broadcast --rpc-url <anvil>` with
   `POLICY_ID = keccak256("nachweis.pid.over18.v1")` and `REQUIRED_BITS = 3`, then
   `DeploySp1Verifier.s.sol` with `REGISTRY_ADDRESS`, the real `SP1_GATEWAY`, the fixture vkey
   and `PID_ISSUER_KEY_HASH` = the hash from step 2 (in mock mode a `MockProofVerifier` is
   deployed instead and registered with `setVerifier`).
5. Starts verifier-service with `PUBLIC_URL=http://127.0.0.1:<port>/`, ephemeral certificate,
   no trust anchor, and reads its `client_id` from the startup log.
6. Starts the bridge in verifier mode (`VERIFIER_URL`, `PROOF_MODE` from `--mode`,
   `EXPECTED_AUD` = the verifier's `client_id`, `PROVER_ELF`, `SP1_PROVER=cpu` for groth16).
7. Drives the flow: `POST /sessions` for the investor, `cast wallet sign` of
   `nachweis:session:<id>` and `POST /sessions/:id/address-proof`, then
   `scripts/e2e/wallet.ts` (bun, `jose`) reads the signed request object from the verifier,
   mints an SD-JWT VC plus KB-JWT for the request's nonce and `client_id`, encrypts it to the
   request's key (ECDH-ES, A128GCM) and posts it to `/response/:id`. The bridge's poller picks
   the presentation up, runs the statement natively, proves, and the script follows the session
   to `proved`, calls `attest` (`attest-operator` in execute mode), reads the receipt's gas,
   then `subscribe()` from the investor key, asserts balance > 0 and `isEligible` true, revokes
   through `POST /revoke`, asserts `isEligible` false and that `subscribe()` reverts with
   `NotEligible`.
8. Prints the timeline and writes `.e2e/summary-<mode>.json`.

### The synthetic wallet

`scripts/e2e/wallet.ts` mirrors `verifier-service/tests/bridge_http.rs` (`mint_presentation`,
`encrypt_to`, `answer_as_wallet`) with three additions the bridge's statement needs and the HTTP
test does not: the `age_equal_or_over` object is disclosed with its own `_sd` anchoring an
`"18": true` disclosure (so `over18 = 1` and bits `0x3`), the issuer JWT carries
`exp = iat + 365 d` (the committed on-chain expiry, `0` would make `Sp1PidVerifier` revert
`Expired`), and the KB-JWT carries `exp = iat + 300` (the bridge's freshness check requires both
`iat` and `exp`). Disclosed: `given_name`, `family_name`, `age_equal_or_over.18`.

### Issuer key pinning

Every run mints with a fresh issuer key, so the issuer key hash pinned in `Sp1PidVerifier` is
that key's hash, passed as `PID_ISSUER_KEY_HASH` to the deploy script. The bridge takes the key
from the `x5c` leaf of the issuer JWT (`ISSUER_KEY_SEC1_HEX` unset), which is the real ERICA
path. A run against the sandbox issuer would leave `PID_ISSUER_KEY_HASH` at the deploy script's
default (the sandbox anchor `0x78cf23…5183`) and would set `TRUST_ANCHOR_PATH` on the verifier.

## Results (2026-09-07, main 1162f2f, M3 Max)

Chain 11155111 (fork), gateway code 1975 bytes at `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B`.
The deterministic deployer gives the same addresses in every run: registry
`0xe8a133308f421aba4C468A4eAA1b0bc88ADb674B`, FundToken `0xe3e131BfAd12666A52640C6d59974089B37b7F23`,
Subscription `0xCdDB057F68563A97A76c798DaaFCeDe08eA977A3`, verifier contract
`0xC3eA1c4E1C262e8a45c7DF144d3c0FAfE53BB13F`.

### mock: PASS, 10.7 s

```
+ 0.08s  issuer-key         sha256(SEC1) = 0x558f08ae…dfef8
+ 1.34s  anvil              chain 11155111 at block 11656200
+ 3.57s  deploy             registry, token, subscription
+ 4.06s  verifier-contract  MockProofVerifier
+ 5.13s  verifier-service   client_id x509_hash:3PuMRCEd…
+ 7.24s  bridge             {"mode":"verifier","proof_mode":"mock"}
+ 7.29s  session-created    nonce 12a68440…
+ 7.35s  address-proof      EIP-191 by 0x7099…79C8 accepted
+ 7.43s  wallet-posted      verifier answered {"status":"verified"}
+ 7.49s  state:created      waiting for the wallet
+ 9.58s  state:proved       mock-groth16, over18 1, expiry 1820345324
+ 9.84s  state:attested     attestWithProof tx 0xb5e4db7d… gas 163529 bits 0x3
+10.31s  subscribe          isEligible true, subscribe() gas 88108, balance 100 NDF
+10.51s  revoke             tx 0xc5d39a5e…
+10.65s  subscribe-blocked  isEligible false, subscribe() reverts NotEligible (0xf8eb54de)
```

`attestWithProof` gas 163,529 with `MockProofVerifier` (fixture proof bytes; the bridge logs the
documented warning that the fixture public values differ from the session's). No gateway call
in this mode.

### execute: PASS, 17.8 s

```
+ 4.29s  bridge             {"mode":"verifier","proof_mode":"execute"}
+ 4.49s  wallet-posted      verifier answered {"status":"verified"}
+ 6.63s  state:proving      generating proof
+17.11s  state:proved       execute, 395173 cycles, over18 1, expiry 1820345974
+17.31s  state:attested     attestByOperator tx 0x37b0a5bb… gas 120569 bits 0x3
+17.47s  subscribe          isEligible true, gas 88108, balance 100 NDF
+17.57s  revoke
+17.76s  subscribe-blocked  isEligible false, NotEligible (0xf8eb54de)
```

395,173 cycles for the minted presentation (four disclosures; the stored fixture takes
434,181). Execute mode produces no proof, so `POST /sessions/:id/attest` would answer 409 as
documented; the script attests through the operator fallback (`attest-operator`,
`attestByOperator`, 120,569 gas) so subscribe and revoke are still exercised. `Sp1PidVerifier`
is deployed but not called in this mode.

### groth16: PASS, 297.3 s (real proof, real gateway on the fork)

```
+ 0.08s  issuer-key         sha256(SEC1) = 0x9a9ad0c1…e2b1 (pinned as PID_ISSUER_KEY_HASH)
+ 2.35s  anvil              chain 11155111 at block 11656322, gateway code 1975 bytes
+ 5.35s  deploy             registry, token, subscription
+ 6.33s  verifier-contract  Sp1PidVerifier, gateway 0x397A5f7f…dA9B, vkey 0x00cc4d3b…f71f
+ 7.50s  verifier-service   client_id x509_hash:j2Xkx9nT…
+ 9.60s  bridge             {"mode":"verifier","proof_mode":"groth16"}
+ 9.66s  session-created    7fc233ed-1618-4cba-8f53-ce69eac2d262, nonce d8833f28…8e63
+ 9.73s  address-proof      EIP-191 by 0x7099…79C8 accepted
+ 9.81s  wallet-posted      verifier answered {"status":"verified"}
+ 9.87s  state:created      waiting for the wallet
+11.96s  state:proving      generating proof
+295.56s state:proved       groth16, over18 1, expiry 1820346837 (bridge: proved in 270.26 s)
+296.44s state:attested     attestWithProof tx 0x543259c9… gas 392649 bits 0x3
+296.83s gateway-call       SP1VerifierGateway 0x397A5f7f…dA9B in the attest trace
+296.99s subscribe          isEligible true, subscribe() gas 88108, balance 100 NDF
+297.09s revoke             tx 0x40733416…
+297.28s subscribe-blocked  isEligible false, subscribe() reverts NotEligible (0xf8eb54de)
```

`attestWithProof` used **392,649 gas** on the fork with the real gateway. `cast run` of the
transaction (`.e2e/attest-trace-groth16.txt`) shows the call chain:

```
[360033] AttestationRegistry::attestWithProof(investor, Decision{policy, bits 3, tier 1, expiry 1820346837, statusRef, false}, proof, publicInputs[4])
  ├─ [2343]   Sp1PidVerifier::nonceOf(proof)                                   [staticcall]
  ├─ [232477] Sp1PidVerifier::verify(proof, publicInputs)                      [staticcall]
  │   └─ [225880] 0x397A5f7f…dA9B SP1VerifierGateway::verifyProof(vkey, publicValues, 0x4388a21c‖groth16)
  │       └─ [219171] 0xb69f2584CBcFf99a58C4e7002E8b89Af54a6f4e2::verifyProof(…)   (SP1 V6.1.0 Groth16 verifier, routed by selector 0x4388a21c)
  │           └─ [214629] Groth16 pairing check                                 -> ok
  └─ emit Attested(subject 0x7099…79C8, policyId, bits 3, tier 1, expiry 1820346837, statusRef, attester 0xf39F…2266)
```

No vkey, public-values or routing mismatch: the fixture vkey pinned in the contracts matches the
ELF built from `prover-sp1/program` at this commit, the 192-byte public values decode to the
session's issuer key hash, vct hash, over18 = 1, the investor address, the issuer expiry and the
nonce, and the gateway routed the `0x4388a21c` selector to the registered V6.1.0 verifier.

Two attempts before this one did not reach the gateway; neither was a pipeline defect:

1. The bridge's `service/Cargo.lock` resolves `sp1-prover 6.7.0` under `sp1-sdk 6.1.0`. That
   version looks for an empty marker file `.complete` in `~/.sp1/circuits/groth16/v6.1.0`
   before it accepts the artifacts; the directory had been filled by the 6.1.0 host (which only
   checks that the directory exists) and carried no marker, so the bridge logged
   `groth16 circuit artifacts for version v6.1.0 are missing or incomplete … downloading` and
   started re-downloading the same 6 GB tarball (`https://sp1-circuits.s3-us-east-2.amazonaws.com/v6.1.0-groth16.tar.gz`)
   at about 1 MB/s. Fix on this machine: `touch ~/.sp1/circuits/groth16/v6.1.0/.complete`.
   The interrupted downloads left `~/.sp1/circuits/groth16/v6.1.0.incomplete.*` directories
   (about 370 MB) that can be deleted.
2. The bridge process disappeared four minutes into the proof with no panic in its log. The
   machine is shared with other sessions running the same binaries; a `pkill nachweis-bridge`
   from elsewhere fits. The script now runs the verifier and the bridge as copies named
   `e2e-verifier-service` and `e2e-nachweis-bridge` under `.e2e/bin/` and reports a bridge that
   died mid-proof explicitly.

## Workarounds and settings needed

- `EXPECTED_AUD` on the bridge must equal the verifier's `client_id`
  (`x509_hash:<base64url sha256 of the leaf DER>`). With the ephemeral certificate it changes
  per verifier start, so the script reads it from the verifier's startup log line
  `client_id  : …`. With `RP_KEY_PATH`/`RP_LEAF_PATH` it would be stable.
- `PUBLIC_URL=http://127.0.0.1:<port>/` works: the HTTPS requirement on `response_uri` is
  enforced by the wallet, not by the service. The synthetic wallet posts directly. Verifier code
  unchanged.
- `KB_JWT_WINDOW_SECS` stays at the default 600: the minted KB-JWT has `iat = now`,
  `exp = now + 300`, so no relaxation was needed. Likewise the verifier's own freshness window.
- `PID_ISSUER_KEY_HASH` per run (see "Issuer key pinning"). No contract fixture was changed.
- No trust anchor on the verifier (`TRUST_ANCHOR_PATH` unset), because the e2e issuer is
  self-signed. Issuer trust for this run is the pinned key hash in `Sp1PidVerifier`.
- Execute mode attests via `attest-operator` (no proof exists in that mode).
- `touch ~/.sp1/circuits/groth16/v6.1.0/.complete` once on a machine whose artifacts were
  downloaded by an sp1-prover 6.1.0 host (see the groth16 section).
- Nothing in the verifier repo was modified; only built and run.
