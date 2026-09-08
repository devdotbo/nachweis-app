// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";
import {NoirPidVerifier} from "../src/noir/NoirPidVerifier.sol";
import {IHonkVerifier} from "../src/noir/interfaces/IHonkVerifier.sol";
import {HonkVerifier, VK_HASH} from "../src/noir/PidSdJwtUltraHonkVerifier.sol";
import {NoirFixture} from "./NoirFixture.sol";

/// @notice Runs the real bb-generated HonkVerifier on the real proof of the pid-sdjwt circuit
///         (test/fixtures/noir). Every honk verification costs about 2.85 M gas.
contract NoirPidVerifierTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.pid.over18.v1");
    bytes32 constant ISSUER_KEY_HASH = 0xb52359580c14e2d79d34605740d86338adc6a0868a22ec648d1896187813fd26;
    uint256 constant BITS_BOTH = 0x3;
    uint256 constant EIP170_LIMIT = 24_576;

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address bob = makeAddr("bob");

    AttestationRegistry registry;
    HonkVerifier honk;
    NoirPidVerifier verifier;
    NoirFixture.Data f;

    function setUp() public {
        f = NoirFixture.load();
        vm.warp(1_800_000_000); // a realistic clock; the fixture expiry (issuer exp, 2027-09-01) lies ahead of it
        assertGt(f.expiry, block.timestamp, "fixture expiry (issuer exp) must lie ahead of the test clock");
        registry = new AttestationRegistry(owner);
        honk = new HonkVerifier();
        verifier = new NoirPidVerifier(IHonkVerifier(address(honk)), ISSUER_KEY_HASH, POLICY);
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        vm.prank(owner);
        registry.setOperator(POLICY, operator, true);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

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

    function _proof() internal view returns (bytes memory) {
        return abi.encode(f.proof, f.publicInputs);
    }

    function _proof(bytes32[] memory honkInputs) internal view returns (bytes memory) {
        return abi.encode(f.proof, honkInputs);
    }

    function _attest(address subject, bytes memory proof, uint256 bits, uint64 expiry) internal {
        Decision memory d = _decision(bits, expiry);
        registry.attestWithProof(subject, d, proof, _inputs(subject, d));
    }

    // ------------------------------------------------------------------
    // Fixture and deployment sanity
    // ------------------------------------------------------------------

    function test_fixtureMatchesVerifierAndLayout() public view {
        assertEq(f.publicInputs.length, verifier.HONK_PUBLIC_INPUTS_LENGTH());
        assertEq(f.vkHash, bytes32(VK_HASH), "fixture vk_hash != generated VK_HASH: regenerate verifier or fixture");
        (NoirPidVerifier.PublicValues memory pv,,) = verifier.decodeProof(_proof());
        assertEq(pv.subject, f.subject);
        assertEq(pv.issuerKeyHash, f.issuerKeyHash);
        assertEq(pv.over18, f.over18);
        assertEq(pv.expiry, f.expiry);
        assertEq(pv.nonce, f.nonce);
        assertEq(verifier.nonceOf(_proof()), f.nonce);
        assertEq(verifier.bitsOf(pv), BITS_BOTH);
    }

    function test_honkVerifierFitsEip170() public view {
        // compiled with optimizer_runs 1 through the compilation restriction in foundry.toml
        assertLe(address(honk).code.length, EIP170_LIMIT, "HonkVerifier runtime exceeds EIP-170");
    }

    function test_honkVerifierAcceptsFixtureDirectly() public view {
        assertTrue(honk.verify(f.proof, f.publicInputs));
    }

    // ------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------

    function test_attestWithProofSetsDecision() public {
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        bytes memory proof = _proof();
        bytes32[] memory inputs = _inputs(f.subject, d);

        uint256 gasBefore = gasleft();
        registry.attestWithProof(f.subject, d, proof, inputs);
        emit log_named_uint("attestWithProof gas (Noir happy path)", gasBefore - gasleft());

        Decision memory stored = registry.decisionOf(f.subject, POLICY);
        assertEq(stored.policyId, POLICY);
        assertEq(stored.bits, BITS_BOTH);
        assertEq(stored.expiry, f.expiry);
        assertFalse(stored.revoked);
        assertTrue(registry.nonceConsumed(keccak256(abi.encode(POLICY, f.nonce))));
        // evidence only until the issuer approves
        assertFalse(registry.approved(f.subject, POLICY));
        assertFalse(registry.isEligible(f.subject, POLICY, verifier.BIT_OVER_18()));
        assertFalse(registry.isEligible(f.subject, POLICY, verifier.BIT_IDENTITY()));
        vm.prank(operator);
        registry.approve(f.subject, POLICY);
        assertTrue(registry.isEligible(f.subject, POLICY, verifier.BIT_OVER_18()));
        assertTrue(registry.isEligible(f.subject, POLICY, verifier.BIT_IDENTITY()));
    }

    function test_directVerifyReturnsTrue() public view {
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        assertTrue(verifier.verify(_proof(), _inputs(f.subject, d)));
    }

    // ------------------------------------------------------------------
    // Proof bound to its public inputs (HonkVerifier rejects)
    // ------------------------------------------------------------------

    function test_flippedOver18Reverts() public {
        // claim over18 == 0 with matching bits: bindings pass, the proof does not
        bytes32[] memory honkInputs = f.publicInputs;
        honkInputs[verifier.OVER18_INDEX()] = bytes32(0);
        bytes memory proof = _proof(honkInputs);
        Decision memory d = _decision(verifier.BIT_IDENTITY(), f.expiry);
        vm.expectRevert(abi.encodeWithSignature("SumcheckFailed()"));
        registry.attestWithProof(f.subject, d, proof, _inputs(f.subject, d));
        assertFalse(registry.isEligible(f.subject, POLICY, verifier.BIT_IDENTITY()));
    }

    function test_tamperedProofReverts() public {
        bytes memory tampered = f.proof;
        tampered[100] ^= 0x01;
        bytes memory proof = abi.encode(tampered, f.publicInputs);
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        vm.expectRevert();
        registry.attestWithProof(f.subject, d, proof, _inputs(f.subject, d));
    }

    function test_rebindSubjectReverts() public {
        // rewrite the subject bytes to bob and claim bob: bindings pass, the proof does not
        bytes32[] memory honkInputs = f.publicInputs;
        for (uint256 i = 0; i < 20; i++) {
            honkInputs[i] = bytes32(uint256(uint8(bytes20(bob)[i])));
        }
        bytes memory proof = _proof(honkInputs);
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        assertEq(verifier.nonceOf(proof), f.nonce);
        vm.expectRevert(abi.encodeWithSignature("SumcheckFailed()"));
        registry.attestWithProof(bob, d, proof, _inputs(bob, d));
    }

    // ------------------------------------------------------------------
    // Binding failures (through the registry, where they will happen in practice)
    // ------------------------------------------------------------------

    function test_wrongIssuerKeyHashReverts() public {
        bytes32 other = keccak256("other issuer");
        NoirPidVerifier otherVerifier = new NoirPidVerifier(IHonkVerifier(address(honk)), other, POLICY);
        vm.prank(owner);
        registry.setVerifier(POLICY, otherVerifier);
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.IssuerKeyHashMismatch.selector, ISSUER_KEY_HASH, other));
        registry.attestWithProof(f.subject, d, _proof(), _inputs(f.subject, d));
    }

    function test_subjectMismatchReverts() public {
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.SubjectMismatch.selector, f.subject, bob));
        registry.attestWithProof(bob, d, _proof(), _inputs(bob, d));
    }

    function test_policyMismatchReverts() public {
        bytes32 other = keccak256("other.policy");
        vm.prank(owner);
        registry.setVerifier(other, verifier);
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        d.policyId = other;
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.PolicyMismatch.selector, other, POLICY));
        registry.attestWithProof(f.subject, d, _proof(), _inputs(f.subject, d));
    }

    function test_bitsMismatchReverts() public {
        // claims fewer bits than proven: bits are exact, not a subset
        Decision memory d = _decision(verifier.BIT_IDENTITY(), f.expiry);
        vm.expectRevert(
            abi.encodeWithSelector(NoirPidVerifier.BitsMismatch.selector, verifier.BIT_IDENTITY(), BITS_BOTH)
        );
        registry.attestWithProof(f.subject, d, _proof(), _inputs(f.subject, d));

        // claims over 18 while the (tampered) public input says over18 == 0: caught before the honk call
        bytes32[] memory honkInputs = f.publicInputs;
        honkInputs[verifier.OVER18_INDEX()] = bytes32(0);
        d = _decision(BITS_BOTH, f.expiry);
        vm.expectRevert(
            abi.encodeWithSelector(NoirPidVerifier.BitsMismatch.selector, BITS_BOTH, verifier.BIT_IDENTITY())
        );
        registry.attestWithProof(f.subject, d, _proof(honkInputs), _inputs(f.subject, d));
    }

    function test_expiredReverts() public {
        vm.warp(f.expiry);
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.Expired.selector, f.expiry, f.expiry));
        registry.attestWithProof(f.subject, d, _proof(), _inputs(f.subject, d));
    }

    function test_nonceReplayReverts() public {
        _attest(f.subject, _proof(), BITS_BOTH, f.expiry);
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NonceConsumed.selector, POLICY, f.nonce));
        registry.attestWithProof(f.subject, d, _proof(), _inputs(f.subject, d));
    }

    // ------------------------------------------------------------------
    // Malformed field elements (decode rejects before the honk call)
    // ------------------------------------------------------------------

    function test_malformedByteFieldReverts() public {
        bytes32[] memory honkInputs = f.publicInputs;
        uint256 idx = verifier.NONCE_OFFSET() + 3;
        honkInputs[idx] = bytes32(uint256(256));
        bytes memory proof = _proof(honkInputs);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.FieldNotByte.selector, idx, 256));
        verifier.nonceOf(proof);

        // subject and issuer key hash bytes are checked as well
        honkInputs = f.publicInputs;
        honkInputs[verifier.SUBJECT_OFFSET()] = bytes32(uint256(0x1_00));
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.FieldNotByte.selector, 0, 0x100));
        verifier.nonceOf(_proof(honkInputs));

        honkInputs = f.publicInputs;
        honkInputs[verifier.ISSUER_KEY_HASH_OFFSET() + 31] = bytes32(type(uint256).max);
        Decision memory d = _decision(BITS_BOTH, f.expiry);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.FieldNotByte.selector, 51, type(uint256).max));
        registry.attestWithProof(f.subject, d, _proof(honkInputs), _inputs(f.subject, d));
    }

    function test_malformedOver18FieldReverts() public {
        bytes32[] memory honkInputs = f.publicInputs;
        honkInputs[verifier.OVER18_INDEX()] = bytes32(uint256(257));
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.FieldNotByte.selector, 52, 257));
        verifier.nonceOf(_proof(honkInputs));
    }

    function test_malformedExpiryFieldReverts() public {
        bytes32[] memory honkInputs = f.publicInputs;
        honkInputs[verifier.EXPIRY_INDEX()] = bytes32(uint256(type(uint64).max) + 1);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.FieldNotU64.selector, 53, uint256(type(uint64).max) + 1));
        verifier.nonceOf(_proof(honkInputs));
    }

    function test_honkPublicInputsLengthReverts() public {
        bytes32[] memory honkInputs = new bytes32[](85);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.HonkPublicInputsLength.selector, 85, 86));
        verifier.nonceOf(_proof(honkInputs));
    }

    // ------------------------------------------------------------------
    // Verifier called directly (cases the registry filters before it)
    // ------------------------------------------------------------------

    function test_directExpiryMismatchReverts() public {
        Decision memory d = _decision(BITS_BOTH, f.expiry + 1);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.ExpiryMismatch.selector, f.expiry, f.expiry + 1));
        verifier.verify(_proof(), _inputs(f.subject, d));
    }

    function test_directPublicInputsLengthReverts() public {
        bytes32[] memory inputs = new bytes32[](3);
        vm.expectRevert(abi.encodeWithSelector(NoirPidVerifier.PublicInputsLength.selector, 3, 4));
        verifier.verify(hex"", inputs);
    }

    function test_immutablesExposed() public view {
        assertEq(address(verifier.HONK()), address(honk));
        assertEq(verifier.ISSUER_KEY_HASH(), ISSUER_KEY_HASH);
        assertEq(verifier.POLICY_ID(), POLICY);
        assertEq(verifier.BIT_IDENTITY(), 1);
        assertEq(verifier.BIT_OVER_18(), 2);
        assertEq(verifier.HONK_PUBLIC_INPUTS_LENGTH(), 86);
    }
}
