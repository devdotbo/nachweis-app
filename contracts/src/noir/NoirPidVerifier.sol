// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IProofVerifier} from "../interfaces/IProofVerifier.sol";
import {IHonkVerifier} from "./interfaces/IHonkVerifier.sol";

/// @title NoirPidVerifier
/// @notice IProofVerifier adapter for the Noir UltraHonk proof of the EUDI PID (SD-JWT) verification
///         (circuits/pid-sdjwt, proved client-side with Barretenberg, keccak transcript, ZK).
///         One instance per policy. It pins the HonkVerifier (which embeds the circuit's verification
///         key) and the trust anchor (issuer key hash), binds the registry's four public inputs to the
///         circuit's public inputs and forwards proof and public inputs to the HonkVerifier.
///
/// Proof argument (IProofVerifier.verify `proof`):
///   abi.encode(bytes honkProof, bytes32[] honkPublicInputs)
///   honkProof         bb `proof` file (evm target), 10,304 bytes for this circuit
///   honkPublicInputs  bb `public_inputs` file split into 86 field elements of 32 bytes, in order:
///     [0..20)   subject            one byte per field element (big endian address)
///     [20..52)  issuer_key_hash    one byte per field element, sha256(0x04 || x || y) of the issuer key
///     [52]      over18             u8, 1 or 0
///     [53]      expiry             u64 unix seconds, min(issuer exp, KB-JWT exp)
///     [54..86)  nonce              one byte per field element, sha256(subject20 || challenge32)
///   Every byte field must be < 256 and expiry < 2^64; anything else is malformed and reverts before
///   the HonkVerifier is called (the circuit itself constrains them, so a valid proof never trips this).
///
/// Bits mapping (Decision.bits for this policy):
///   bit 0 (BIT_IDENTITY)  identity evidence accepted: always set, the proof only exists if the
///                         issuer signature, disclosures, key binding and nonce all verified
///   bit 1 (BIT_OVER_18)   set iff over18 == 1
///
/// Failure mode: verify reverts with a typed error instead of returning false, so the caller sees
/// which binding failed. The HonkVerifier reverts (Errors.SumcheckFailed, Errors.ShpleminiFailed,
/// Errors.ProofLengthWrongWithLogN, ...) on an invalid proof; that revert bubbles up unchanged. Should
/// it ever return false, verify reverts with HonkVerifyFailed.
/// Configuration is immutable; rotate the anchor or circuit by deploying a new instance (and, for a new
/// circuit, a new HonkVerifier) and calling AttestationRegistry.setVerifier.
contract NoirPidVerifier is IProofVerifier {
    /// @dev Public values reconstructed from the circuit's 86 public input field elements.
    struct PublicValues {
        address subject; // Ethereum address bound through the KB-JWT nonce
        bytes32 issuerKeyHash; // sha256(issuer P-256 key, SEC1 uncompressed, 65 bytes)
        uint8 over18; // 1 or 0
        uint64 expiry; // unix seconds, min(issuer exp, KB-JWT exp)
        bytes32 nonce; // sha256(subject20 || challenge32), replay nonce
    }

    error PublicInputsLength(uint256 got, uint256 want);
    error HonkPublicInputsLength(uint256 got, uint256 want);
    error FieldNotByte(uint256 index, uint256 value);
    error FieldNotU64(uint256 index, uint256 value);
    error IssuerKeyHashMismatch(bytes32 got, bytes32 want);
    error SubjectMismatch(address got, address want);
    error PolicyMismatch(bytes32 got, bytes32 want);
    error BitsMismatch(uint256 got, uint256 want);
    error ExpiryMismatch(uint64 got, uint64 want);
    error Expired(uint64 expiry, uint256 blockTimestamp);
    error HonkVerifyFailed();

    uint256 public constant BIT_IDENTITY = 1 << 0;
    uint256 public constant BIT_OVER_18 = 1 << 1;
    uint256 public constant PUBLIC_INPUTS_LENGTH = 4;

    /// @dev Layout of the circuit's public inputs (field element indices).
    uint256 public constant HONK_PUBLIC_INPUTS_LENGTH = 86;
    uint256 public constant SUBJECT_OFFSET = 0;
    uint256 public constant ISSUER_KEY_HASH_OFFSET = 20;
    uint256 public constant OVER18_INDEX = 52;
    uint256 public constant EXPIRY_INDEX = 53;
    uint256 public constant NONCE_OFFSET = 54;

    IHonkVerifier public immutable HONK;
    bytes32 public immutable ISSUER_KEY_HASH;
    bytes32 public immutable POLICY_ID;

    constructor(IHonkVerifier honk, bytes32 issuerKeyHash, bytes32 policyId) {
        HONK = honk;
        ISSUER_KEY_HASH = issuerKeyHash;
        POLICY_ID = policyId;
    }

    /// @inheritdoc IProofVerifier
    /// @dev publicInputs layout is the registry's: [subject, policyId, bits, expiry].
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != PUBLIC_INPUTS_LENGTH) {
            revert PublicInputsLength(publicInputs.length, PUBLIC_INPUTS_LENGTH);
        }
        (PublicValues memory pv, bytes memory honkProof, bytes32[] memory honkPublicInputs) = decodeProof(proof);

        if (pv.issuerKeyHash != ISSUER_KEY_HASH) revert IssuerKeyHashMismatch(pv.issuerKeyHash, ISSUER_KEY_HASH);

        address subject = address(uint160(uint256(publicInputs[0])));
        if (pv.subject != subject) revert SubjectMismatch(pv.subject, subject);
        if (publicInputs[1] != POLICY_ID) revert PolicyMismatch(publicInputs[1], POLICY_ID);
        uint256 bits = bitsOf(pv);
        if (uint256(publicInputs[2]) != bits) revert BitsMismatch(uint256(publicInputs[2]), bits);
        uint64 expiry = uint64(uint256(publicInputs[3]));
        if (pv.expiry != expiry) revert ExpiryMismatch(pv.expiry, expiry);
        if (pv.expiry <= block.timestamp) revert Expired(pv.expiry, block.timestamp);

        if (!HONK.verify(honkProof, honkPublicInputs)) revert HonkVerifyFailed();
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

    /// @notice Splits the proof argument and reconstructs the public values from the field elements.
    ///         Reverts on a wrong element count or an out-of-range field (byte >= 256, expiry >= 2^64).
    function decodeProof(bytes calldata proof)
        public
        pure
        returns (PublicValues memory pv, bytes memory honkProof, bytes32[] memory honkPublicInputs)
    {
        (honkProof, honkPublicInputs) = abi.decode(proof, (bytes, bytes32[]));
        if (honkPublicInputs.length != HONK_PUBLIC_INPUTS_LENGTH) {
            revert HonkPublicInputsLength(honkPublicInputs.length, HONK_PUBLIC_INPUTS_LENGTH);
        }
        pv.subject = address(uint160(_packBytes(honkPublicInputs, SUBJECT_OFFSET, 20)));
        pv.issuerKeyHash = bytes32(_packBytes(honkPublicInputs, ISSUER_KEY_HASH_OFFSET, 32));
        pv.over18 = uint8(_byteAt(honkPublicInputs, OVER18_INDEX));
        uint256 expiry = uint256(honkPublicInputs[EXPIRY_INDEX]);
        if (expiry > type(uint64).max) revert FieldNotU64(EXPIRY_INDEX, expiry);
        pv.expiry = uint64(expiry);
        pv.nonce = bytes32(_packBytes(honkPublicInputs, NONCE_OFFSET, 32));
    }

    /// @notice Builds the proof argument from the prover output (convenience for callers and tests).
    function encodeProof(bytes calldata honkProof, bytes32[] calldata honkPublicInputs)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(honkProof, honkPublicInputs);
    }

    /// @dev Big-endian packing of `count` byte-valued field elements starting at `offset`.
    function _packBytes(bytes32[] memory fields, uint256 offset, uint256 count) private pure returns (uint256 acc) {
        for (uint256 i = offset; i < offset + count; i++) {
            acc = (acc << 8) | _byteAt(fields, i);
        }
    }

    function _byteAt(bytes32[] memory fields, uint256 index) private pure returns (uint256 value) {
        value = uint256(fields[index]);
        if (value > 0xff) revert FieldNotByte(index, value);
    }
}
