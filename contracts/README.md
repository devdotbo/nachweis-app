# contracts

Foundry project for the Nachweis on-chain components (Solidity 0.8.28, OpenZeppelin Contracts 5.7.0 vendored under `lib/`).

```
forge build
forge test
```

## Contracts

- `src/AttestationRegistry.sol`: one `Decision` per (subject address, policyId). Operator path and proof path for writing, `IEligibility` for reading.
- `src/FundToken.sol`: ERC-20 whose `_update` hook requires `registry.isEligible(to, policyId, REQUIRED_BITS)` for every transfer and mint. Exceptions: burns (`to == 0`) and transfers to the issuer (redemption). Mint only by the issuer or the `Subscription` contract.
- `src/Subscription.sol`: `subscribe()` mints a fixed demo amount to an eligible caller, otherwise reverts with `NotEligible()`.
- `src/interfaces/IEligibility.sol`: the `Decision` struct and the read interface consumers use (fund token, Uniswap v4 pool allowlist checker). View-only.
- `src/interfaces/IProofVerifier.sol`: pluggable proof verifier, one per policy (`verify` plus `nonceOf` for replay protection).
- `src/sp1/Sp1PidVerifier.sol`: `IProofVerifier` for the SP1 Groth16 proof of the EUDI PID verification (see below).
- `src/sp1/interfaces/ISP1Verifier.sol`: SP1 verifier interface, vendored from sp1-contracts v6.1.0.
- `src/noir/NoirPidVerifier.sol`: `IProofVerifier` for the Noir UltraHonk proof of the same statement, proved client-side (see below).
- `src/noir/PidSdJwtUltraHonkVerifier.sol`: bb-generated `HonkVerifier` for `/circuits/pid-sdjwt` (do not edit; regenerate with the circuit). Compiled with `optimizer_runs = 1`, see the size workaround below.
- `src/noir/interfaces/IHonkVerifier.sol`: the generated verifier's `verify` signature, declared separately so the adapter does not import the 100 KB file.
- `src/uniswap/EudiAllowlistChecker.sol`: Uniswap v4 permissioned-pool `IAllowlistChecker` backed by the registry. Interfaces copied from v4-periphery under `src/uniswap/interfaces` and `src/uniswap/libraries`; Sepolia addresses in `src/uniswap/UniswapSepolia.sol`. See `docs/uniswap-permissioned-pool.md`.
- `src/test/MockProofVerifier.sol`, `src/test/MockSp1Gateway.sol`: test doubles. Not for deployment.
- `src/test/MockStable.sol`: unrestricted 6-decimal demo stablecoin for the pool's second currency. Not for deployment beyond testnets.
- `script/Deploy.s.sol`: deploys and configures everything from env vars. See the header comment; RPC URL and keys come from `.env` (template in `/.env.example`).
- `script/DeploySp1Verifier.s.sol`: deploys `Sp1PidVerifier` for one policy and optionally registers it. Dry run only so far.
- `script/DeployNoirVerifier.s.sol`: deploys `HonkVerifier` (or reuses one) and `NoirPidVerifier` for one policy, optionally registers it. Dry run only so far.
- `script/CreatePermissionedPool.s.sol`: onboards the FundToken into a Uniswap v4 permissioned pool on Sepolia (deploy guide steps 1 to 6). Dry-run only so far.

## Decision layout

```solidity
struct Decision {
    bytes32 policyId;   // issuer policy identifier, e.g. keccak256 of a policy document hash
    uint256 bits;       // predicate bits the policy verified; meaning is per policy
    uint8   tier;       // issuer-defined tier, informational
    uint64  expiry;     // unix timestamp; decision counts only while expiry > block.timestamp
    bytes32 statusRef;  // opaque reference to an off-chain status entry, never a name
    bool    revoked;    // set by revoke(); sticky for the proof path
}
```

No names, no strings, no personal data. The demo policy uses bit 0 = adult, bit 1 = EU resident, bit 2 = not sanctioned; `REQUIRED_BITS = 0x7`.

`isEligible(subject, policyId, requiredBits)` is true iff the decision is not revoked, `expiry > block.timestamp`, and `(bits & requiredBits) == requiredBits`. A missing decision has `expiry == 0` and is never eligible.

## Roles

- Owner (registry deployer): `setOperator(policyId, operator, enabled)`, `setVerifier(policyId, verifier)`. The owner is not automatically an operator.
- Operator (issuer key, per policy): `attestByOperator(subject, decision)`, `revoke(subject, policyId)`. Re-attesting after revoke is an explicit operator action.
- Anyone: `attestWithProof(subject, decision, proof, publicInputs)` once a verifier is set for the policy. The proof binds the decision to the subject, so submission is permissionless.
- Issuer (fund token): `setSubscription` once, `mint`, receives redemptions without an eligibility check.

## publicInputs layout for proof verifiers

`attestWithProof` requires exactly 4 public inputs and checks them before calling `IProofVerifier.verify(proof, publicInputs)`:

| index | value |
|---|---|
| 0 | `bytes32(uint256(uint160(subject)))` |
| 1 | `decision.policyId` |
| 2 | `bytes32(decision.bits)` |
| 3 | `bytes32(uint256(decision.expiry))` |

`tier` and `statusRef` are caller-supplied and not bound by the proof in this layout; consumers gate on `bits` only. A future layout can add `[4] = tier` and `[5] = statusRef`. A revoked decision cannot be reopened through the proof path (a valid proof could otherwise be replayed to undo a revoke).

Replay protection: before verifying, the registry asks the verifier for `nonceOf(proof)`. A non-zero nonce is consumed once per policy (`nonceConsumed[keccak256(abi.encode(policyId, nonce))]`), a second submission reverts with `NonceConsumed`. Verifiers without a nonce return `bytes32(0)` and skip the check. Without this, a published proof could be resubmitted by anyone to rewrite the unbound `tier` and `statusRef` or to restore proof bits after an operator lowered them.

Implemented: SP1 Groth16 via the SP1 verifier gateway (`Sp1PidVerifier`) and Noir UltraHonk verified on chain (`NoirPidVerifier`). Both bind the same four registry inputs and derive the same bits, so a policy can switch between them with `setVerifier`.

## Sp1PidVerifier (SP1 Groth16, EUDI PID)

Adapter for the proof produced by `/prover-sp1` (SP1 6.1.0, Groth16 wrapper). One instance per policy; everything is immutable, rotate by deploying a new instance and calling `setVerifier`.

Constructor: `(ISP1Verifier gateway, bytes32 programVKey, bytes32 issuerKeyHash, bytes32 vctHash, bytes32 policyId)`.

Pinned values for the sandbox fixture (`/prover-sp1/fixtures/calldata-groth16.json`, `vkey.txt`):

| name | value |
|---|---|
| gateway (Sepolia SP1VerifierGateway) | `0x397A5f7f3dBd538f23DE225B51f532c34448dA9B` |
| programVKey | `0x00b092add2a7d3fffa027c1178c7b0d77155f3c9e078925928fcfce4b39a4cc9` |
| issuerKeyHash = sha256(issuer P-256 key, SEC1 uncompressed) | `0x841e741b14eacdfdeca2e96fd95af5b987b5b872f88f8e359df29f7635556656` (synthetic sandbox issuer) |
| vctHash = sha256("urn:eudi:pid:de:1") | `0x27b2d76921e41420732d759e6a3f345b9132e37fae97b1930f39ec58cf9a567d` |
| policyId (default in the deploy script) | `keccak256("nachweis.pid.over18.v1")` |

The issuer key hash is the trust anchor: the guest verifies the issuer signature under a private-input key and commits its hash, the contract accepts only the pinned hash. The x5c chain to a real trust list is not checked anywhere yet.

### Proof argument encoding

`attestWithProof(subject, decision, proof, publicInputs)` with

```
proof        = abi.encode(bytes publicValues, bytes sp1ProofBytes)
publicValues = the 192-byte ABI encoding the guest commits (fixture field "publicValues")
sp1ProofBytes = SP1 proof.bytes(): 4-byte verifier selector (0x4388a21c for v6.1.0) + Groth16 proof
                (fixture field "proof", 356 bytes)
```

`publicValues` decodes as

```solidity
struct PublicValues {
    bytes32 issuerKeyHash;  // must equal the pinned ISSUER_KEY_HASH
    bytes32 vctHash;        // must equal the pinned VCT_HASH
    uint8   over18;         // 1 or 0
    address subject;        // must equal publicInputs[0]
    uint64  expiry;         // must equal publicInputs[3] and be > block.timestamp
    bytes32 nonce;          // sha256(subject20 || challenge32), consumed by the registry
}
```

### Bits mapping

| bit | constant | meaning |
|---|---|---|
| 0 | `BIT_IDENTITY` | identity evidence accepted; always set (the proof only exists if issuer signature, disclosures, key binding and nonce verified) |
| 1 | `BIT_OVER_18` | set iff `over18 == 1` |

`publicInputs[2]` must equal exactly `bitsOf(publicValues)`, so `decision.bits` is `0x3` for an adult and `0x1` otherwise. Bits are exact, not a subset.

### Checks and failure mode

`verify` reverts with a typed error instead of returning false, so a failed submission reports which binding broke: `PublicInputsLength`, `PublicValuesLength`, `IssuerKeyHashMismatch`, `VctHashMismatch`, `SubjectMismatch`, `PolicyMismatch`, `BitsMismatch`, `ExpiryMismatch`, `Expired`. After the bindings pass it calls `gateway.verifyProof(PROGRAM_VKEY, publicValues, sp1ProofBytes)`; the gateway reverts on an invalid proof and that revert bubbles up unchanged. The registry's `InvalidProof` is therefore never hit by this verifier.

### Building the calldata from the prover output

Given `calldata-groth16.json` (`vkey`, `publicValues`, `proof`, `decoded.{subject, over18, expiry, nonce}`):

1. `bits = 1 | (decoded.over18 == 1 ? 2 : 0)`
2. `decision = { policyId, bits, tier: 0, expiry: decoded.expiry, statusRef: 0x0, revoked: false }` (tier and statusRef are free, they are not proof-bound)
3. `publicInputs = [bytes32(decoded.subject), policyId, bytes32(bits), bytes32(decoded.expiry)]`
4. `proof = abi.encode(publicValues, proof)` (viem: `encodeAbiParameters([{type:'bytes'},{type:'bytes'}], [publicValues, proof])`; on-chain helper `Sp1PidVerifier.encodeProof(publicValues, sp1Proof)`)
5. `registry.attestWithProof(decoded.subject, decision, proof, publicInputs)` from any account; the subject does not have to be the sender.

The subject's wallet does not sign anything here; the binding comes from the KB-JWT nonce `sha256(subject || challenge)` proven in the guest. The service that hands out the challenge should also submit the transaction, or hand the calldata to the front end.

### Tests

`forge test` runs the unit tests with `MockSp1Gateway` (accepts registered `(vkey, publicValues)` pairs) and decodes the real fixture through the registry with `vm.warp` before its expiry. `test/Sp1PidVerifier.fork.t.sol` forks Sepolia and calls the real gateway with the fixture (valid proof passes, tampered public values and tampered proof revert, full registry path with `vm.warp` because the fixture's expiry, 2026-06-02, is in the past). It runs only when `SEPOLIA_RPC_URL` is set and is skipped otherwise. Read-only, no transaction is sent.

## NoirPidVerifier (Noir UltraHonk, EUDI PID)

Adapter for the proof produced client-side by `/circuits/pid-sdjwt` (Noir 1.0.0-beta.21, Barretenberg 5.0.0-nightly.20260324, `-t evm`: keccak transcript, ZK). The proof is verified fully on chain by the bb-generated `HonkVerifier` (`src/noir/PidSdJwtUltraHonkVerifier.sol`), no external gateway. One `NoirPidVerifier` per policy; everything is immutable, rotate by deploying a new instance and calling `setVerifier`. A new circuit means a new VK and a new `HonkVerifier` as well.

Constructor: `(IHonkVerifier honk, bytes32 issuerKeyHash, bytes32 policyId)`.

Pinned values for the fixture (`test/fixtures/noir`, same PID vector as the SP1 fixture):

| name | value |
|---|---|
| HonkVerifier `VK_HASH` | `0x088cdfce8cb5f69fd4da9d6be6b0917024077ad54422fbf334821690bcc21e47` (constant in the generated file, equals `bb write_vk` `vk_hash`) |
| issuerKeyHash = sha256(issuer P-256 key, SEC1 uncompressed) | `0x841e741b14eacdfdeca2e96fd95af5b987b5b872f88f8e359df29f7635556656` (synthetic sandbox issuer) |
| policyId (default in the deploy script) | `keccak256("nachweis.pid.over18.v1")` |

The circuit pins `vct` (`urn:eudi:pid:de:1`) as a constant, so there is no `vctHash` to pin here. The issuer key hash is the trust anchor, as for the SP1 adapter; the x5c chain is not checked anywhere.

### Proof argument encoding

`attestWithProof(subject, decision, proof, publicInputs)` with

```
proof            = abi.encode(bytes honkProof, bytes32[] honkPublicInputs)
honkProof        = the bb `proof` file, verbatim (10,304 bytes for this circuit; the HonkVerifier checks the length)
honkPublicInputs = the bb `public_inputs` file split into 86 words of 32 bytes (bytes32 each)
```

viem: `encodeAbiParameters([{type:'bytes'},{type:'bytes32[]'}], [proof, publicInputs])`; on-chain helper `NoirPidVerifier.encodeProof(honkProof, honkPublicInputs)`. Tests: `abi.encode(f.proof, f.publicInputs)`.

### Public input layout (86 field elements)

The circuit exposes one byte per field element except `expiry`:

| index | value | reconstructed as |
|---|---|---|
| 0..19 | `subject` (20 bytes, big endian) | `address`, must equal `publicInputs[0]` |
| 20..51 | `issuer_key_hash` (32 bytes) | `bytes32`, must equal the pinned `ISSUER_KEY_HASH` |
| 52 | `over18` (u8) | 1 or 0 |
| 53 | `expiry` (u64 unix seconds, min of issuer `exp` and KB-JWT `exp`) | must equal `publicInputs[3]` and be `> block.timestamp` |
| 54..85 | `nonce` (32 bytes) = sha256(subject20 ‖ challenge32) | `bytes32`, returned by `nonceOf`, consumed by the registry |

`decodeProof` requires exactly 86 elements, every byte element `< 256` (`FieldNotByte(index, value)`) and `expiry < 2^64` (`FieldNotU64`). A valid proof never trips these (the circuit constrains the types); they stop a malformed submission before the 2.85 M gas honk call.

### Bits mapping

Same as the SP1 adapter: bit 0 `BIT_IDENTITY` always set, bit 1 `BIT_OVER_18` iff `over18 == 1`; `publicInputs[2]` must equal exactly `bitsOf(publicValues)` (`0x3` for an adult, `0x1` otherwise).

### Checks and failure mode

`verify` reverts with a typed error: `PublicInputsLength`, `HonkPublicInputsLength`, `FieldNotByte`, `FieldNotU64`, `IssuerKeyHashMismatch`, `SubjectMismatch`, `PolicyMismatch`, `BitsMismatch`, `ExpiryMismatch`, `Expired`. After the bindings pass it calls `HONK.verify(honkProof, honkPublicInputs)`. The generated verifier reverts on a bad proof or tampered public inputs (`SumcheckFailed()`, `ShpleminiFailed()`, `ProofLengthWrongWithLogN(...)`, `PublicInputsLengthWrong()`) and that revert bubbles up unchanged; a `false` return (not produced by the current generator) becomes `HonkVerifyFailed()`.

Gas: `attestWithProof` with the fixture costs about 3.02 M gas (measured in `test_attestWithProofSetsDecision`, of which about 2.85 M is the honk verification with `optimizer_runs = 1`). Noir trades gas for having no prover service.

### EIP-170 size workaround

The generated `HonkVerifier` runtime is 25,176 bytes at the project's `optimizer_runs = 200`, 600 bytes over the 24,576 byte limit, and 24,246 bytes at `optimizer_runs = 1` (`via_ir` fails with stack too deep). The generated file is not edited. Instead `foundry.toml` declares an additional compiler profile `honk` (`optimizer_runs = 1`) and a `compilation_restrictions` entry that applies it to `src/noir/PidSdJwtUltraHonkVerifier.sol` only:

```toml
[[profile.default.additional_compiler_profiles]]
name = "honk"
optimizer_runs = 1

[[profile.default.compilation_restrictions]]
paths = "src/noir/PidSdJwtUltraHonkVerifier.sol"
optimizer_runs = 1
```

One `forge build` compiles that file in its own solc job at runs 1 and everything else at runs 200; the artifact `out/PidSdJwtUltraHonkVerifier.sol/HonkVerifier.json` is the runs-1 build, so `new HonkVerifier()` in tests and in the deploy script deploys the 24,246 byte code (asserted by `test_honkVerifierFitsEip170` and by the script). `forge build --sizes` reports the margin (330 bytes). After changing `foundry.toml` run `forge clean` once, a stale `out/` can otherwise still hold the runs-200 artifact. Side effect: contracts that import the generated file (the Noir test and the deploy script) are compiled in the runs-1 job as well, so the `NoirPidVerifier` they deploy is the runs-1 variant (`out/NoirPidVerifier.sol/NoirPidVerifier.honk.json`, 3,376 bytes) instead of the canonical runs-200 artifact (3,448 bytes); both are functionally identical.

Deploy (dry run, nothing is sent; `HONK_VERIFIER` reuses an existing deployment):

```
forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url sepolia
```

### Tests

`test/NoirPidVerifier.t.sol` deploys the real `HonkVerifier` and runs the real proof from `test/fixtures/noir` (copied from the bb output, provenance and hashes in `SOURCE.md`; `vm.warp` before the fixture expiry 2026-06-02). Covered: happy path through the registry, flipped `over18` and rebound subject rejected by the honk verifier (`SumcheckFailed`), tampered proof bytes, wrong pinned issuer key hash, subject/policy/bits/expiry mismatch, expired, nonce replay, malformed field elements (byte `>= 256`, expiry `>= 2^64`, wrong element count), and the EIP-170 size of the deployed verifier. No fork test: nothing is called off chain.

## Events

- `Attested(subject, policyId, bits, tier, expiry, statusRef, attester)`
- `Revoked(subject, policyId, operator)`
- `OperatorSet(policyId, operator, enabled)`, `VerifierSet(policyId, verifier)`
