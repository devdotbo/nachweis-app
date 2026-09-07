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

    /// @dev Nonce derivation, unique per distinct proof argument:
    ///      - proof = abi.encode(bytes a, bytes b) (the shape every real adapter uses: SP1 encodes
    ///        (publicValues, proofBytes), Noir encodes (honkProof, publicInputs)): keccak256(a), i.e. the
    ///        hash of the first payload, so the nonce follows the public values / proof and not the
    ///        constant abi offset word;
    ///      - anything else: keccak256(proof).
    ///      An empty proof has no nonce (bytes32(0)), which the registry treats as "no replay protection".
    function nonceOf(bytes calldata proof) external pure returns (bytes32) {
        if (proof.length == 0) return bytes32(0);
        if (_looksLikeTwoBytes(proof)) {
            (bytes memory first,) = abi.decode(proof, (bytes, bytes));
            return keccak256(first);
        }
        return keccak256(proof);
    }

    /// @dev True when `proof` is a well-formed abi.encode(bytes, bytes): two head words with in-bounds
    ///      offsets, each pointing at a length word followed by that many bytes.
    function _looksLikeTwoBytes(bytes calldata proof) private pure returns (bool) {
        if (proof.length < 128) return false;
        uint256 off0 = uint256(bytes32(proof[0:32]));
        uint256 off1 = uint256(bytes32(proof[32:64]));
        if (off0 != 64 || off1 < 96 || off1 + 32 > proof.length) return false;
        uint256 len0 = uint256(bytes32(proof[64:96]));
        if (64 + 32 + len0 > off1) return false;
        uint256 len1 = uint256(bytes32(proof[off1:off1 + 32]));
        return off1 + 32 + len1 <= proof.length;
    }
}
