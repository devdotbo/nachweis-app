// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AttestationRegistry} from "../../src/AttestationRegistry.sol";
import {Decision} from "../../src/interfaces/IEligibility.sol";
import {ZkPassportVerifier} from "../../src/zkpassport/ZkPassportVerifier.sol";
import {
    IZKPassportHelper,
    IZKPassportVerifier,
    NullifierType,
    ProofVerificationParams
} from "../../src/zkpassport/interfaces/IZKPassportVerifier.sol";

/// @notice Fork tests against the real ZKPassportRootVerifier with the proof bundle zkPassport publishes
///         as a test fixture of its Verifier API (test/fixtures/zkpassport/outer_evm_count_6.json: a real
///         passport, compressed-evm mode, query age >= 18, nationality not AFG, facematch strict, domain
///         "localhost", no bound address). Read-only eth_calls, no transaction is sent.
///
///         Sepolia (SEPOLIA_RPC_URL): the deterministic root verifier exists, but this fixture's certificate
///         root is not in the Sepolia registry ("Invalid certificate registry root"); the helper's pure
///         decoders are exercised directly. Mainnet (MAINNET_RPC_URL): the root verifier accepts the
///         fixture; the adapter runs until the bound-address check, which the fixture cannot pass because
///         it binds nothing. Without the env vars every test is skipped.
contract ZkPassportVerifierForkTest is Test {
    IZKPassportVerifier constant ROOT = IZKPassportVerifier(0x1D000001000EFD9a6371f4d90bB8920D5431c0D8);
    bytes32 constant POLICY = keccak256("nachweis.pid.over18.v1");
    uint256 constant VALIDITY_20Y = 20 * 365 days;

    struct Fixture {
        bytes params;
        string domain;
        string scope;
        bytes32 version;
        uint256 proofTimestamp;
    }

    Fixture f;
    bool sepolia;
    bool mainnet;

    function setUp() public {
        string memory json = vm.readFile("test/fixtures/zkpassport/outer_evm_count_6.json");
        f.params = vm.parseJsonBytes(json, ".params");
        f.domain = vm.parseJsonString(json, ".domain");
        f.scope = vm.parseJsonString(json, ".scope");
        f.version = vm.parseJsonBytes32(json, ".version");
        f.proofTimestamp = vm.parseUint(vm.parseJsonString(json, ".proofTimestamp"));
    }

    function forkSepolia() internal returns (bool) {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return false;
        vm.createSelectFork(rpc);
        return true;
    }

    function forkMainnet() internal returns (bool) {
        string memory rpc = vm.envOr("MAINNET_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return false;
        vm.createSelectFork(rpc);
        return true;
    }

    function params() internal view returns (ProofVerificationParams memory) {
        return abi.decode(f.params, (ProofVerificationParams));
    }

    function adapter(bool devMode) internal returns (ZkPassportVerifier) {
        return new ZkPassportVerifier(ROOT, POLICY, f.domain, f.scope, devMode, VALIDITY_20Y, 30 days);
    }

    // ------------------------------------------------------------------ Sepolia

    function test_fork_sepolia_rootVerifierDeployed() public {
        vm.skip(!forkSepolia(), "SEPOLIA_RPC_URL not set");
        assertGt(address(ROOT).code.length, 0, "no code at the deterministic address");
        assertFalse(ROOT.paused());
        assertTrue(address(ROOT.helpers(f.version)) != address(0), "no helper for the fixture's version");
    }

    function test_fork_sepolia_helperDecodesFixture() public {
        vm.skip(!forkSepolia(), "SEPOLIA_RPC_URL not set");
        IZKPassportHelper helper = ROOT.helpers(f.version);
        ProofVerificationParams memory p = params();
        assertTrue(helper.isAgeAboveOrEqual(18, p.committedInputs));
        assertFalse(helper.isAgeAboveOrEqual(99, p.committedInputs));
        assertEq(helper.getProofTimestamp(p.proofVerificationData.publicInputs), f.proofTimestamp);
        assertTrue(helper.verifyScopes(p.proofVerificationData.publicInputs, f.domain, f.scope));
        assertFalse(helper.verifyScopes(p.proofVerificationData.publicInputs, "attestat.dev", f.scope));
        bytes32[] memory pi = p.proofVerificationData.publicInputs;
        assertEq(uint256(pi[pi.length - 3]), uint256(NullifierType.NON_SALTED_NULLIFIER), "nullifier type: a real passport, not a mock");
        vm.expectRevert(bytes("Bind data proof inputs not found"));
        helper.getBoundData(p.committedInputs);
    }

    function test_fork_sepolia_fixtureCertificateRootNotInSepoliaRegistry() public {
        vm.skip(!forkSepolia(), "SEPOLIA_RPC_URL not set");
        ProofVerificationParams memory p = params();
        p.serviceConfig.validityPeriodInSeconds = VALIDITY_20Y;
        vm.expectRevert(bytes("Invalid certificate registry root"));
        ROOT.verify(p);
    }

    // ------------------------------------------------------------------ mainnet

    function test_fork_mainnet_rootVerifierAcceptsFixture() public {
        vm.skip(!forkMainnet(), "MAINNET_RPC_URL not set");
        ProofVerificationParams memory p = params();
        p.serviceConfig.validityPeriodInSeconds = VALIDITY_20Y;
        p.serviceConfig.devMode = false;
        uint256 g = gasleft();
        (bool verified, bytes32 uid, IZKPassportHelper helper) = ROOT.verify(p);
        emit log_named_uint("gas ZKPassportRootVerifier.verify (fixture, mainnet fork)", g - gasleft());
        assertTrue(verified);
        assertEq(uid, 0x1618066ea3694f4d76a64995bd6ab83094133245641bbdb9e8da65de68699deb);
        assertTrue(helper.isAgeAboveOrEqual(18, p.committedInputs));
    }

    function test_fork_mainnet_rootVerifierRejectsTamperedProof() public {
        vm.skip(!forkMainnet(), "MAINNET_RPC_URL not set");
        ProofVerificationParams memory p = params();
        p.serviceConfig.validityPeriodInSeconds = VALIDITY_20Y;
        p.proofVerificationData.proof[100] ^= 0x01;
        // The UltraHonk verifier behind the root verifier reverts on a corrupted proof (ValueGeLimbMax)
        // rather than returning false; either way the adapter never reaches its own checks.
        vm.expectRevert();
        ROOT.verify(p);
    }

    function test_fork_mainnet_rootVerifierRejectsWrongScope() public {
        vm.skip(!forkMainnet(), "MAINNET_RPC_URL not set");
        ProofVerificationParams memory p = params();
        p.serviceConfig.validityPeriodInSeconds = VALIDITY_20Y;
        p.serviceConfig.scope = "attestat-over18";
        vm.expectRevert(bytes("Invalid domain or scope"));
        ROOT.verify(p);
    }

    function test_fork_mainnet_rootVerifierRejectsStaleProofWithDefaultValidity() public {
        vm.skip(!forkMainnet(), "MAINNET_RPC_URL not set");
        ProofVerificationParams memory p = params();
        p.serviceConfig.validityPeriodInSeconds = 7 days;
        vm.expectRevert(bytes("The proof was generated outside the validity period"));
        ROOT.verify(p);
    }

    /// @dev The adapter passes the root verifier and the age check with the real contracts; the fixture
    ///      binds no address, so the helper's bind lookup reverts. A proof from the app with
    ///      bind("user_address") and bind("chain") is what the builder's phone run adds.
    function test_fork_mainnet_adapterStopsAtBoundAddress() public {
        vm.skip(!forkMainnet(), "MAINNET_RPC_URL not set");
        ZkPassportVerifier v = adapter(false);
        bytes memory proof = v.encodeProof(params());
        bytes32[] memory pi = new bytes32[](4);
        pi[0] = bytes32(uint256(uint160(address(this))));
        pi[1] = POLICY;
        pi[2] = bytes32(v.BITS());
        pi[3] = bytes32(uint256(v.expiryOf(f.proofTimestamp)));
        vm.expectRevert(bytes("Bind data proof inputs not found"));
        v.verify(proof, pi);
    }

    function test_fork_mainnet_adapterRejectsWrongDomain() public {
        vm.skip(!forkMainnet(), "MAINNET_RPC_URL not set");
        ZkPassportVerifier v = new ZkPassportVerifier(ROOT, POLICY, "attestat.dev", f.scope, false, VALIDITY_20Y, 30 days);
        bytes memory proof = v.encodeProof(params());
        bytes32[] memory pi = new bytes32[](4);
        pi[0] = bytes32(uint256(uint160(address(this))));
        pi[1] = POLICY;
        pi[2] = bytes32(v.BITS());
        pi[3] = bytes32(uint256(v.expiryOf(f.proofTimestamp)));
        vm.expectRevert(bytes("Invalid domain or scope"));
        v.verify(proof, pi);
    }

    function test_fork_mainnet_registryRefusesUnboundFixture() public {
        vm.skip(!forkMainnet(), "MAINNET_RPC_URL not set");
        address owner = makeAddr("owner");
        AttestationRegistry registry = new AttestationRegistry(owner);
        ZkPassportVerifier v = adapter(false);
        vm.prank(owner);
        registry.setVerifier(POLICY, v);
        bytes memory proof = v.encodeProof(params());
        uint64 expiry = v.expiryOf(f.proofTimestamp);
        bytes32[] memory pi = new bytes32[](4);
        pi[0] = bytes32(uint256(uint160(address(this))));
        pi[1] = POLICY;
        pi[2] = bytes32(v.BITS());
        pi[3] = bytes32(uint256(expiry));
        Decision memory d = Decision({policyId: POLICY, bits: v.BITS(), tier: 1, expiry: expiry, statusRef: bytes32(0), revoked: false});
        vm.expectRevert(bytes("Bind data proof inputs not found"));
        registry.attestWithProof(address(this), d, proof, pi);
    }
}
