// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Errors} from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import {AttestationRegistry} from "../../src/AttestationRegistry.sol";
import {Decision} from "../../src/interfaces/IEligibility.sol";
import {GatedPayout} from "../../src/showcase/GatedPayout.sol";
import {MockProofVerifier} from "../../src/test/MockProofVerifier.sol";
import {MockStable} from "../../src/test/MockStable.sol";

/// Showcase "contractor payout desk": the gate pays only recipients with a live decision.
contract GatedPayoutTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.pid.over18.v1");
    uint256 constant REQUIRED = 0x3;
    uint256 constant AMOUNT = 100e6; // 100 mUSD
    uint256 constant FUNDS = 10_000e6;
    bytes32 constant RUN = keccak256("run-1");

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice"); // evidence and approval
    address bob = makeAddr("bob"); // evidence through the proof path, never approved
    address carol = makeAddr("carol"); // approved, then revoked
    address dave = makeAddr("dave"); // approved, decision expired
    address stranger = makeAddr("stranger"); // no decision

    AttestationRegistry registry;
    MockStable token;
    GatedPayout gate;
    MockProofVerifier verifier;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(owner);
        verifier = new MockProofVerifier(true);
        vm.startPrank(owner);
        registry.setOperator(POLICY, operator, true);
        registry.setVerifier(POLICY, verifier);
        vm.stopPrank();
        token = new MockStable();
        gate = new GatedPayout(registry, IERC20(address(token)), POLICY, REQUIRED);

        token.mint(treasury, FUNDS);
        vm.prank(treasury);
        token.approve(address(gate), type(uint256).max);

        uint64 live = uint64(block.timestamp + 30 days);
        _attestApproved(alice, live);
        _attestWithProof(bob, live);
        _attestApproved(carol, live);
        vm.prank(operator);
        registry.revoke(carol, POLICY);
        _attestApproved(dave, uint64(block.timestamp + 1 days));
        vm.warp(block.timestamp + 2 days); // dave's decision is now expired; the others still live
    }

    function _decision(uint64 expiry) internal pure returns (Decision memory) {
        return Decision({
            policyId: POLICY, bits: REQUIRED, tier: 1, expiry: expiry, statusRef: keccak256("status/0"), revoked: false
        });
    }

    /// Operator path: evidence and approval in one transaction.
    function _attestApproved(address subject, uint64 expiry) internal {
        vm.prank(operator);
        registry.attestByOperator(subject, _decision(expiry));
    }

    /// Proof path: evidence only, approval is the issuer's separate step.
    function _attestWithProof(address subject, uint64 expiry) internal {
        Decision memory d = _decision(expiry);
        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(uint160(subject)));
        inputs[1] = POLICY;
        inputs[2] = bytes32(d.bits);
        inputs[3] = bytes32(uint256(d.expiry));
        registry.attestWithProof(subject, d, abi.encodePacked("proof-", subject), inputs);
        (bool has, bool approved,,) = registry.statusOf(subject, POLICY);
        assertTrue(has && !approved, "fixture: evidence without approval");
    }

    function _one(address r, uint256 a) internal pure returns (address[] memory rs, uint256[] memory as_) {
        rs = new address[](1);
        as_ = new uint256[](1);
        rs[0] = r;
        as_[0] = a;
    }

    // ------------------------------------------------------------------ paid

    function test_eligiblePaid() public {
        (address[] memory rs, uint256[] memory as_) = _one(alice, AMOUNT);
        vm.expectEmit(true, true, true, true);
        emit GatedPayout.PaidOut(treasury, alice, AMOUNT, RUN);
        vm.expectEmit(true, true, false, true);
        emit GatedPayout.PayoutRun(treasury, RUN, 1, AMOUNT);
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);
        assertEq(token.balanceOf(alice), AMOUNT);
        assertEq(token.balanceOf(treasury), FUNDS - AMOUNT);
    }

    function test_batchOfEligible() public {
        address erin = makeAddr("erin");
        _attestApproved(erin, uint64(block.timestamp + 30 days));
        address[] memory rs = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        rs[0] = alice;
        rs[1] = erin;
        as_[0] = AMOUNT;
        as_[1] = 2 * AMOUNT;
        vm.prank(treasury);
        gate.payout(rs, as_, 3 * AMOUNT, RUN);
        assertEq(token.balanceOf(alice), AMOUNT);
        assertEq(token.balanceOf(erin), 2 * AMOUNT);
        assertEq(token.balanceOf(treasury), FUNDS - 3 * AMOUNT);
    }

    function test_eligibleOfPreview() public view {
        address[] memory rs = new address[](5);
        rs[0] = alice;
        rs[1] = bob;
        rs[2] = carol;
        rs[3] = dave;
        rs[4] = stranger;
        bool[] memory e = gate.eligibleOf(rs);
        assertTrue(e[0], "approved");
        assertFalse(e[1], "not approved");
        assertFalse(e[2], "revoked");
        assertFalse(e[3], "expired");
        assertFalse(e[4], "no decision");
    }

    // ------------------------------------------------------------------ refused by the gate

    function test_noDecisionRefused() public {
        (address[] memory rs, uint256[] memory as_) = _one(stranger, AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.NotEligible.selector, stranger));
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);
    }

    function test_notApprovedRefused_thenApprovalOpens() public {
        (address[] memory rs, uint256[] memory as_) = _one(bob, AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.NotEligible.selector, bob));
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);

        vm.prank(operator);
        registry.approve(bob, POLICY);
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);
        assertEq(token.balanceOf(bob), AMOUNT);
    }

    function test_revokedRefused() public {
        (address[] memory rs, uint256[] memory as_) = _one(carol, AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.NotEligible.selector, carol));
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);
    }

    function test_revokeClosesAfterPayment() public {
        (address[] memory rs, uint256[] memory as_) = _one(alice, AMOUNT);
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);

        vm.prank(operator);
        registry.revoke(alice, POLICY);
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.NotEligible.selector, alice));
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, keccak256("run-2"));
        assertEq(token.balanceOf(alice), AMOUNT, "nothing more was paid");
    }

    function test_expiredRefused() public {
        (address[] memory rs, uint256[] memory as_) = _one(dave, AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.NotEligible.selector, dave));
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);
    }

    function test_partialBatchRevertsWhole() public {
        address[] memory rs = new address[](2);
        uint256[] memory as_ = new uint256[](2);
        rs[0] = alice;
        rs[1] = stranger;
        as_[0] = AMOUNT;
        as_[1] = AMOUNT;
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.NotEligible.selector, stranger));
        vm.prank(treasury);
        gate.payout(rs, as_, 2 * AMOUNT, RUN);
        assertEq(token.balanceOf(alice), 0, "the eligible recipient was not paid either");
        assertEq(token.balanceOf(treasury), FUNDS);
    }

    // ------------------------------------------------------------------ argument and allowance checks

    function test_totalMismatchRefused() public {
        (address[] memory rs, uint256[] memory as_) = _one(alice, AMOUNT);
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.TotalMismatch.selector, AMOUNT, AMOUNT + 1));
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT + 1, RUN);
    }

    function test_lengthMismatchRefused() public {
        address[] memory rs = new address[](2);
        uint256[] memory as_ = new uint256[](1);
        rs[0] = alice;
        rs[1] = alice;
        as_[0] = AMOUNT;
        vm.expectRevert(GatedPayout.LengthMismatch.selector);
        vm.prank(treasury);
        gate.payout(rs, as_, AMOUNT, RUN);
    }

    function test_emptyRunRefused() public {
        address[] memory rs = new address[](0);
        uint256[] memory as_ = new uint256[](0);
        vm.expectRevert(GatedPayout.EmptyRun.selector);
        vm.prank(treasury);
        gate.payout(rs, as_, 0, RUN);
    }

    function test_zeroAmountRefused() public {
        (address[] memory rs, uint256[] memory as_) = _one(alice, 0);
        vm.expectRevert(abi.encodeWithSelector(GatedPayout.ZeroAmount.selector, alice));
        vm.prank(treasury);
        gate.payout(rs, as_, 0, RUN);
    }

    function test_noAllowanceRefused() public {
        address other = makeAddr("other-payer");
        token.mint(other, AMOUNT);
        (address[] memory rs, uint256[] memory as_) = _one(alice, AMOUNT);
        vm.expectRevert(
            abi.encodeWithSelector(IERC20Errors.ERC20InsufficientAllowance.selector, address(gate), 0, AMOUNT)
        );
        vm.prank(other);
        gate.payout(rs, as_, AMOUNT, RUN);
    }
}
