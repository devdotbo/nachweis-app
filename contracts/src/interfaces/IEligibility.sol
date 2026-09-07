// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @notice One eligibility decision per (subject, policyId). No names, no strings, no personal data.
/// @param policyId Issuer policy identifier (e.g. keccak256 of a policy document hash).
/// @param bits Predicate bits the policy verified (e.g. bit 0 = age over 18, bit 1 = EU resident). Meaning is per policy.
/// @param tier Issuer-defined tier (e.g. retail / professional). Informational, not enforced by the registry.
/// @param expiry Unix timestamp after which the decision no longer counts.
/// @param statusRef Opaque reference to an off-chain status entry (e.g. hash of a status list URI + index). Never a name.
/// @param revoked True once an operator revoked the decision.
struct Decision {
    bytes32 policyId;
    uint256 bits;
    uint8 tier;
    uint64 expiry;
    bytes32 statusRef;
    bool revoked;
}

/// @title IEligibility
/// @notice Read interface used by consumers (FundToken transfer hook, Uniswap v4 pool allowlist checker).
///         View-only, no side effects.
interface IEligibility {
    /// @notice True if the subject holds a live decision for policyId that covers all requiredBits.
    function isEligible(address subject, bytes32 policyId, uint256 requiredBits) external view returns (bool);

    /// @notice Raw decision record; zero-valued if none exists.
    function decisionOf(address subject, bytes32 policyId) external view returns (Decision memory);
}
