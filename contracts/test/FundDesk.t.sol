// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {FundDesk} from "../src/showcase/FundDesk.sol";
import {MockStable} from "../src/test/MockStable.sol";
import {MockProofVerifier} from "../src/test/MockProofVerifier.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";

contract FundDeskTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.demo.fund.v1");
    uint256 constant BIT_IDENTITY = 1 << 0;
    uint256 constant BIT_OVER_18 = 1 << 1;
    uint256 constant REQUIRED = BIT_IDENTITY | BIT_OVER_18; // 0x3

    uint256 constant SUB = 100e6;
    uint256 constant DIST = 10e6;
    uint256 constant RED = 50e18;

    address owner = makeAddr("owner");
    address issuer = makeAddr("issuer");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address stranger = makeAddr("stranger");

    AttestationRegistry registry;
    MockStable stable;
    FundDesk desk;
    FundToken token;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(owner);
        vm.prank(owner);
        registry.setOperator(POLICY, operator, true);

        stable = new MockStable();
        desk = new FundDesk(IERC20(address(stable)), issuer);
        token = new FundToken("Nachweis Demo Fund", "NDF", registry, POLICY, REQUIRED, address(desk));
        vm.prank(issuer);
        desk.setToken(token);
    }

    // ------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------

    function _decision(uint256 bits, uint64 expiry) internal pure returns (Decision memory) {
        return Decision({
            policyId: POLICY, bits: bits, tier: 1, expiry: expiry, statusRef: keccak256("status/0"), revoked: false
        });
    }

    function _inputs(address subject, Decision memory d) internal pure returns (bytes32[] memory inputs) {
        inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(uint160(subject)));
        inputs[1] = d.policyId;
        inputs[2] = bytes32(d.bits);
        inputs[3] = bytes32(uint256(d.expiry));
    }

    function _attest(address subject) internal {
        vm.prank(operator);
        registry.attestByOperator(subject, _decision(REQUIRED, uint64(block.timestamp + 365 days)));
    }

    function _fund(address addr, uint256 amount) internal {
        stable.mint(addr, amount);
    }

    function _subscribe(address addr, uint256 stableAmount) internal {
        vm.prank(addr);
        stable.approve(address(desk), stableAmount);
        vm.prank(addr);
        desk.subscribe(stableAmount);
    }

    /// @dev Issuer treasury funds and pushes one distribution.
    function _distribute(uint256 totalStable) internal {
        _fund(issuer, totalStable);
        vm.prank(issuer);
        stable.approve(address(desk), totalStable);
        vm.prank(issuer);
        desk.distribute(totalStable);
    }

    function _expectNotEligible(address subject) internal {
        vm.expectRevert(abi.encodeWithSelector(FundDesk.NotEligible.selector, subject));
    }

    // ------------------------------------------------------------------
    // Setup
    // ------------------------------------------------------------------

    function test_setTokenOnce() public {
        vm.prank(issuer);
        vm.expectRevert(FundDesk.TokenAlreadySet.selector);
        desk.setToken(token);

        FundDesk fresh = new FundDesk(IERC20(address(stable)), issuer);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        fresh.setToken(token);
    }

    // ------------------------------------------------------------------
    // Subscribe
    // ------------------------------------------------------------------

    function test_subscribeEligible() public {
        _attest(alice);
        _fund(alice, 1000e6);
        vm.prank(alice);
        stable.approve(address(desk), SUB);

        vm.expectEmit(true, true, true, true);
        emit FundDesk.Subscribed(alice, SUB, 100e18);
        vm.prank(alice);
        desk.subscribe(SUB);

        assertEq(stable.balanceOf(alice), 900e6);
        assertEq(token.balanceOf(alice), 100e18);
        assertEq(stable.balanceOf(address(desk)), 100e6);
    }

    function test_subscribeNoDecision() public {
        _fund(bob, 1000e6);
        vm.prank(bob);
        stable.approve(address(desk), SUB);
        vm.prank(bob);
        _expectNotEligible(bob);
        desk.subscribe(SUB);
    }

    function test_subscribeEvidenceWithoutApproval() public {
        MockProofVerifier verifier = new MockProofVerifier(true);
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = _decision(REQUIRED, uint64(block.timestamp + 1 days));
        vm.prank(stranger); // permissionless submission
        registry.attestWithProof(alice, d, hex"01", _inputs(alice, d));
        assertEq(registry.decisionOf(alice, POLICY).bits, REQUIRED);
        assertFalse(desk.isEligible(alice));

        _fund(alice, 1000e6);
        vm.prank(alice);
        stable.approve(address(desk), SUB);
        vm.prank(alice);
        _expectNotEligible(alice);
        desk.subscribe(SUB);
    }

    function test_subscribeZero() public {
        _attest(alice);
        vm.prank(alice);
        vm.expectRevert(FundDesk.ZeroAmount.selector);
        desk.subscribe(0);
    }

    function test_unitScaling() public view {
        assertEq(desk.unitsFor(1e6), 1e18);
        assertEq(desk.stableFor(1e18), 1e6);
        assertEq(desk.stableFor(1e18 - 1), 999999);
    }

    // ------------------------------------------------------------------
    // Distributions
    // ------------------------------------------------------------------

    function test_distributeOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        desk.distribute(DIST);
    }

    function test_distributeNoUnits() public {
        _fund(issuer, DIST);
        vm.prank(issuer);
        stable.approve(address(desk), DIST);
        vm.prank(issuer);
        vm.expectRevert(FundDesk.NoUnitsOutstanding.selector);
        desk.distribute(DIST);
    }

    function test_distributeAndClaim() public {
        _attest(alice);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);

        _fund(issuer, DIST);
        vm.prank(issuer);
        stable.approve(address(desk), DIST);
        vm.expectEmit(true, true, true, true);
        emit FundDesk.Distributed(0, DIST, 1e5);
        vm.prank(issuer);
        desk.distribute(DIST);

        (uint256 total, uint256 perUnit) = desk.distributions(0);
        assertEq(total, DIST);
        assertEq(perUnit, 1e5);
        assertEq(desk.distributionCount(), 1);
        assertEq(desk.claimable(alice, 0), DIST);
        assertEq(desk.claimableTotal(alice), DIST);

        vm.expectEmit(true, true, true, true);
        emit FundDesk.Claimed(0, alice, DIST);
        vm.prank(alice);
        uint256 paid = desk.claim(0);
        assertEq(paid, DIST);
        assertEq(stable.balanceOf(alice), 910e6);
        assertTrue(desk.claimed(0, alice));

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FundDesk.AlreadyClaimed.selector, 0));
        desk.claim(0);
        assertEq(desk.claimable(alice, 0), 0);
    }

    function test_claimAllTwoDistributions() public {
        _attest(alice);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);
        _distribute(10e6);
        _distribute(5e6);
        assertEq(desk.claimableTotal(alice), 15e6);

        vm.prank(alice);
        uint256 paid = desk.claimAll();
        assertEq(paid, 15e6);
        assertEq(stable.balanceOf(alice), 915e6);
        assertTrue(desk.claimed(0, alice));
        assertTrue(desk.claimed(1, alice));

        vm.prank(alice);
        vm.expectRevert(FundDesk.NothingToClaim.selector);
        desk.claimAll();
    }

    function test_claimProRata() public {
        _attest(alice);
        _attest(bob);
        _fund(alice, 1000e6);
        _fund(bob, 1000e6);
        _subscribe(alice, 100e6);
        _subscribe(bob, 300e6);
        _distribute(40e6);

        assertEq(desk.claimable(alice, 0), 10e6);
        assertEq(desk.claimable(bob, 0), 30e6);
    }

    /// @dev Stated simplification: no snapshot, so units bought after a distribution still claim it.
    function test_distributionAfterSubscribeCountsCurrentBalance() public {
        _attest(alice);
        _attest(carol);
        _fund(alice, 1000e6);
        _fund(carol, 1000e6);
        _subscribe(alice, SUB);
        _distribute(DIST);
        (, uint256 perUnit) = desk.distributions(0);

        _subscribe(carol, 50e6);
        uint256 expected = token.balanceOf(carol) * perUnit / 1e18;
        assertGt(expected, 0);
        assertEq(desk.claimable(carol, 0), expected);
        assertEq(desk.claimable(carol, 0), 5e6);
    }

    // ------------------------------------------------------------------
    // Redeem and inventory
    // ------------------------------------------------------------------

    function test_redeemEligible() public {
        _attest(alice);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);

        vm.prank(alice);
        token.approve(address(desk), RED);
        vm.expectEmit(true, true, true, true);
        emit FundDesk.Redeemed(alice, RED, 50e6);
        vm.prank(alice);
        desk.redeem(RED);

        assertEq(token.balanceOf(alice), 50e18);
        assertEq(stable.balanceOf(alice), 950e6);
        assertEq(token.balanceOf(address(desk)), 50e18);
        assertEq(desk.outstandingUnits(), 50e18);
    }

    function test_subscribeUsesInventoryFirst() public {
        _attest(alice);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);
        vm.prank(alice);
        token.approve(address(desk), RED);
        vm.prank(alice);
        desk.redeem(RED);
        assertEq(token.balanceOf(address(desk)), 50e18);
        uint256 supplyBefore = token.totalSupply();

        _attest(bob);
        _fund(bob, 1000e6);
        _subscribe(bob, 70e6);

        assertEq(token.totalSupply(), supplyBefore + 20e18);
        assertEq(token.balanceOf(address(desk)), 0);
        assertEq(token.balanceOf(bob), 70e18);
        assertEq(desk.outstandingUnits(), 120e18);
    }

    function test_redeemZero() public {
        _attest(alice);
        vm.prank(alice);
        vm.expectRevert(FundDesk.ZeroAmount.selector);
        desk.redeem(0);
        // below one stable wei rounds to nothing
        vm.prank(alice);
        vm.expectRevert(FundDesk.ZeroAmount.selector);
        desk.redeem(1e12 - 1);
    }

    // ------------------------------------------------------------------
    // Revoke and expiry close everything
    // ------------------------------------------------------------------

    function test_revokedRefusesAll() public {
        _attest(alice);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);
        _distribute(DIST);
        vm.prank(alice);
        stable.approve(address(desk), SUB);
        vm.prank(alice);
        token.approve(address(desk), RED);

        vm.prank(operator);
        registry.revoke(alice, POLICY);
        assertFalse(desk.isEligible(alice));

        uint256 stableBefore = stable.balanceOf(alice);
        uint256 unitsBefore = token.balanceOf(alice);

        vm.prank(alice);
        _expectNotEligible(alice);
        desk.subscribe(SUB);
        vm.prank(alice);
        _expectNotEligible(alice);
        desk.claim(0);
        vm.prank(alice);
        _expectNotEligible(alice);
        desk.claimAll();
        vm.prank(alice);
        _expectNotEligible(alice);
        desk.redeem(RED);

        assertEq(stable.balanceOf(alice), stableBefore);
        assertEq(token.balanceOf(alice), unitsBefore);
        assertFalse(desk.claimed(0, alice));

        // approve reopens
        vm.prank(operator);
        registry.approve(alice, POLICY);
        assertTrue(desk.isEligible(alice));
        vm.prank(alice);
        uint256 paid = desk.claim(0);
        assertEq(paid, DIST);
        assertEq(stable.balanceOf(alice), stableBefore + DIST);
    }

    function test_expiredRefusesAll() public {
        vm.prank(operator);
        registry.attestByOperator(alice, _decision(REQUIRED, uint64(block.timestamp + 1 hours)));
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);
        _distribute(DIST);
        vm.prank(alice);
        stable.approve(address(desk), SUB);
        vm.prank(alice);
        token.approve(address(desk), RED);

        vm.warp(block.timestamp + 1 hours + 1);
        assertFalse(desk.isEligible(alice));

        vm.prank(alice);
        _expectNotEligible(alice);
        desk.subscribe(SUB);
        vm.prank(alice);
        _expectNotEligible(alice);
        desk.claim(0);
        vm.prank(alice);
        _expectNotEligible(alice);
        desk.redeem(RED);
    }

    // ------------------------------------------------------------------
    // FundToken hook still applies to desk-minted units
    // ------------------------------------------------------------------

    function test_transferToUnattestedRefused() public {
        _attest(alice);
        _attest(bob);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotEligible.selector, stranger));
        token.transfer(stranger, 10e18);

        vm.prank(alice);
        assertTrue(token.transfer(bob, 10e18));
        assertEq(token.balanceOf(bob), 10e18);
    }

    /// @dev Stated simplification: claims follow the current balance, not a snapshot.
    function test_claimAfterTransferFollowsBalance() public {
        _attest(alice);
        _attest(bob);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);
        _distribute(DIST);

        vm.prank(alice);
        token.transfer(bob, 50e18);

        assertEq(desk.claimable(alice, 0), 5e6);
        assertEq(desk.claimable(bob, 0), 5e6);
    }

    /// @dev Regression: units claimed against and then sent on must not claim the same distribution
    ///      again. Before the paidOut cap, Bob's second claim drained 10 mUSD that backed Alice's
    ///      subscription and his full redemption reverted with ERC20InsufficientBalance(desk, 90e6, 100e6).
    function test_unitsSentAfterClaimDoNotClaimTwice() public {
        _attest(alice);
        _attest(bob);
        _fund(alice, 1000e6);
        _subscribe(alice, SUB);
        _distribute(DIST);

        vm.prank(alice);
        assertEq(desk.claim(0), DIST);
        assertEq(desk.paidOut(0), DIST);

        vm.prank(alice);
        assertTrue(token.transfer(bob, SUB * 1e12));
        assertEq(token.balanceOf(bob), SUB * 1e12);

        // The distribution is exhausted: nothing left for the same units under a new holder.
        assertEq(desk.claimable(bob, 0), 0);
        assertEq(desk.claimableTotal(bob), 0);
        vm.prank(bob);
        vm.expectRevert(FundDesk.NothingToClaim.selector);
        desk.claim(0);
        vm.prank(bob);
        vm.expectRevert(FundDesk.NothingToClaim.selector);
        desk.claimAll();
        assertFalse(desk.claimed(0, bob));

        // The desk still holds par for every outstanding unit: Bob redeems all 100 NDF for 100 mUSD.
        vm.prank(bob);
        token.approve(address(desk), SUB * 1e12);
        vm.prank(bob);
        desk.redeem(SUB * 1e12);
        assertEq(stable.balanceOf(bob), SUB);
        assertEq(stable.balanceOf(address(desk)), 0);
        assertEq(desk.outstandingUnits(), 0);
    }

    /// @dev A partial remainder is paid out, never more: Alice claims her 60 percent, sends every unit to
    ///      Bob, and Bob's claim is capped at the 4 mUSD the distribution still holds.
    function test_claimCappedAtDistributionRemainder() public {
        _attest(alice);
        _attest(bob);
        _fund(alice, 1000e6);
        _fund(bob, 1000e6);
        _subscribe(alice, 60e6);
        _subscribe(bob, 40e6);
        _distribute(DIST);

        vm.prank(alice);
        assertEq(desk.claim(0), 6e6);
        vm.prank(alice);
        assertTrue(token.transfer(bob, 60e18));

        // Bob holds 100 NDF, pro rata 10 mUSD, but only 4 mUSD of this distribution is unpaid.
        assertEq(desk.claimable(bob, 0), 4e6);
        vm.prank(bob);
        assertEq(desk.claim(0), 4e6);
        assertEq(desk.paidOut(0), DIST);
        assertTrue(desk.claimed(0, bob));
        assertEq(stable.balanceOf(address(desk)), 100e6);
    }
}
