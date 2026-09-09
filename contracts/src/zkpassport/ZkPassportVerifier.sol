// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IProofVerifier} from "../interfaces/IProofVerifier.sol";
import {
    BoundData,
    IZKPassportHelper,
    IZKPassportVerifier,
    ProofVerificationParams,
    ServiceConfig
} from "./interfaces/IZKPassportVerifier.sol";

/// @title ZkPassportVerifier
/// @notice IProofVerifier adapter for the zkPassport route: the investor proves in the zkPassport app,
///         with the chip of their own biometric passport (or national ID), that they are at least 18
///         and binds their Ethereum address and the chain into the proof. This adapter forwards the
///         proof to ZKPassportRootVerifier and maps the outcome onto the registry's four public inputs
///         [subject, policyId, bits, expiry]. One instance per (policy, domain, scope).
///
/// Proof argument (IProofVerifier.verify `proof`):
///   abi.encodePacked(ROUTE_TAG, abi.encode(ProofVerificationParams))
///   ROUTE_TAG   keccak256("nachweis.zkpassport.v1"), 32 bytes; lets EvidenceRouter tell this route
///               from the EUDI (Noir) proof, whose first word is an ABI offset and never equals the tag
///   params      exactly what the zkPassport SDK method getSolidityVerifierParameters returns for the
///               "outer_evm_*" proof of a compressed-evm request; params.serviceConfig is ignored and
///               replaced by this adapter's immutables before the call (domain, scope, devMode and the
///               validity window are trust decisions of the deployer, not of the submitter)
///
/// Bits mapping (Decision.bits for this policy):
///   bit 0 (BIT_IDENTITY)      identity evidence accepted: always set, the proof only exists if the
///                             root verifier accepted the passport signature chain and the disclosure
///   bit 1 (BIT_OVER_18)       set iff the proof's age check is "age >= 18"
///   bit 2 (BIT_PASSPORT_CHIP) route marker: evidence came from a passport chip through zkPassport;
///                             consumers that require 0x3 accept this decision like an EUDI one,
///                             the Attested event and UIs can still tell the routes apart
///
/// Expiry: the proof carries its generation date (publicInputs[2] of the zkPassport proof); the decision
/// expires DECISION_TTL seconds after that date. The root verifier itself refuses proofs older than
/// VALIDITY_SECONDS at submission time.
///
/// Replay: nonceOf returns keccak256 of the zkPassport public inputs. Every proof generation carries a
/// fresh timestamp, so a new proof by the same passport is a new nonce (renewal after expiry works),
/// while the same proof submitted twice reverts in the registry with NonceConsumed. The scoped nullifier
/// (uniqueIdentifier) is deliberately not the nonce: consuming it would block renewal forever.
///
/// Failure mode: like the other adapters, verify reverts with a typed error instead of returning false.
/// Reverts of the root verifier ("Invalid certificate registry root", "Mock proofs are only allowed in
/// dev mode", "The proof was generated outside the validity period", ...) bubble up unchanged.
contract ZkPassportVerifier is IProofVerifier {
    error PublicInputsLength(uint256 got, uint256 want);
    error RouteTagMismatch(bytes32 got, bytes32 want);
    error ProofTooShort(uint256 length);
    error RootVerifierRejected();
    error NotOver18();
    error SubjectMismatch(address got, address want);
    error ChainMismatch(uint256 got, uint256 want);
    error PolicyMismatch(bytes32 got, bytes32 want);
    error BitsMismatch(uint256 got, uint256 want);
    error ExpiryMismatch(uint64 got, uint64 want);
    error Expired(uint64 expiry, uint256 blockTimestamp);

    uint256 public constant BIT_IDENTITY = 1 << 0;
    uint256 public constant BIT_OVER_18 = 1 << 1;
    uint256 public constant BIT_PASSPORT_CHIP = 1 << 2;
    uint256 public constant BITS = BIT_IDENTITY | BIT_OVER_18 | BIT_PASSPORT_CHIP;
    uint256 public constant PUBLIC_INPUTS_LENGTH = 4;
    uint8 public constant MIN_AGE = 18;
    bytes32 public constant ROUTE_TAG = keccak256("nachweis.zkpassport.v1");

    IZKPassportVerifier public immutable ROOT;
    bytes32 public immutable POLICY_ID;
    /// @notice Domain the SDK request was created for (the web origin's hostname); part of the proof scope.
    string public DOMAIN;
    /// @notice Scope string passed to the SDK request; part of the proof scope and of the nullifier.
    string public SCOPE;
    /// @notice True accepts mock passports of the "Zero Knowledge Republic" (dev mode); never on mainnet.
    bool public immutable DEV_MODE;
    /// @notice Maximum proof age the root verifier accepts at submission (SDK default: 7 days).
    uint256 public immutable VALIDITY_SECONDS;
    /// @notice Decision lifetime counted from the proof's generation date.
    uint64 public immutable DECISION_TTL;

    constructor(
        IZKPassportVerifier root,
        bytes32 policyId,
        string memory domain,
        string memory scope,
        bool devMode,
        uint256 validitySeconds,
        uint64 decisionTtl
    ) {
        ROOT = root;
        POLICY_ID = policyId;
        DOMAIN = domain;
        SCOPE = scope;
        DEV_MODE = devMode;
        VALIDITY_SECONDS = validitySeconds;
        DECISION_TTL = decisionTtl;
    }

    /// @inheritdoc IProofVerifier
    /// @dev publicInputs layout is the registry's: [subject, policyId, bits, expiry].
    function verify(bytes calldata proof, bytes32[] calldata publicInputs) external view returns (bool) {
        if (publicInputs.length != PUBLIC_INPUTS_LENGTH) {
            revert PublicInputsLength(publicInputs.length, PUBLIC_INPUTS_LENGTH);
        }
        ProofVerificationParams memory params = decodeProof(proof);
        params.serviceConfig = ServiceConfig(VALIDITY_SECONDS, DOMAIN, SCOPE, DEV_MODE);

        (bool verified, /* uniqueIdentifier */, IZKPassportHelper helper) = ROOT.verify(params);
        if (!verified) revert RootVerifierRejected();

        // Predicate: the disclosure proof compared the birth date against "age >= 18" (the query's gte).
        if (!helper.isAgeAboveOrEqual(MIN_AGE, params.committedInputs)) revert NotOver18();

        // Binding: the prover put the subject address and the chain id into the proof.
        BoundData memory bound = helper.getBoundData(params.committedInputs);
        address subject = address(uint160(uint256(publicInputs[0])));
        if (bound.senderAddress != subject) revert SubjectMismatch(bound.senderAddress, subject);
        if (bound.chainId != block.chainid) revert ChainMismatch(bound.chainId, block.chainid);

        if (publicInputs[1] != POLICY_ID) revert PolicyMismatch(publicInputs[1], POLICY_ID);
        if (uint256(publicInputs[2]) != BITS) revert BitsMismatch(uint256(publicInputs[2]), BITS);

        uint64 expiry = expiryOf(helper.getProofTimestamp(params.proofVerificationData.publicInputs));
        uint64 claimed = uint64(uint256(publicInputs[3]));
        if (claimed != expiry) revert ExpiryMismatch(claimed, expiry);
        if (expiry <= block.timestamp) revert Expired(expiry, block.timestamp);
        return true;
    }

    /// @inheritdoc IProofVerifier
    function nonceOf(bytes calldata proof) external pure returns (bytes32) {
        ProofVerificationParams memory params = decodeProof(proof);
        return keccak256(abi.encodePacked(params.proofVerificationData.publicInputs));
    }

    /// @notice Decision expiry for a proof generated at `proofTimestamp` (unix seconds).
    function expiryOf(uint256 proofTimestamp) public view returns (uint64) {
        return uint64(proofTimestamp) + DECISION_TTL;
    }

    /// @notice Checks the route tag and decodes the SDK parameters. Reverts on a malformed argument.
    function decodeProof(bytes calldata proof) public pure returns (ProofVerificationParams memory params) {
        if (proof.length < 32) revert ProofTooShort(proof.length);
        bytes32 tag = bytes32(proof[:32]);
        if (tag != ROUTE_TAG) revert RouteTagMismatch(tag, ROUTE_TAG);
        params = abi.decode(proof[32:], (ProofVerificationParams));
    }

    /// @notice Builds the proof argument from the SDK parameters (convenience for callers and tests).
    function encodeProof(ProofVerificationParams calldata params) external pure returns (bytes memory) {
        return abi.encodePacked(ROUTE_TAG, abi.encode(params));
    }
}
