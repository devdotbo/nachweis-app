// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {MockProofVerifier} from "../src/test/MockProofVerifier.sol";
import {Decision, IEligibility} from "../src/interfaces/IEligibility.sol";
import {EudiAllowlistChecker} from "../src/uniswap/EudiAllowlistChecker.sol";
import {IAllowlistChecker} from "../src/uniswap/interfaces/IAllowlistChecker.sol";
import {PermissionFlag, PermissionFlags} from "../src/uniswap/libraries/PermissionFlags.sol";

/// @notice Checker in isolation: the four states the pool must distinguish (attested, unattested, revoked, expired)
///         plus the ERC-165 handshake the PermissionsAdapter performs.
contract EudiAllowlistCheckerTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.demo.fund.v1");
    uint256 constant BIT_IDENTITY = 1 << 0;
    uint256 constant BIT_OVER_18 = 1 << 1;
    uint256 constant BIT_EU_RESIDENT = 1 << 2; // reserved, never required
    uint256 constant REQUIRED = BIT_IDENTITY | BIT_OVER_18; // 0x3

    address owner = makeAddr("owner");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address fundToken = makeAddr("fundToken");

    AttestationRegistry registry;
    EudiAllowlistChecker checker;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(owner);
        vm.prank(owner);
        registry.setOperator(POLICY, operator, true);
        checker = new EudiAllowlistChecker(registry, POLICY, REQUIRED);
    }

    function _attest(address subject, uint256 bits, uint64 expiry) internal {
        vm.prank(operator);
        registry.attestByOperator(
            subject,
            Decision({
                policyId: POLICY, bits: bits, tier: 1, expiry: expiry, statusRef: keccak256("status/0"), revoked: false
            })
        );
    }

    function _flags(address subject) internal view returns (bytes2) {
        return PermissionFlag.unwrap(checker.checkAllowlist(subject, fundToken));
    }

    function test_constructorRejectsZeroRegistryAndPolicy() public {
        vm.expectRevert(EudiAllowlistChecker.RegistryZero.selector);
        new EudiAllowlistChecker(IEligibility(address(0)), POLICY, REQUIRED);
        vm.expectRevert(EudiAllowlistChecker.PolicyIdZero.selector);
        new EudiAllowlistChecker(registry, bytes32(0), REQUIRED);
    }

    function test_immutablesExposed() public view {
        assertEq(address(checker.registry()), address(registry));
        assertEq(checker.policyId(), POLICY);
        assertEq(checker.requiredBits(), REQUIRED);
        assertEq(PermissionFlag.unwrap(checker.ELIGIBLE_FLAGS()), bytes2(0x0003));
    }

    function test_noneWhenUnattested() public view {
        assertEq(_flags(alice), PermissionFlag.unwrap(PermissionFlags.NONE));
    }

    function test_swapAndLiquidityWhenAttested() public {
        _attest(alice, REQUIRED, uint64(block.timestamp + 365 days));
        PermissionFlag f = checker.checkAllowlist(alice, fundToken);
        assertTrue((f & PermissionFlags.SWAP_ALLOWED) == PermissionFlags.SWAP_ALLOWED);
        assertTrue((f & PermissionFlags.LIQUIDITY_ALLOWED) == PermissionFlags.LIQUIDITY_ALLOWED);
        assertEq(PermissionFlag.unwrap(f), bytes2(0x0003));
        // An unrelated address stays at NONE.
        assertEq(_flags(bob), bytes2(0));
    }

    /// @dev Proof evidence alone never opens the pool; the issuer's approve does, revoke closes it,
    ///      and only approve reopens it.
    function test_proofEvidenceNeedsApproval() public {
        MockProofVerifier verifier = new MockProofVerifier(true);
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);
        Decision memory d = Decision({
            policyId: POLICY,
            bits: REQUIRED,
            tier: 1,
            expiry: uint64(block.timestamp + 365 days),
            statusRef: bytes32(0),
            revoked: false
        });
        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(uint160(alice)));
        inputs[1] = POLICY;
        inputs[2] = bytes32(REQUIRED);
        inputs[3] = bytes32(uint256(d.expiry));
        registry.attestWithProof(alice, d, hex"", inputs);
        assertEq(_flags(alice), bytes2(0));

        vm.prank(operator);
        registry.approve(alice, POLICY);
        assertEq(_flags(alice), bytes2(0x0003));

        vm.prank(operator);
        registry.revoke(alice, POLICY);
        assertEq(_flags(alice), bytes2(0));

        vm.prank(operator);
        registry.approve(alice, POLICY);
        assertEq(_flags(alice), bytes2(0x0003));
    }

    function test_noneAfterRevoke() public {
        _attest(alice, REQUIRED, uint64(block.timestamp + 365 days));
        assertEq(_flags(alice), bytes2(0x0003));
        vm.prank(operator);
        registry.revoke(alice, POLICY);
        assertEq(_flags(alice), bytes2(0));
    }

    function test_noneAfterExpiry() public {
        uint64 expiry = uint64(block.timestamp + 30 days);
        _attest(alice, REQUIRED, expiry);
        vm.warp(expiry - 1);
        assertEq(_flags(alice), bytes2(0x0003));
        vm.warp(expiry);
        assertEq(_flags(alice), bytes2(0));
    }

    function test_noneWhenRequiredBitsMissing() public {
        _attest(alice, BIT_IDENTITY | BIT_EU_RESIDENT, uint64(block.timestamp + 365 days)); // over 18 missing
        assertEq(_flags(alice), bytes2(0));
    }

    function test_noneUnderOtherPolicy() public {
        bytes32 otherPolicy = keccak256("some.other.policy");
        vm.prank(owner);
        registry.setOperator(otherPolicy, operator, true);
        vm.prank(operator);
        registry.attestByOperator(
            alice,
            Decision({
                policyId: otherPolicy,
                bits: REQUIRED,
                tier: 1,
                expiry: uint64(block.timestamp + 365 days),
                statusRef: bytes32(0),
                revoked: false
            })
        );
        assertEq(_flags(alice), bytes2(0));
    }

    function testFuzz_tokenAddressDoesNotChangeTheAnswer(address token) public {
        _attest(alice, REQUIRED, uint64(block.timestamp + 365 days));
        assertEq(PermissionFlag.unwrap(checker.checkAllowlist(alice, token)), bytes2(0x0003));
        assertEq(PermissionFlag.unwrap(checker.checkAllowlist(bob, token)), bytes2(0));
    }

    function test_supportsInterface() public view {
        assertTrue(checker.supportsInterface(type(IAllowlistChecker).interfaceId));
        assertTrue(checker.supportsInterface(type(IERC165).interfaceId));
        assertFalse(checker.supportsInterface(0xffffffff));
        assertFalse(checker.supportsInterface(0x12345678));
        // The id the adapter computes: the single checkAllowlist(address,address) selector.
        assertEq(type(IAllowlistChecker).interfaceId, IAllowlistChecker.checkAllowlist.selector);
    }
}
