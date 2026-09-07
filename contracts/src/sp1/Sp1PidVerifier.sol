// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IProofVerifier} from "../interfaces/IProofVerifier.sol";
import {ISP1Verifier} from "./interfaces/ISP1Verifier.sol";

/// @title Sp1PidVerifier
/// @notice IProofVerifier adapter for the SP1 Groth16 proof of the EUDI PID (SD-JWT) verification.
///         One instance per policy. It pins the SP1 program (vkey), the trust anchor (issuer key
///         hash) and the credential type (vct hash), binds the registry's four public inputs to the
///         proof's public values and forwards the proof to the SP1 verifier gateway.
///
/// Proof argument (IProofVerifier.verify `proof`):
///   abi.encode(bytes publicValues, bytes sp1ProofBytes)
///   publicValues  192 bytes, ABI encoding of PublicValues exactly as committed by the guest
///   sp1ProofBytes SP1 `proof.bytes()`: 4-byte verifier selector followed by the Groth16 proof
///
/// Bits mapping (Decision.bits for this policy):
///   bit 0 (BIT_IDENTITY)  identity evidence accepted: always set, the proof only exists if the
///                         issuer signature, disclosures, key binding and nonce all verified
///   bit 1 (BIT_OVER_18)   set iff the proof's over18 value is 1
///
/// Failure mode: verify reverts with a typed error instead of returning false, so the caller sees
/// which binding failed. The gateway reverts on an invalid proof; that revert bubbles up unchanged.
/// Configuration is immutable; rotate the anchor or program by deploying a new instance and calling
/// AttestationRegistry.setVerifier.
contract Sp1PidVerifier is IProofVerifier {
    /// @dev Public values committed by the SP1 guest, ABI encoded (6 static words).
    struct PublicValues {
        bytes32 issuerKeyHash; // sha256(issuer P-256 key, SEC1 uncompressed, 65 bytes)
        bytes32 vctHash; // sha256(vct string), e.g. sha256("urn:eudi:pid:de:1")
        uint8 over18; // 1 or 0
        address subject; // Ethereum address bound through the KB-JWT nonce
        uint64 expiry; // unix seconds, min(issuer exp, KB-JWT exp), 0 if none
        bytes32 nonce; // sha256(subject20 || challenge32), replay nonce
    }

    error PublicInputsLength(uint256 got, uint256 want);
    error PublicValuesLength(uint256 got, uint256 want);
    error IssuerKeyHashMismatch(bytes32 got, bytes32 want);
    error VctHashMismatch(bytes32 got, bytes32 want);
    error SubjectMismatch(address got, address want);
    error PolicyMismatch(bytes32 got, bytes32 want);
    error BitsMismatch(uint256 got, uint256 want);
    error ExpiryMismatch(uint64 got, uint64 want);
    error Expired(uint64 expiry, uint256 blockTimestamp);

    uint256 public constant BIT_IDENTITY = 1 << 0;
    uint256 public constant BIT_OVER_18 = 1 << 1;
    uint256 public constant PUBLIC_VALUES_LENGTH = 6 * 32;
    uint256 public constant PUBLIC_INPUTS_LENGTH = 4;

    ISP1Verifier public immutable GATEWAY;
    bytes32 public immutable PROGRAM_VKEY;
    bytes32 public immutable ISSUER_KEY_HASH;
    bytes32 public immutable VCT_HASH;
    bytes32 public immutable POLICY_ID;

    constructor(ISP1Verifier gateway, bytes32 programVKey, bytes32 issuerKeyHash, bytes32 vctHash, bytes32 policyId) {
        GATEWAY = gateway;
        PROGRAM_VKEY = programVKey;
        ISSUER_KEY_HASH = issuerKeyHash;
        VCT_HASH = vctHash;
        POLICY_ID = policyId;
    }

    /// @inheritdoc IProofVerifier
    /// @dev publicInputs layout is the registry's: [subject, policyId, bits, expiry].
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != PUBLIC_INPUTS_LENGTH) {
            revert PublicInputsLength(publicInputs.length, PUBLIC_INPUTS_LENGTH);
        }
        (PublicValues memory pv, bytes memory publicValues, bytes memory sp1Proof) = decodeProof(proof);

        if (pv.issuerKeyHash != ISSUER_KEY_HASH) revert IssuerKeyHashMismatch(pv.issuerKeyHash, ISSUER_KEY_HASH);
        if (pv.vctHash != VCT_HASH) revert VctHashMismatch(pv.vctHash, VCT_HASH);

        address subject = address(uint160(uint256(publicInputs[0])));
        if (pv.subject != subject) revert SubjectMismatch(pv.subject, subject);
        if (publicInputs[1] != POLICY_ID) revert PolicyMismatch(publicInputs[1], POLICY_ID);
        uint256 bits = bitsOf(pv);
        if (uint256(publicInputs[2]) != bits) revert BitsMismatch(uint256(publicInputs[2]), bits);
        uint64 expiry = uint64(uint256(publicInputs[3]));
        if (pv.expiry != expiry) revert ExpiryMismatch(pv.expiry, expiry);
        if (pv.expiry <= block.timestamp) revert Expired(pv.expiry, block.timestamp);

        GATEWAY.verifyProof(PROGRAM_VKEY, publicValues, sp1Proof);
        return true;
    }

    /// @inheritdoc IProofVerifier
    function nonceOf(bytes calldata proof) external pure returns (bytes32) {
        (PublicValues memory pv,,) = decodeProof(proof);
        return pv.nonce;
    }

    /// @notice Decision.bits this verifier derives from the public values.
    function bitsOf(PublicValues memory pv) public pure returns (uint256) {
        return BIT_IDENTITY | (pv.over18 == 1 ? BIT_OVER_18 : 0);
    }

    /// @notice Splits the proof argument and decodes the public values.
    function decodeProof(bytes calldata proof)
        public
        pure
        returns (PublicValues memory pv, bytes memory publicValues, bytes memory sp1Proof)
    {
        (publicValues, sp1Proof) = abi.decode(proof, (bytes, bytes));
        if (publicValues.length != PUBLIC_VALUES_LENGTH) {
            revert PublicValuesLength(publicValues.length, PUBLIC_VALUES_LENGTH);
        }
        pv = abi.decode(publicValues, (PublicValues));
    }

    /// @notice Builds the proof argument from the prover output (convenience for callers and tests).
    function encodeProof(bytes calldata publicValues, bytes calldata sp1Proof) external pure returns (bytes memory) {
        return abi.encode(publicValues, sp1Proof);
    }
}
