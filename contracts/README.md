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
- `src/uniswap/EudiAllowlistChecker.sol`: Uniswap v4 permissioned-pool `IAllowlistChecker` backed by the registry. Interfaces copied from v4-periphery under `src/uniswap/interfaces` and `src/uniswap/libraries`; Sepolia addresses in `src/uniswap/UniswapSepolia.sol`. See the section "Uniswap v4 permissioned pool" below and `docs/uniswap-permissioned-pool.md`.
- `src/test/MockProofVerifier.sol`, `src/test/MockSp1Gateway.sol`: test doubles. Not for deployment.
- `src/test/MockStable.sol`: unrestricted 6-decimal demo stablecoin for the pool's second currency. Not for deployment beyond testnets.
- `script/Deploy.s.sol`: deploys and configures everything from env vars. See the header comment; RPC URL and keys come from `.env` (template in `/.env.example`).
- `script/DeploySp1Verifier.s.sol`: deploys `Sp1PidVerifier` for one policy and optionally registers it. Dry run only so far.
- `script/CreatePermissionedPool.s.sol`: onboards the FundToken into a Uniswap v4 permissioned pool on Sepolia (deploy guide steps 1 to 6, shared with the fork tests through `script/lib/PermissionedPoolOnboarding.sol`). Dry-run only so far.
- `script/AddLiquidityPermissioned.s.sol`, `script/SwapPermissioned.s.sol` (both on `script/PermissionedPoolScriptBase.s.sol`): the initial liquidity mint through the PermissionedPositionManager and an investor swap through the permissioned Universal Router; `REVOKE_INVESTOR=true` shows the swap failing after a revoke. Dry-run only so far.

## Uniswap v4 permissioned pool

The FundToken trades in a Uniswap v4 permissioned pool on Sepolia. The pool's allowlist checker reads `AttestationRegistry.isEligible`, so one revoke closes token transfers, subscriptions and the pool. Uniswap code is used in these files and lines:

| File | Lines | What |
|---|---|---|
| `src/uniswap/EudiAllowlistChecker.sol` | 1 to 67 | `IAllowlistChecker` implementation (`checkAllowlist` at 58 to 61, ERC-165 at 64 to 66); the contract Uniswap's `PermissionsAdapter` calls |
| `src/uniswap/interfaces/IAllowlistChecker.sol`, `libraries/PermissionFlags.sol`, `interfaces/IPermissionsAdapterFactory.sol` | whole files | copied from v4-periphery `src/hooks/permissionedPools` (MIT, commit in each header) |
| `src/uniswap/interfaces/IPermissionsAdapterLite.sol`, `IPoolManagerLite.sol`, `IPermissionedPositionManagerLite.sol`, `IUniversalRouterLite.sol`, `IPermit2Lite.sol`, `IStateViewLite.sol` | whole files | ABI subsets of PermissionsAdapter, PoolManager, PermissionedPositionManager, the permissioned Universal Router, Permit2 and StateView |
| `src/uniswap/libraries/PermissionedPoolActions.sol` | 25 to 32 (`ExactInputSingleParams`), 35 to 58 (mint calldata), 63 to 89 (V4_SWAP calldata), 92 to 94 (PoolId) | the bytes the position manager and the router decode |
| `src/uniswap/libraries/TickMath.sol`, `LiquidityAmounts.sol` | whole files | trimmed copies from v4-core (MIT) |
| `src/uniswap/UniswapSepolia.sol` | 1 to 37 | the Sepolia addresses and how each was verified |
| `script/lib/PermissionedPoolOnboarding.sol` | 32 to 93 (`onboard`: deploy guide steps 1 to 6), 95 to 97 (initial price) | factory `createPermissionsAdapter` / `verifyPermissionsAdapter`, adapter `depositForVerification` / `updateAllowedWrapper` / `updateAllowedHook` / `updateSwappingEnabled`, `PoolManager.initialize` with `PermissionedHooks` |
| `script/CreatePermissionedPool.s.sol` | 52 to 74 | step 0 (Nachweis contracts) and the call into the onboarding library; step 7 printed at 89 to 95 |
| `script/PermissionedPoolScriptBase.s.sol` | 54 to 103 (load or bootstrap the pool), 128 to 131 (`StateView.getSlot0`), 134 to 165 (size a position), 167 to 197 (Permit2 approvals and `modifyLiquidities`) | shared script plumbing |
| `script/AddLiquidityPermissioned.s.sol` | 24 to 54 | the liquidity mint |
| `script/SwapPermissioned.s.sol` | 33 to 92 (Permit2 approvals at 77 to 78, `UniversalRouter.execute` at 79) | the investor swap and the revoke beat |
| `test/EudiAllowlistChecker.t.sol` | whole file | checker unit tests |
| `test/PermissionedPoolFactory.t.sol` | 21 to 210 (real factory and adapter bytecode from `test/fixtures/PermissionsAdapterFactory.json`), 212 to 255 (Sepolia fork: live factory) | onboarding steps 1 to 5 |
| `test/PermissionedPoolSwap.fork.t.sol` | 62 to 96 (onboard and mint on a Sepolia fork), 187 to 286 (mint, swap, revoke, unattested cases) | the full sequence against the live PoolManager, hook, position manager, router and Permit2 |

Deployed Sepolia contracts used (all Uniswap Labs deployments, verified read-only on 2026-09-07): PoolManager 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543, PermissionsAdapterFactory 0xE6B0d96919334C33d06266d1420F97f6f434fA2B, PermissionedHooks 0x51247E2291d290d17C08813A175AC86465EdE8c0, PermissionedPositionManager 0xf99D553912084c99F6299291b75Fe9B7119Aa1A7, permissioned Universal Router 0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7, Permit2 0x000000000022D473030F116dDEE9F6B43aC78BA3, StateView 0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C, V4Quoter 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227, MixedRouteQuoterV2 0x4745F77b56a0E2294426E3936dc4Fab68d9543Cd.

Fork tests (`SEPOLIA_RPC_URL` set): 6 tests, all passing on 2026-09-07. Details, dry-run results and the viem calldata for the app: `docs/uniswap-permissioned-pool.md`. Developer feedback for Uniswap: `/FEEDBACK.md`.

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

No names, no strings, no personal data. The demo policy requires `REQUIRED_BITS = 0x3` (`FundToken.DEFAULT_REQUIRED_BITS`, the bits the proof path can assert):

| bit | value | meaning | required |
|---|---|---|---|
| 0 | 0x1 | identity evidence accepted | yes |
| 1 | 0x2 | over 18 | yes |
| 2 | 0x4 | EU resident (reserved, not provable yet) | no |
| 3 | 0x8 | not sanctioned (reserved, not provable yet) | no |

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

Implemented: SP1 Groth16 via the SP1 verifier gateway (`Sp1PidVerifier`). Planned: a Noir UltraHonk verifier (public inputs map 1:1).

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

## Events

- `Attested(subject, policyId, bits, tier, expiry, statusRef, attester)`
- `Revoked(subject, policyId, operator)`
- `OperatorSet(policyId, operator, enabled)`, `VerifierSet(policyId, verifier)`
