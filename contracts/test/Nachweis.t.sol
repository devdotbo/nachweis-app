// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {Subscription} from "../src/Subscription.sol";
import {MockProofVerifier} from "../src/test/MockProofVerifier.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";
import {IProofVerifier} from "../src/interfaces/IProofVerifier.sol";

contract NachweisTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.demo.fund.v1");
    uint256 constant BIT_ADULT = 1 << 0;
    uint256 constant BIT_EU_RESIDENT = 1 << 1;
    uint256 constant BIT_NOT_SANCTIONED = 1 << 2;
    uint256 constant REQUIRED = BIT_ADULT | BIT_EU_RESIDENT | BIT_NOT_SANCTIONED;
    uint256 constant DEMO_AMOUNT = 100e18;

    address owner = makeAddr("owner");
    address issuer = makeAddr("issuer");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address stranger = makeAddr("stranger");

    AttestationRegistry registry;
    FundToken token;
    Subscription subscription;
    MockProofVerifier verifier;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(owner);
        vm.prank(owner);
        registry.setOperator(POLICY, operator, true);

        token = new FundToken("Nachweis Demo Fund", "NDF", registry, POLICY, REQUIRED, issuer);
        subscription = new Subscription(token, DEMO_AMOUNT);
        vm.prank(issuer);
        token.setSubscription(address(subscription));

        verifier = new MockProofVerifier(true);
    }

    function _decision(uint256 bits, uint64 expiry) internal pure returns (Decision memory) {
        return Decision({
            policyId: POLICY, bits: bits, tier: 1, expiry: expiry, statusRef: keccak256("status/0"), revoked: false
        });
    }

    function _attest(address subject) internal {
        vm.prank(operator);
        registry.attestByOperator(subject, _decision(REQUIRED, uint64(block.timestamp + 365 days)));
    }

    function _inputs(address subject, Decision memory d) internal pure returns (bytes32[] memory inputs) {
        inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(uint160(subject)));
        inputs[1] = d.policyId;
        inputs[2] = bytes32(d.bits);
        inputs[3] = bytes32(uint256(d.expiry));
    }

    // ------------------------------------------------------------------
    // Registry: operator path
    // ------------------------------------------------------------------

    function test_notEligibleBeforeAttest() public view {
        assertFalse(registry.isEligible(alice, POLICY, REQUIRED));
        Decision memory d = registry.decisionOf(alice, POLICY);
        assertEq(d.policyId, bytes32(0));
        assertEq(d.expiry, 0);
    }

    function test_eligibleAfterOperatorAttest() public {
        _attest(alice);
        assertTrue(registry.isEligible(alice, POLICY, REQUIRED));
        assertTrue(registry.isEligible(alice, POLICY, BIT_ADULT));
        assertFalse(registry.isEligible(alice, POLICY, REQUIRED | (1 << 7)));
        assertFalse(registry.isEligible(alice, keccak256("other"), REQUIRED));
        Decision memory d = registry.decisionOf(alice, POLICY);
        assertEq(d.bits, REQUIRED);
        assertEq(d.tier, 1);
        assertFalse(d.revoked);
    }

    function test_attestEmitsWithoutPersonalData() public {
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        vm.expectEmit(true, true, true, true);
        emit AttestationRegistry.Attested(alice, POLICY, d.bits, d.tier, d.expiry, d.statusRef, operator);
        vm.prank(operator);
        registry.attestByOperator(alice, d);
    }

    function test_expiryMakesIneligible() public {
        uint64 expiry = uint64(block.timestamp + 10);
        vm.prank(operator);
        registry.attestByOperator(alice, _decision(REQUIRED, expiry));
        assertTrue(registry.isEligible(alice, POLICY, REQUIRED));
        vm.warp(expiry);
        assertFalse(registry.isEligible(alice, POLICY, REQUIRED));
        vm.warp(expiry + 1);
        assertFalse(registry.isEligible(alice, POLICY, REQUIRED));
    }

    function test_revokeMakesIneligible() public {
        _attest(alice);
        vm.expectEmit(true, true, true, true);
        emit AttestationRegistry.Revoked(alice, POLICY, operator);
        vm.prank(operator);
        registry.revoke(alice, POLICY);
        assertFalse(registry.isEligible(alice, POLICY, REQUIRED));
        assertTrue(registry.decisionOf(alice, POLICY).revoked);
    }

    function test_revokeWithoutDecisionReverts() public {
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NoDecision.selector, alice, POLICY));
        registry.revoke(alice, POLICY);
    }

    function test_operatorCanReattestAfterRevoke() public {
        _attest(alice);
        vm.prank(operator);
        registry.revoke(alice, POLICY);
        _attest(alice);
        assertTrue(registry.isEligible(alice, POLICY, REQUIRED));
    }

    function test_nonOperatorCannotAttest() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NotOperator.selector, POLICY, stranger));
        registry.attestByOperator(alice, _decision(REQUIRED, uint64(block.timestamp + 1 days)));
        // owner is not automatically an operator either
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NotOperator.selector, POLICY, owner));
        registry.attestByOperator(alice, _decision(REQUIRED, uint64(block.timestamp + 1 days)));
    }

    function test_nonOperatorCannotRevoke() public {
        _attest(alice);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NotOperator.selector, POLICY, stranger));
        registry.revoke(alice, POLICY);
        assertTrue(registry.isEligible(alice, POLICY, REQUIRED));
    }

    function test_operatorScopedToPolicy() public {
        bytes32 other = keccak256("other.policy");
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        d.policyId = other;
        vm.prank(operator);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NotOperator.selector, other, operator));
        registry.attestByOperator(alice, d);
    }

    function test_onlyOwnerConfigures() public {
        vm.prank(stranger);
        vm.expectRevert();
        registry.setOperator(POLICY, stranger, true);
        vm.prank(stranger);
        vm.expectRevert();
        registry.setVerifier(POLICY, verifier);
    }

    // ------------------------------------------------------------------
    // Registry: proof path
    // ------------------------------------------------------------------

    function test_attestWithProofVerifierUnsetReverts() public {
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.VerifierUnset.selector, POLICY));
        registry.attestWithProof(alice, d, hex"", _inputs(alice, d));
    }

    function test_attestWithProofTrue() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        vm.prank(stranger); // permissionless submission
        registry.attestWithProof(alice, d, hex"01", _inputs(alice, d));
        assertTrue(registry.isEligible(alice, POLICY, REQUIRED));
    }

    function test_attestWithProofFalseReverts() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        verifier.setResult(false);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        vm.expectRevert(AttestationRegistry.InvalidProof.selector);
        registry.attestWithProof(alice, d, hex"01", _inputs(alice, d));
        assertFalse(registry.isEligible(alice, POLICY, REQUIRED));
    }

    function test_attestWithProofSubjectMismatchReverts() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        bytes32[] memory inputs = _inputs(bob, d); // proof bound to bob, submitted for alice
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.PublicInputMismatch.selector, 0));
        registry.attestWithProof(alice, d, hex"01", inputs);
    }

    function test_attestWithProofBitsAndExpiryBound() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        bytes32[] memory inputs = _inputs(alice, d);

        inputs[2] = bytes32(BIT_ADULT);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.PublicInputMismatch.selector, 2));
        registry.attestWithProof(alice, d, hex"01", inputs);

        inputs = _inputs(alice, d);
        inputs[3] = bytes32(uint256(d.expiry) + 1);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.PublicInputMismatch.selector, 3));
        registry.attestWithProof(alice, d, hex"01", inputs);

        inputs = _inputs(alice, d);
        inputs[1] = keccak256("other");
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.PublicInputMismatch.selector, 1));
        registry.attestWithProof(alice, d, hex"01", inputs);
    }

    function test_attestWithProofWrongLengthReverts() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        bytes32[] memory inputs = new bytes32[](3);
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.PublicInputsLength.selector, 3, 4));
        registry.attestWithProof(alice, d, hex"01", inputs);
    }

    function test_attestWithProofCannotUndoRevoke() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        _attest(alice);
        vm.prank(operator);
        registry.revoke(alice, POLICY);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.DecisionRevoked.selector, alice, POLICY));
        registry.attestWithProof(alice, d, hex"01", _inputs(alice, d));
        assertFalse(registry.isEligible(alice, POLICY, REQUIRED));
    }

    function test_attestWithProofNonceReplayReverts() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        bytes32 nonce = keccak256("nonce/1");
        bytes memory proof = abi.encodePacked(nonce, hex"01");
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
        assertTrue(registry.nonceConsumed(keccak256(abi.encode(POLICY, nonce))));

        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NonceConsumed.selector, POLICY, nonce));
        registry.attestWithProof(alice, d, proof, _inputs(alice, d));
        // same nonce for another subject is a replay too (the proof binds the subject anyway)
        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NonceConsumed.selector, POLICY, nonce));
        registry.attestWithProof(bob, d, proof, _inputs(bob, d));

        // a fresh nonce passes; nonces are scoped per policy
        bytes memory proof2 = abi.encodePacked(keccak256("nonce/2"), hex"01");
        registry.attestWithProof(alice, d, proof2, _inputs(alice, d));
        bytes32 other = keccak256("other");
        vm.prank(owner);
        registry.setVerifier(other, verifier);
        Decision memory d2 = d;
        d2.policyId = other;
        registry.attestWithProof(alice, d2, proof, _inputs(alice, d2));
    }

    function test_attestWithProofZeroNonceNotConsumed() public {
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        registry.attestWithProof(alice, d, hex"01", _inputs(alice, d));
        registry.attestWithProof(alice, d, hex"01", _inputs(alice, d));
        assertFalse(registry.nonceConsumed(keccak256(abi.encode(POLICY, bytes32(0)))));
    }

    // ------------------------------------------------------------------
    // Subscription and FundToken
    // ------------------------------------------------------------------

    function test_subscribeRevertsWhenNotEligible() public {
        vm.prank(alice);
        vm.expectRevert(Subscription.NotEligible.selector);
        subscription.subscribe();
    }

    function test_subscribeMints() public {
        _attest(alice);
        vm.prank(alice);
        subscription.subscribe();
        assertEq(token.balanceOf(alice), DEMO_AMOUNT);
        assertEq(token.totalSupply(), DEMO_AMOUNT);
    }

    function test_transferToEligiblePasses() public {
        _attest(alice);
        _attest(bob);
        vm.prank(alice);
        subscription.subscribe();
        vm.prank(alice);
        assertTrue(token.transfer(bob, 10e18));
        assertEq(token.balanceOf(bob), 10e18);
        assertEq(token.balanceOf(alice), DEMO_AMOUNT - 10e18);
    }

    function test_transferToIneligibleFails() public {
        _attest(alice);
        vm.prank(alice);
        subscription.subscribe();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotEligible.selector, carol));
        token.transfer(carol, 10e18); // forge-lint: disable-line(erc20-unchecked-transfer)
    }

    function test_transferFromToIneligibleFails() public {
        _attest(alice);
        vm.prank(alice);
        subscription.subscribe();
        vm.prank(alice);
        token.approve(stranger, 10e18);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotEligible.selector, carol));
        token.transferFrom(alice, carol, 10e18); // forge-lint: disable-line(erc20-unchecked-transfer)
    }

    function test_transferToIssuerAlwaysPasses() public {
        _attest(alice);
        vm.prank(alice);
        subscription.subscribe();
        assertFalse(registry.isEligible(issuer, POLICY, REQUIRED));
        vm.prank(alice);
        assertTrue(token.transfer(issuer, 10e18));
        assertEq(token.balanceOf(issuer), 10e18);
    }

    function test_revokeClosesSubscribeAndTransfer() public {
        _attest(alice);
        _attest(bob);
        vm.prank(alice);
        subscription.subscribe();

        vm.prank(operator);
        registry.revoke(bob, POLICY);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotEligible.selector, bob));
        token.transfer(bob, 1e18); // forge-lint: disable-line(erc20-unchecked-transfer)
        vm.prank(bob);
        vm.expectRevert(Subscription.NotEligible.selector);
        subscription.subscribe();

        vm.prank(operator);
        registry.revoke(alice, POLICY);
        vm.prank(alice);
        vm.expectRevert(Subscription.NotEligible.selector);
        subscription.subscribe();
        // existing holder may still return tokens to the issuer
        vm.prank(alice);
        assertTrue(token.transfer(issuer, 1e18));
    }

    function test_expiryClosesTransfer() public {
        _attest(alice);
        vm.prank(operator);
        registry.attestByOperator(bob, _decision(REQUIRED, uint64(block.timestamp + 10)));
        vm.prank(alice);
        subscription.subscribe();
        vm.warp(block.timestamp + 11);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotEligible.selector, bob));
        token.transfer(bob, 1e18); // forge-lint: disable-line(erc20-unchecked-transfer)
    }

    function test_mintOnlyIssuerOrSubscription() public {
        _attest(alice);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotMinter.selector, stranger));
        token.mint(alice, 1e18);
        vm.prank(issuer);
        token.mint(alice, 1e18);
        assertEq(token.balanceOf(alice), 1e18);
    }

    function test_setSubscriptionOnceByIssuer() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotIssuer.selector, stranger));
        token.setSubscription(stranger);
        vm.prank(issuer);
        vm.expectRevert(FundToken.SubscriptionAlreadySet.selector);
        token.setSubscription(stranger);
    }
}
