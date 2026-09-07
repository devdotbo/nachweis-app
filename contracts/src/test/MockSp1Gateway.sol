// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ISP1Verifier} from "../sp1/interfaces/ISP1Verifier.sol";

/// @notice Test double for the SP1 verifier gateway: accepts only (vkey, publicValues) pairs that were
///         registered with accept(), reverts otherwise. Ignores the proof bytes. Not for deployment.
contract MockSp1Gateway is ISP1Verifier {
    error MockProofRejected(bytes32 programVKey, bytes32 publicValuesHash);

    mapping(bytes32 => bool) public accepted;

    function key(bytes32 programVKey, bytes calldata publicValues) public pure returns (bytes32) {
        return keccak256(abi.encode(programVKey, keccak256(publicValues)));
    }

    function accept(bytes32 programVKey, bytes calldata publicValues, bool ok) external {
        accepted[key(programVKey, publicValues)] = ok;
    }

    function verifyProof(bytes32 programVKey, bytes calldata publicValues, bytes calldata) external view {
        if (!accepted[key(programVKey, publicValues)]) revert MockProofRejected(programVKey, keccak256(publicValues));
    }
}
