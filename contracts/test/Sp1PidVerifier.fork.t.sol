// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";
import {Sp1PidVerifier} from "../src/sp1/Sp1PidVerifier.sol";
import {ISP1Verifier} from "../src/sp1/interfaces/ISP1Verifier.sol";
import {Sp1Fixture} from "./Sp1Fixture.sol";

/// @notice Fork tests against the real SP1VerifierGateway on Sepolia with the Groth16 fixture from
///         prover-sp1/fixtures/calldata-groth16.json. Read-only eth_calls, no transaction is sent.
///         Runs only when SEPOLIA_RPC_URL is set, otherwise every test is skipped.
///
///         The fixture's expiry is the issuer credential exp (2027-09-01), so the full registry path
///         runs at the real fork head without vm.warp.
contract Sp1PidVerifierForkTest is Test {
    ISP1Verifier constant GATEWAY = ISP1Verifier(0x397A5f7f3dBd538f23DE225B51f532c34448dA9B);
    bytes32 constant POLICY = keccak256("nachweis.pid.over18.v1");

    Sp1Fixture.Data f;
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
        f = Sp1Fixture.load();
    }

    modifier onlyFork() {
        vm.skip(!forked, "SEPOLIA_RPC_URL not set");
        _;
    }

    function test_fork_gatewayVerifiesFixture() public onlyFork {
        GATEWAY.verifyProof(f.vkey, f.publicValues, f.proof);
    }

    function test_fork_gatewayRejectsTamperedPublicValues() public onlyFork {
        bytes memory tampered = f.publicValues;
        tampered[64 + 31] ^= 0x01; // flip over18
        vm.expectRevert();
        GATEWAY.verifyProof(f.vkey, tampered, f.proof);
    }

    function test_fork_gatewayRejectsTamperedProof() public onlyFork {
        bytes memory tampered = f.proof;
        tampered[10] ^= 0x01;
        vm.expectRevert();
        GATEWAY.verifyProof(f.vkey, f.publicValues, tampered);
    }

    function test_fork_registryPath() public onlyFork {
        address owner = makeAddr("owner");
        AttestationRegistry registry = new AttestationRegistry(owner);
        Sp1PidVerifier verifier = new Sp1PidVerifier(GATEWAY, f.vkey, f.issuerKeyHash, f.vctHash, POLICY);
        vm.prank(owner);
        registry.setVerifier(POLICY, verifier);

        assertGt(f.expiry, block.timestamp, "fixture expiry (issuer exp) expected ahead of the fork head");

        uint256 bits = verifier.BIT_IDENTITY() | verifier.BIT_OVER_18();
        Decision memory d =
            Decision({policyId: POLICY, bits: bits, tier: 0, expiry: f.expiry, statusRef: bytes32(0), revoked: false});
        bytes32[] memory inputs = new bytes32[](4);
        inputs[0] = bytes32(uint256(uint160(f.subject)));
        inputs[1] = POLICY;
        inputs[2] = bytes32(bits);
        inputs[3] = bytes32(uint256(f.expiry));

        registry.attestWithProof(f.subject, d, abi.encode(f.publicValues, f.proof), inputs);
        // Evidence alone is not eligibility since the issuer-approval split: the operator approves first.
        assertFalse(registry.isEligible(f.subject, POLICY, bits));
        address operator = makeAddr("operator");
        vm.prank(owner);
        registry.setOperator(POLICY, operator, true);
        vm.prank(operator);
        registry.approve(f.subject, POLICY);
        assertTrue(registry.isEligible(f.subject, POLICY, bits));

        vm.expectRevert(abi.encodeWithSelector(AttestationRegistry.NonceConsumed.selector, POLICY, f.nonce));
        registry.attestWithProof(f.subject, d, abi.encode(f.publicValues, f.proof), inputs);
    }
}
