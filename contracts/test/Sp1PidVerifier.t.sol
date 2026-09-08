// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";
import {Sp1PidVerifier} from "../src/sp1/Sp1PidVerifier.sol";
import {ISP1Verifier} from "../src/sp1/interfaces/ISP1Verifier.sol";
import {MockSp1Gateway} from "../src/test/MockSp1Gateway.sol";
import {Sp1Fixture} from "./Sp1Fixture.sol";

contract Sp1PidVerifierTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.pid.over18.v1");
    bytes32 constant VKEY = 0x00cc4d3b31d47abf4e069acd7e90fb0efec8aef32da11c78a2eaf01c5552f71f;
    bytes32 constant ISSUER_KEY_HASH = 0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183;
    bytes32 constant VCT_HASH = 0x27b2d76921e41420732d759e6a3f345b9132e37fae97b1930f39ec58cf9a567d; // sha256("urn:eudi:pid:de:1")
    bytes constant SP1_PROOF = hex"4388a21c00"; // selector + dummy body, the mock gateway ignores it
    uint256 constant BITS_BOTH = 0x3;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    AttestationRegistry registry;
    MockSp1Gateway gateway;
    Sp1PidVerifier verifier;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(owner);
        gateway = new MockSp1Gateway();
        verifier = new Sp1PidVerifier(gateway, VKEY, ISSUER_KEY_HASH, VCT_HASH, POLICY);
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        vm.prank(owner);
        registry.setOperator(POLICY, operator, true);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _pv(address subject, uint8 over18, uint64 expiry, bytes32 nonce)
        internal
        pure
        returns (Sp1PidVerifier.PublicValues memory)
    {
        return Sp1PidVerifier.PublicValues({
            issuerKeyHash: ISSUER_KEY_HASH,
            vctHash: VCT_HASH,
            over18: over18,
            subject: subject,
            expiry: expiry,
            nonce: nonce
        });
    }

    function _pv(address subject) internal view returns (Sp1PidVerifier.PublicValues memory) {
        return _pv(subject, 1, uint64(block.timestamp + 30 days), keccak256(abi.encodePacked(subject, "challenge")));
    }

    /// @dev Registers the public values with the mock gateway and returns the encoded proof argument.
    function _proof(Sp1PidVerifier.PublicValues memory pv) internal returns (bytes memory) {
        bytes memory publicValues = abi.encode(pv);
        gateway.accept(VKEY, publicValues, true);
        return abi.encode(publicValues, SP1_PROOF);
    }

    function _decision(uint256 bits, uint64 expiry) internal pure returns (Decision memory) {
        return Decision({policyId: POLICY, bits: bits, tier: 0, expiry: expiry, statusRef: bytes32(0), revoked: false});
    }

    function _inputs(address subject, Decision memory d) internal pure returns (bytes32[] memory inputs) {
        inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(uint160(subject)));
        inputs[1] = d.policyId;
        inputs[2] = bytes32(d.bits);
        inputs[3] = bytes32(uint256(d.expiry));
    }

    function _attest(address subject, Sp1PidVerifier.PublicValues memory pv, uint256 bits) internal {
        Decision memory d = _decision(bits, pv.expiry);
        registry.attestWithProof(subject, d, _proof(pv), _inputs(subject, d));
    }

    // ------------------------------------------------------------------
    // Happy paths
    // ------------------------------------------------------------------

    function test_attestWithProofSetsDecision() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        _attest(alice, pv, BITS_BOTH);

        Decision memory d = registry.decisionOf(alice, POLICY);
        assertEq(d.policyId, POLICY);
        assertEq(d.bits, BITS_BOTH);
        assertEq(d.expiry, pv.expiry);
        assertFalse(d.revoked);
        assertTrue(registry.nonceConsumed(keccak256(abi.encode(POLICY, pv.nonce))));
        // evidence only until the issuer approves
        assertFalse(registry.approved(alice, POLICY));
        assertFalse(registry.isEligible(alice, POLICY, verifier.BIT_OVER_18()));
        assertFalse(registry.isEligible(alice, POLICY, verifier.BIT_IDENTITY()));
        vm.prank(operator);
        registry.approve(alice, POLICY);
        assertTrue(registry.isEligible(alice, POLICY, verifier.BIT_OVER_18()));
        assertTrue(registry.isEligible(alice, POLICY, verifier.BIT_IDENTITY()));
    }

    function test_notOver18SetsIdentityBitOnly() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        pv.over18 = 0;
        _attest(alice, pv, verifier.BIT_IDENTITY());
        vm.prank(operator);
        registry.approve(alice, POLICY);
        assertTrue(registry.isEligible(alice, POLICY, verifier.BIT_IDENTITY()));
        assertFalse(registry.isEligible(alice, POLICY, verifier.BIT_OVER_18()));
    }

    function test_fixtureDecodesThroughRegistry() public {
        Sp1Fixture.Data memory f = Sp1Fixture.load();
        assertEq(f.vkey, VKEY);
        assertEq(f.publicValues.length, verifier.PUBLIC_VALUES_LENGTH());
        assertGt(f.expiry, block.timestamp, "fixture expiry (issuer exp) must lie ahead of the test clock");

        gateway.accept(VKEY, f.publicValues, true);
        bytes memory proof = verifier.encodeProof(f.publicValues, f.proof);
        assertEq(verifier.nonceOf(proof), f.nonce);

        Decision memory d = _decision(BITS_BOTH, f.expiry);
        registry.attestWithProof(f.subject, d, proof, _inputs(f.subject, d));
        Decision memory stored = registry.decisionOf(f.subject, POLICY);
        assertEq(stored.bits, BITS_BOTH);
        assertEq(stored.expiry, f.expiry);
        assertEq(f.over18, 1);
        assertEq(f.issuerKeyHash, ISSUER_KEY_HASH);
        assertEq(f.vctHash, VCT_HASH);
    }

    // ------------------------------------------------------------------
    // Binding failures (through the registry, where they will happen in practice)
    // ------------------------------------------------------------------

    function test_wrongIssuerKeyHashReverts() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        pv.issuerKeyHash = keccak256("other issuer");
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        bytes memory proof = _proof(pv);
        vm.expectRevert(
            abi.encodeWithSelector(Sp1PidVerifier.IssuerKeyHashMismatch.selector, pv.issuerKeyHash, ISSUER_KEY_HASH)
        );
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
    }

    function test_wrongVctHashReverts() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        pv.vctHash = keccak256("urn:other");
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        bytes memory proof = _proof(pv);
        vm.expectRevert(abi.encodeWithSelector(Sp1PidVerifier.VctHashMismatch.selector, pv.vctHash, VCT_HASH));
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
    }

    function test_subjectMismatchReverts() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        bytes memory proof = _proof(pv);
        vm.expectRevert(abi.encodeWithSelector(Sp1PidVerifier.SubjectMismatch.selector, alice, bob));
        registry.attestWithProof(bob, d, proof, _inputs(bob, d));
    }

    function test_policyMismatchReverts() public {
        bytes32 other = keccak256("other.policy");
        vm.prank(owner);
        registry.setVerifier(other, verifier);
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        d.policyId = other;
        bytes memory proof = _proof(pv);
        vm.expectRevert(abi.encodeWithSelector(Sp1PidVerifier.PolicyMismatch.selector, other, POLICY));
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
    }

    function test_bitsMismatchReverts() public {
        // claims over 18 while the proof says over18 == 0
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        pv.over18 = 0;
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        bytes memory proof = _proof(pv);
        vm.expectRevert(
            abi.encodeWithSelector(Sp1PidVerifier.BitsMismatch.selector, BITS_BOTH, verifier.BIT_IDENTITY())
        );
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));

        // claims fewer bits than proven is a mismatch too: bits are exact, not a subset
        pv = _pv(bob);
        d = _decision(verifier.BIT_IDENTITY(), pv.expiry);
        proof = _proof(pv);
        vm.expectRevert(
            abi.encodeWithSelector(Sp1PidVerifier.BitsMismatch.selector, verifier.BIT_IDENTITY(), BITS_BOTH)
        );
        registry.attestWithProof(bob, d, proof, _inputs(bob, d));
    }

    function test_expiredReverts() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        pv.expiry = uint64(block.timestamp);
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        bytes memory proof = _proof(pv);
        vm.expectRevert(abi.encodeWithSelector(Sp1PidVerifier.Expired.selector, pv.expiry, block.timestamp));
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
    }

    function test_gatewayRejectionReverts() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        bytes memory publicValues = abi.encode(pv);
        bytes memory proof = abi.encode(publicValues, SP1_PROOF); // not registered with the mock
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        vm.expectRevert(
            abi.encodeWithSelector(MockSp1Gateway.MockProofRejected.selector, VKEY, keccak256(publicValues))
        );
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
        assertFalse(registry.isEligible(alice, POLICY, verifier.BIT_IDENTITY()));
    }

    function test_wrongVkeyRejectedByGateway() public {
        Sp1PidVerifier otherVerifier = new Sp1PidVerifier(gateway, keccak256("vkey"), ISSUER_KEY_HASH, VCT_HASH, POLICY);
        vm.prank(owner);
        registry.setVerifier(POLICY, otherVerifier);
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        bytes memory proof = _proof(pv); // accepted under VKEY only
        vm.expectRevert(
            abi.encodeWithSelector(
                MockSp1Gateway.MockProofRejected.selector, keccak256("vkey"), keccak256(abi.encode(pv))
            )
        );
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
    }

    function test_nonceReplayReverts() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        _attest(alice, pv, BITS_BOTH);
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        bytes memory proof = _proof(pv);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NonceConsumed.selector, POLICY, pv.nonce));
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
    }

    // ------------------------------------------------------------------
    // Verifier called directly (cases the registry filters before it)
    // ------------------------------------------------------------------

    function test_directExpiryMismatchReverts() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        bytes memory proof = _proof(pv);
        Decision memory d = _decision(BITS_BOTH, pv.expiry + 1);
        vm.expectRevert(abi.encodeWithSelector(Sp1PidVerifier.ExpiryMismatch.selector, pv.expiry, pv.expiry + 1));
        verifier.verify(proof, _inputs(alice, d));
    }

    function test_directPublicInputsLengthReverts() public {
        bytes32[] memory inputs = new bytes32[](3);
        vm.expectRevert(abi.encodeWithSelector(Sp1PidVerifier.PublicInputsLength.selector, 3, 4));
        verifier.verify(hex"", inputs);
    }

    function test_directPublicValuesLengthReverts() public {
        bytes memory proof = abi.encode(new bytes(191), SP1_PROOF);
        vm.expectRevert(abi.encodeWithSelector(Sp1PidVerifier.PublicValuesLength.selector, 191, 192));
        verifier.nonceOf(proof);
    }

    function test_directVerifyReturnsTrue() public {
        Sp1PidVerifier.PublicValues memory pv = _pv(alice);
        bytes memory proof = _proof(pv);
        Decision memory d = _decision(BITS_BOTH, pv.expiry);
        assertTrue(verifier.verify(proof, _inputs(alice, d)));
    }

    function test_immutablesExposed() public view {
        assertEq(address(verifier.GATEWAY()), address(gateway));
        assertEq(verifier.PROGRAM_VKEY(), VKEY);
        assertEq(verifier.ISSUER_KEY_HASH(), ISSUER_KEY_HASH);
        assertEq(verifier.VCT_HASH(), VCT_HASH);
        assertEq(verifier.POLICY_ID(), POLICY);
        assertEq(verifier.BIT_IDENTITY(), 1);
        assertEq(verifier.BIT_OVER_18(), 2);
    }
}
