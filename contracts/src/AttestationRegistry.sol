// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Decision, IEligibility} from "./interfaces/IEligibility.sol";
import {IProofVerifier} from "./interfaces/IProofVerifier.sol";

/// @title AttestationRegistry
/// @notice Stores one EligibilityDecision per (subject address, policyId).
///         Roles: the owner configures policies (operators and proof verifiers);
///         operators are issuer keys that attest and revoke for their policy.
///         Two write paths: attestByOperator (issuer-signed, available now) and
///         attestWithProof (zero-knowledge proof checked by the policy's IProofVerifier).
///         Nothing here identifies a person: only policyId, predicate bits, tier, expiry and an opaque statusRef.
contract AttestationRegistry is IEligibility, Ownable {
    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error NotOperator(bytes32 policyId, address caller);
    error VerifierUnset(bytes32 policyId);
    error InvalidProof();
    error PublicInputsLength(uint256 got, uint256 want);
    error PublicInputMismatch(uint256 index);
    error PolicyIdZero();
    error NoDecision(address subject, bytes32 policyId);
    error DecisionRevoked(address subject, bytes32 policyId);

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event OperatorSet(bytes32 indexed policyId, address indexed operator, bool enabled);
    event VerifierSet(bytes32 indexed policyId, address indexed verifier);
    event Attested(
        address indexed subject,
        bytes32 indexed policyId,
        uint256 bits,
        uint8 tier,
        uint64 expiry,
        bytes32 statusRef,
        address indexed attester
    );
    event Revoked(address indexed subject, bytes32 indexed policyId, address indexed operator);

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @dev policyId => operator => enabled
    mapping(bytes32 => mapping(address => bool)) public isOperator;

    /// @dev policyId => proof verifier (zero address = proof path disabled for that policy)
    mapping(bytes32 => IProofVerifier) public verifierOf;

    /// @dev subject => policyId => decision
    mapping(address => mapping(bytes32 => Decision)) private _decisions;

    /// @notice Number of public inputs the proof path binds. See attestWithProof.
    uint256 public constant PUBLIC_INPUTS_LENGTH = 4;

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ---------------------------------------------------------------------
    // Owner: policy configuration
    // ---------------------------------------------------------------------

    function setOperator(bytes32 policyId, address operator, bool enabled) external onlyOwner {
        if (policyId == bytes32(0)) revert PolicyIdZero();
        isOperator[policyId][operator] = enabled;
        emit OperatorSet(policyId, operator, enabled);
    }

    function setVerifier(bytes32 policyId, IProofVerifier verifier) external onlyOwner {
        if (policyId == bytes32(0)) revert PolicyIdZero();
        verifierOf[policyId] = verifier;
        emit VerifierSet(policyId, address(verifier));
    }

    // ---------------------------------------------------------------------
    // Operator path
    // ---------------------------------------------------------------------

    modifier onlyOperator(bytes32 policyId) {
        if (!isOperator[policyId][msg.sender]) revert NotOperator(policyId, msg.sender);
        _;
    }

    /// @notice Issuer-signed attestation. Overwrites any previous decision for (subject, policyId),
    ///         including a revoked one (re-approval is an explicit operator action).
    function attestByOperator(address subject, Decision calldata decision) external onlyOperator(decision.policyId) {
        _store(subject, decision);
    }

    /// @notice Revoke closes everything for (subject, policyId): fund token transfers, subscriptions,
    ///         pool access. Only a fresh attestByOperator can reopen it.
    function revoke(address subject, bytes32 policyId) external onlyOperator(policyId) {
        Decision storage d = _decisions[subject][policyId];
        if (d.policyId == bytes32(0)) revert NoDecision(subject, policyId);
        d.revoked = true;
        emit Revoked(subject, policyId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Proof path
    // ---------------------------------------------------------------------

    /// @notice Attest with a zero-knowledge proof checked by the policy's IProofVerifier.
    ///         Permissionless: anyone may submit, because the proof binds the decision to the subject.
    ///
    /// Public inputs layout (bytes32 each, exactly PUBLIC_INPUTS_LENGTH entries):
    ///   publicInputs[0] = bytes32(uint256(uint160(subject)))   the Ethereum address the decision is for
    ///   publicInputs[1] = decision.policyId
    ///   publicInputs[2] = bytes32(decision.bits)
    ///   publicInputs[3] = bytes32(uint256(decision.expiry))
    /// tier and statusRef are caller-supplied and not bound by the proof in this layout.
    /// Consumers must gate on bits only until the layout is extended (e.g. [4] = tier, [5] = statusRef).
    ///
    /// A revoked decision cannot be reopened through this path (a valid proof could otherwise be
    /// replayed to undo a revoke); only an operator can re-attest after revoke.
    function attestWithProof(
        address subject,
        Decision calldata decision,
        bytes calldata proof,
        bytes32[] calldata publicInputs
    ) external {
        IProofVerifier verifier = verifierOf[decision.policyId];
        if (address(verifier) == address(0)) revert VerifierUnset(decision.policyId);
        if (publicInputs.length != PUBLIC_INPUTS_LENGTH) {
            revert PublicInputsLength(publicInputs.length, PUBLIC_INPUTS_LENGTH);
        }
        if (publicInputs[0] != bytes32(uint256(uint160(subject)))) revert PublicInputMismatch(0);
        if (publicInputs[1] != decision.policyId) revert PublicInputMismatch(1);
        if (publicInputs[2] != bytes32(decision.bits)) revert PublicInputMismatch(2);
        if (publicInputs[3] != bytes32(uint256(decision.expiry))) revert PublicInputMismatch(3);
        if (_decisions[subject][decision.policyId].revoked) revert DecisionRevoked(subject, decision.policyId);
        if (!verifier.verify(proof, publicInputs)) revert InvalidProof();
        _store(subject, decision);
    }

    // ---------------------------------------------------------------------
    // Reads (IEligibility)
    // ---------------------------------------------------------------------

    /// @inheritdoc IEligibility
    function isEligible(address subject, bytes32 policyId, uint256 requiredBits) external view returns (bool) {
        Decision storage d = _decisions[subject][policyId];
        return !d.revoked && d.expiry > block.timestamp && (d.bits & requiredBits) == requiredBits;
    }

    /// @inheritdoc IEligibility
    function decisionOf(address subject, bytes32 policyId) external view returns (Decision memory) {
        return _decisions[subject][policyId];
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _store(address subject, Decision calldata decision) internal {
        if (decision.policyId == bytes32(0)) revert PolicyIdZero();
        _decisions[subject][decision.policyId] = Decision({
            policyId: decision.policyId,
            bits: decision.bits,
            tier: decision.tier,
            expiry: decision.expiry,
            statusRef: decision.statusRef,
            revoked: false
        });
        emit Attested(
            subject, decision.policyId, decision.bits, decision.tier, decision.expiry, decision.statusRef, msg.sender
        );
    }
}
