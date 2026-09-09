// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {
    BoundData,
    IZKPassportHelper,
    IZKPassportVerifier,
    NullifierType,
    ProofVerificationParams
} from "../../src/zkpassport/interfaces/IZKPassportVerifier.sol";

/// @notice Stand-in for ZKPassportRootVerifier plus its helper, for tests and the local anvil run.
///         It does not verify anything cryptographic. Its contract with the adapter:
///           proof bytes         keccak256(proof) == keccak256("valid") means the root verifier accepts
///           publicInputs        [2] = proof timestamp, [length-2] = unique identifier (as in the real
///                               layout; the mock needs at least 3 entries)
///           committedInputs     abi.encode(address sender, uint256 chainId, uint8 ageAtLeast, bool bound)
///                               bound == false makes getBoundData revert like the real helper does
///                               when no bind disclosure is in the proof
///         The last serviceConfig it was called with is recorded so tests can check that the adapter
///         overrides it with its own immutables.
contract MockZkPassportRoot is IZKPassportVerifier, IZKPassportHelper {
    bytes32 public constant VALID = keccak256("valid");

    bool public paused;
    uint256 public lastValidity;
    string public lastDomain;
    string public lastScope;
    bool public lastDevMode;

    function setPaused(bool p) external {
        paused = p;
    }

    function verify(ProofVerificationParams calldata params)
        external
        view
        returns (bool verified, bytes32 uniqueIdentifier, IZKPassportHelper helper)
    {
        require(!paused, "Root verifier is paused");
        verified = keccak256(params.proofVerificationData.proof) == VALID;
        uint256 n = params.proofVerificationData.publicInputs.length;
        uniqueIdentifier = n >= 2 ? params.proofVerificationData.publicInputs[n - 2] : bytes32(0);
        helper = this;
    }

    /// @dev Not view in the real contract's sense: the mock records the config for assertions.
    function record(ProofVerificationParams calldata params) external {
        lastValidity = params.serviceConfig.validityPeriodInSeconds;
        lastDomain = params.serviceConfig.domain;
        lastScope = params.serviceConfig.scope;
        lastDevMode = params.serviceConfig.devMode;
    }

    function helpers(bytes32) external view returns (IZKPassportHelper) {
        return this;
    }

    function verifyScopes(bytes32[] calldata, string calldata, string calldata) external pure returns (bool) {
        return true;
    }

    function isAgeAboveOrEqual(uint8 minAge, bytes calldata committedInputs) external pure returns (bool) {
        (,, uint8 ageAtLeast,) = abi.decode(committedInputs, (address, uint256, uint8, bool));
        return ageAtLeast >= minAge;
    }

    function getBoundData(bytes calldata committedInputs) external pure returns (BoundData memory b) {
        (address sender, uint256 chainId,, bool bound) = abi.decode(committedInputs, (address, uint256, uint8, bool));
        require(bound, "Bind data proof inputs not found");
        b.senderAddress = sender;
        b.chainId = chainId;
    }

    function getProofTimestamp(bytes32[] calldata publicInputs) external pure returns (uint256) {
        return uint256(publicInputs[2]);
    }

    function getNullifierType(bytes32[] calldata publicInputs) external pure returns (NullifierType) {
        return NullifierType(uint256(publicInputs[publicInputs.length - 3]));
    }
}
