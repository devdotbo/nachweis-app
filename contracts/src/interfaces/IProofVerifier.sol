// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @title IProofVerifier
/// @notice Pluggable proof verifier. One implementation per policy, set by the registry owner.
///         Planned implementations: SP1 Groth16 via the SP1 verifier gateway, Noir UltraHonk verifier.
///         The registry binds publicInputs[0..3] to (subject, policyId, bits, expiry) before calling this.
interface IProofVerifier {
    /// @param proof Opaque proof bytes for the underlying proving system.
    /// @param publicInputs Public inputs, layout documented in AttestationRegistry.attestWithProof.
    /// @return True if the proof is valid for the given public inputs.
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool);

    /// @notice Replay nonce carried by the proof, or bytes32(0) if the proving system has none.
    ///         The registry consumes a non-zero nonce once per policyId, so the same proof cannot be
    ///         submitted twice (tier and statusRef are not proof-bound, replay could rewrite them).
    /// @dev Pure decode only, must not depend on chain state. Reverts on malformed proof bytes.
    function nonceOf(bytes calldata proof) external pure returns (bytes32);
}
