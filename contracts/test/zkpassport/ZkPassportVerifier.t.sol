// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../../src/AttestationRegistry.sol";
import {Decision} from "../../src/interfaces/IEligibility.sol";
import {IProofVerifier} from "../../src/interfaces/IProofVerifier.sol";
import {EvidenceRouter} from "../../src/zkpassport/EvidenceRouter.sol";
import {ZkPassportVerifier} from "../../src/zkpassport/ZkPassportVerifier.sol";
import {
    ProofVerificationData,
    ProofVerificationParams,
    ServiceConfig
} from "../../src/zkpassport/interfaces/IZKPassportVerifier.sol";
import {MockZkPassportRoot} from "./MockZkPassportRoot.sol";

/// @notice Unit tests of the zkPassport adapter and the evidence router against MockZkPassportRoot.
///         What the real root verifier does with a proof is covered by the fork test.
contract ZkPassportVerifierTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.pid.over18.v1");
    string constant DOMAIN = "localhost";
    string constant SCOPE = "attestat-over18";
    uint256 constant VALIDITY = 7 days;
    uint64 constant TTL = 30 days;
    uint256 constant CHAIN = 31337;

    MockZkPassportRoot root;
    ZkPassportVerifier verifier;
    AttestationRegistry registry;
    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address investor = makeAddr("investor");
    uint256 proofTime;

    function setUp() public {
        vm.chainId(CHAIN);
        vm.warp(1_800_000_000);
        proofTime = block.timestamp - 60;
        root = new MockZkPassportRoot();
        verifier = new ZkPassportVerifier(root, POLICY, DOMAIN, SCOPE, true, VALIDITY, TTL);
        registry = new AttestationRegistry(owner);
        vm.startPrank(owner);
        registry.setVerifier(POLICY, verifier);
        registry.setOperator(POLICY, operator, true);
        vm.stopPrank();
    }

    // ------------------------------------------------------------------ helpers

    function params(bool valid, address sender, uint256 chainId, uint8 ageAtLeast, bool bound, uint256 ts)
        internal
        pure
        returns (ProofVerificationParams memory p)
    {
        bytes32[] memory pi = new bytes32[](11);
        pi[2] = bytes32(ts);
        pi[8] = bytes32(uint256(0)); // nullifier type
        pi[9] = keccak256(abi.encode("uid", sender)); // scoped nullifier
        p.version = bytes32(uint256(0x14) << 224);
        p.proofVerificationData = ProofVerificationData(keccak256("vkey"), valid ? bytes("valid") : bytes("bad"), pi);
        p.committedInputs = abi.encode(sender, chainId, ageAtLeast, bound);
        // What the submitter sends here must not matter: the adapter overrides it.
        p.serviceConfig = ServiceConfig(1, "attacker.example", "other", false);
    }

    function proofOf(ProofVerificationParams memory p) internal view returns (bytes memory) {
        return abi.encodePacked(verifier.ROUTE_TAG(), abi.encode(p));
    }

    function inputs(address subject, uint256 bits, uint64 expiry) internal pure returns (bytes32[] memory pi) {
        pi = new bytes32[](4);
        pi[0] = bytes32(uint256(uint160(subject)));
        pi[1] = POLICY;
        pi[2] = bytes32(bits);
        pi[3] = bytes32(uint256(expiry));
    }

    function decision(uint64 expiry) internal pure returns (Decision memory) {
        return Decision({policyId: POLICY, bits: 7, tier: 1, expiry: expiry, statusRef: bytes32(0), revoked: false});
    }

    function good() internal view returns (bytes memory proof, bytes32[] memory pi, uint64 expiry) {
        expiry = uint64(proofTime) + TTL;
        proof = proofOf(params(true, investor, CHAIN, 18, true, proofTime));
        pi = inputs(investor, 7, expiry);
    }

    // ------------------------------------------------------------------ adapter

    function test_verifyHappyPath() public view {
        (bytes memory proof, bytes32[] memory pi,) = good();
        assertTrue(verifier.verify(proof, pi));
    }

    function test_bitsIncludeRouteMarker() public view {
        assertEq(verifier.BITS(), 7);
        assertEq(verifier.BIT_PASSPORT_CHIP(), 4);
    }

    function test_nonceIsHashOfZkPublicInputs() public view {
        ProofVerificationParams memory p = params(true, investor, CHAIN, 18, true, proofTime);
        assertEq(verifier.nonceOf(proofOf(p)), keccak256(abi.encodePacked(p.proofVerificationData.publicInputs)));
        // A fresh proof (new timestamp) by the same passport is a new nonce: renewal after expiry works.
        ProofVerificationParams memory later = params(true, investor, CHAIN, 18, true, proofTime + 1);
        assertTrue(verifier.nonceOf(proofOf(p)) != verifier.nonceOf(proofOf(later)));
    }

    function test_revertsWithoutRouteTag() public {
        ProofVerificationParams memory p = params(true, investor, CHAIN, 18, true, proofTime);
        bytes memory untagged = abi.encode(p);
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.RouteTagMismatch.selector, bytes32(untagged), verifier.ROUTE_TAG()));
        verifier.nonceOf(untagged);
    }

    function test_revertsOnShortProof() public {
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.ProofTooShort.selector, 3));
        verifier.nonceOf(hex"010203");
    }

    function test_revertsWhenRootRejects() public {
        bytes memory proof = proofOf(params(false, investor, CHAIN, 18, true, proofTime));
        vm.expectRevert(ZkPassportVerifier.RootVerifierRejected.selector);
        verifier.verify(proof, inputs(investor, 7, uint64(proofTime) + TTL));
    }

    function test_revertsUnder18() public {
        bytes memory proof = proofOf(params(true, investor, CHAIN, 16, true, proofTime));
        vm.expectRevert(ZkPassportVerifier.NotOver18.selector);
        verifier.verify(proof, inputs(investor, 7, uint64(proofTime) + TTL));
    }

    function test_revertsWithoutBoundAddress() public {
        bytes memory proof = proofOf(params(true, investor, CHAIN, 18, false, proofTime));
        vm.expectRevert(bytes("Bind data proof inputs not found"));
        verifier.verify(proof, inputs(investor, 7, uint64(proofTime) + TTL));
    }

    function test_revertsOnSubjectMismatch() public {
        address other = makeAddr("other");
        bytes memory proof = proofOf(params(true, other, CHAIN, 18, true, proofTime));
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.SubjectMismatch.selector, other, investor));
        verifier.verify(proof, inputs(investor, 7, uint64(proofTime) + TTL));
    }

    function test_revertsOnChainMismatch() public {
        bytes memory proof = proofOf(params(true, investor, 11155111, 18, true, proofTime));
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.ChainMismatch.selector, 11155111, CHAIN));
        verifier.verify(proof, inputs(investor, 7, uint64(proofTime) + TTL));
    }

    function test_revertsOnPolicyMismatch() public {
        (bytes memory proof, bytes32[] memory pi,) = good();
        pi[1] = keccak256("other");
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.PolicyMismatch.selector, pi[1], POLICY));
        verifier.verify(proof, pi);
    }

    function test_revertsOnBitsMismatch() public {
        (bytes memory proof, bytes32[] memory pi,) = good();
        pi[2] = bytes32(uint256(3));
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.BitsMismatch.selector, 3, 7));
        verifier.verify(proof, pi);
    }

    function test_revertsOnExpiryMismatch() public {
        (bytes memory proof, bytes32[] memory pi, uint64 expiry) = good();
        pi[3] = bytes32(uint256(expiry) + 1);
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.ExpiryMismatch.selector, expiry + 1, expiry));
        verifier.verify(proof, pi);
    }

    function test_revertsWhenExpired() public {
        (bytes memory proof, bytes32[] memory pi, uint64 expiry) = good();
        vm.warp(uint256(expiry) + 1);
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.Expired.selector, expiry, uint256(expiry) + 1));
        verifier.verify(proof, pi);
    }

    function test_revertsOnPublicInputsLength() public {
        (bytes memory proof,,) = good();
        vm.expectRevert(abi.encodeWithSelector(ZkPassportVerifier.PublicInputsLength.selector, 3, 4));
        verifier.verify(proof, new bytes32[](3));
    }

    function test_rootPauseBubblesUp() public {
        root.setPaused(true);
        (bytes memory proof, bytes32[] memory pi,) = good();
        vm.expectRevert(bytes("Root verifier is paused"));
        verifier.verify(proof, pi);
    }

    function test_adapterOverridesServiceConfig() public {
        // Same call path as verify, but through the recording entry point of the mock.
        ProofVerificationParams memory p = verifier.decodeProof(proofOf(params(true, investor, CHAIN, 18, true, proofTime)));
        p.serviceConfig = ServiceConfig(verifier.VALIDITY_SECONDS(), verifier.DOMAIN(), verifier.SCOPE(), verifier.DEV_MODE());
        root.record(p);
        assertEq(root.lastValidity(), VALIDITY);
        assertEq(root.lastDomain(), DOMAIN);
        assertEq(root.lastScope(), SCOPE);
        assertTrue(root.lastDevMode());
    }

    // ------------------------------------------------------------------ registry path

    function test_registryPath_attestApproveRevoke() public {
        (bytes memory proof, bytes32[] memory pi, uint64 expiry) = good();
        // Anyone may submit; the proof binds the subject. Here the investor sends it themselves.
        vm.prank(investor);
        registry.attestWithProof(investor, decision(expiry), proof, pi);
        (bool has, bool approved, bool revoked, uint64 exp) = registry.statusOf(investor, POLICY);
        assertTrue(has);
        assertFalse(approved);
        assertFalse(revoked);
        assertEq(exp, expiry);
        assertFalse(registry.isEligible(investor, POLICY, 3));

        vm.prank(operator);
        registry.approve(investor, POLICY);
        assertTrue(registry.isEligible(investor, POLICY, 3), "consumers requiring 0x3 accept the passport route");
        assertTrue(registry.isEligible(investor, POLICY, 7));

        vm.prank(operator);
        registry.revoke(investor, POLICY);
        assertFalse(registry.isEligible(investor, POLICY, 3));
    }

    function test_registryPath_replayRefused() public {
        (bytes memory proof, bytes32[] memory pi, uint64 expiry) = good();
        registry.attestWithProof(investor, decision(expiry), proof, pi);
        vm.expectRevert(
            abi.encodeWithSelector(AttestationRegistry.NonceConsumed.selector, POLICY, verifier.nonceOf(proof))
        );
        registry.attestWithProof(investor, decision(expiry), proof, pi);
    }

    function test_registryPath_wrongBitsInDecisionRefused() public {
        (bytes memory proof, bytes32[] memory pi, uint64 expiry) = good();
        Decision memory d = decision(expiry);
        d.bits = 3;
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.PublicInputMismatch.selector, 2));
        registry.attestWithProof(investor, d, proof, pi);
    }

    // ------------------------------------------------------------------ router

    function test_routerDispatchesByTag() public {
        StubVerifier eudi = new StubVerifier(keccak256("eudi-nonce"));
        EvidenceRouter router = new EvidenceRouter(verifier, eudi, verifier.ROUTE_TAG());
        (bytes memory proof, bytes32[] memory pi,) = good();
        assertEq(address(router.route(proof)), address(verifier));
        assertTrue(router.verify(proof, pi));
        assertEq(router.nonceOf(proof), verifier.nonceOf(proof));

        // A Noir or SP1 proof argument: abi.encode(bytes, ...) starts with an offset word, never the tag.
        bytes memory noirLike = abi.encode(bytes("honk"), new bytes32[](86));
        assertEq(address(router.route(noirLike)), address(eudi));
        assertTrue(router.verify(noirLike, pi));
        assertEq(router.nonceOf(noirLike), keccak256("eudi-nonce"));
        assertEq(address(router.route(hex"")), address(eudi));
    }

    function test_routerInRegistry_bothRoutesOnePolicy() public {
        StubVerifier eudi = new StubVerifier(keccak256("eudi-nonce"));
        EvidenceRouter router = new EvidenceRouter(verifier, eudi, verifier.ROUTE_TAG());
        vm.prank(owner);
        registry.setVerifier(POLICY, router);

        (bytes memory proof, bytes32[] memory pi, uint64 expiry) = good();
        registry.attestWithProof(investor, decision(expiry), proof, pi);

        address other = makeAddr("other");
        Decision memory d = Decision({policyId: POLICY, bits: 3, tier: 1, expiry: expiry, statusRef: bytes32(0), revoked: false});
        registry.attestWithProof(other, d, abi.encode(bytes("honk"), new bytes32[](86)), inputs(other, 3, expiry));
        (bool hasOther,,,) = registry.statusOf(other, POLICY);
        assertTrue(hasOther);
    }
}

/// @dev Accepts everything; stands in for NoirPidVerifier behind the router.
contract StubVerifier is IProofVerifier {
    bytes32 immutable NONCE;

    constructor(bytes32 nonce) {
        NONCE = nonce;
    }

    function verify(bytes calldata, bytes32[] calldata) external pure returns (bool) {
        return true;
    }

    function nonceOf(bytes calldata) external view returns (bytes32) {
        return NONCE;
    }
}
