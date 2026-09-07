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
- `src/uniswap/EudiAllowlistChecker.sol`: Uniswap v4 permissioned-pool `IAllowlistChecker` backed by the registry. Interfaces copied from v4-periphery under `src/uniswap/interfaces` and `src/uniswap/libraries`; Sepolia addresses in `src/uniswap/UniswapSepolia.sol`. See `docs/uniswap-permissioned-pool.md`.
- `src/test/MockStable.sol`: unrestricted 6-decimal demo stablecoin for the pool's second currency. Not for deployment beyond testnets.
- `src/interfaces/IProofVerifier.sol`: pluggable proof verifier, one per policy.
- `src/test/MockProofVerifier.sol`: test double with a configurable result. Not for deployment.
- `script/Deploy.s.sol`: deploys and configures everything from env vars. See the header comment; RPC URL and keys come from `.env` (template in `/.env.example`).
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

Planned verifier implementations: SP1 Groth16 via the SP1 verifier gateway (the SP1 program commits these four values as its public values, the adapter decodes them into `bytes32[4]`), and a Noir UltraHonk verifier (public inputs map 1:1).

## Events

- `Attested(subject, policyId, bits, tier, expiry, statusRef, attester)`
- `Revoked(subject, policyId, operator)`
- `OperatorSet(policyId, operator, enabled)`, `VerifierSet(policyId, verifier)`
