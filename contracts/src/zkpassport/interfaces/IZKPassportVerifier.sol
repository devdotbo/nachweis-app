// SPDX-License-Identifier: Apache-2.0
// Vendored subset of the zkPassport on-chain verifier interface. Structs and enums copied from
// https://github.com/zkpassport/zkpassport-packages/blob/main/packages/registry-contracts/src/lib/Types.sol
// (commit 2c37fe9, fetched 2026-09-09), function signatures from RootVerifier.sol and VerifierHelper.sol
// in the same package (pragma ^0.8.30 there; pinned to 0.8.28 here, interface only, no bytecode is
// vendored). Copyright 2026 ZKPassport, Apache-2.0.
pragma solidity 0.8.28;

/// @dev Calldata for ZKPassportRootVerifier.verify, produced by the SDK's getSolidityVerifierParameters.
struct ProofVerificationParams {
    bytes32 version;
    ProofVerificationData proofVerificationData;
    bytes committedInputs;
    ServiceConfig serviceConfig;
}

struct ProofVerificationData {
    bytes32 vkeyHash;
    bytes proof;
    bytes32[] publicInputs;
}

/// @dev The root verifier checks domain and scope against the proof's public inputs, the proof date
///      against validityPeriodInSeconds and refuses mock-passport proofs unless devMode is set.
struct ServiceConfig {
    uint256 validityPeriodInSeconds;
    string domain;
    string scope;
    bool devMode;
}

/// @dev Data the prover bound into the proof through bind("user_address" | "chain" | "custom_data").
struct BoundData {
    address senderAddress;
    uint256 chainId;
    string customData;
}

/// @dev Trailing public input [length-3] of every zkPassport proof.
enum NullifierType {
    NON_SALTED_NULLIFIER,
    SALTED_NULLIFIER,
    NON_SALTED_MOCK_NULLIFIER,
    SALTED_MOCK_NULLIFIER,
    NONE_NULLIFIER
}

/// @title IZKPassportVerifier
/// @notice ZKPassportRootVerifier, one deterministic address on every supported network
///         (0x1D000001000EFD9a6371f4d90bB8920D5431c0D8 on Ethereum mainnet, Ethereum Sepolia, Base).
interface IZKPassportVerifier {
    /// @return verified True if the proof is valid.
    /// @return uniqueIdentifier Scoped nullifier of the identity document (per domain and scope).
    /// @return helper Version-specific helper that decodes committedInputs and publicInputs.
    function verify(ProofVerificationParams calldata params)
        external
        view
        returns (bool verified, bytes32 uniqueIdentifier, IZKPassportHelper helper);

    function paused() external view returns (bool);
    function helpers(bytes32 version) external view returns (IZKPassportHelper);
}

/// @title IZKPassportHelper
/// @notice Subset of ZKPassport's VerifierHelper used by ZkPassportVerifier.
interface IZKPassportHelper {
    function verifyScopes(bytes32[] calldata publicInputs, string calldata domain, string calldata scope)
        external
        pure
        returns (bool);
    function isAgeAboveOrEqual(uint8 minAge, bytes calldata committedInputs) external pure returns (bool);
    function getBoundData(bytes calldata committedInputs) external pure returns (BoundData memory);
    function getProofTimestamp(bytes32[] calldata publicInputs) external pure returns (uint256);
    // getNullifierType exists in the monorepo source but not in the helper deployed for version 0.20.0
    // on Sepolia (fork test 2026-09-09: the call reverts); read publicInputs[length-3] directly instead.
}
