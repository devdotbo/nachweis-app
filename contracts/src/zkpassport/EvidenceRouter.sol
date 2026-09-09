// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IProofVerifier} from "../interfaces/IProofVerifier.sol";

/// @title EvidenceRouter
/// @notice Lets one policyId accept two evidence routes. AttestationRegistry maps a policyId to exactly
///         one IProofVerifier, and the fund token, the subscription contract and the pool checker are
///         each pinned to one policyId; so a second route under the same decision needs a verifier that
///         dispatches. Proofs whose first 32 bytes equal `tag` go to `tagged` (ZkPassportVerifier, whose
///         proof argument starts with its ROUTE_TAG); everything else goes to `fallback_` unchanged
///         (NoirPidVerifier or Sp1PidVerifier, whose ABI-encoded arguments start with an offset word
///         that can never equal a keccak256 tag).
///
/// Removal of the zkPassport route: AttestationRegistry.setVerifier(policyId, fallback) and delete this
/// directory; the EUDI route never learns the router existed.
contract EvidenceRouter is IProofVerifier {
    IProofVerifier public immutable TAGGED;
    IProofVerifier public immutable FALLBACK;
    bytes32 public immutable TAG;

    constructor(IProofVerifier tagged, IProofVerifier fallback_, bytes32 tag) {
        TAGGED = tagged;
        FALLBACK = fallback_;
        TAG = tag;
    }

    /// @inheritdoc IProofVerifier
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        return route(proof).verify(proof, publicInputs);
    }

    /// @inheritdoc IProofVerifier
    function nonceOf(bytes calldata proof) external view returns (bytes32) {
        return route(proof).nonceOf(proof);
    }

    /// @notice The verifier a proof argument is dispatched to.
    function route(bytes calldata proof) public view returns (IProofVerifier) {
        if (proof.length >= 32 && bytes32(proof[:32]) == TAG) return TAGGED;
        return FALLBACK;
    }
}
