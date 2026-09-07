// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IProofVerifier} from "../interfaces/IProofVerifier.sol";

/// @notice Test double: returns a configurable result. Not for deployment.
contract MockProofVerifier is IProofVerifier {
    bool public result;

    constructor(bool initial) {
        result = initial;
    }

    function setResult(bool value) external {
        result = value;
    }

    function verify(bytes calldata, bytes32[] calldata) external view returns (bool) {
        return result;
    }
}
