// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {Sp1PidVerifier} from "../src/sp1/Sp1PidVerifier.sol";
import {ISP1Verifier} from "../src/sp1/interfaces/ISP1Verifier.sol";

/// @notice Deploys Sp1PidVerifier for one policy and, if REGISTRY_ADDRESS is set, registers it with
///         AttestationRegistry.setVerifier (the deployer key must be the registry owner).
///
/// Env vars (see /.env.example):
///   DEPLOYER_PRIVATE_KEY   required
///   SP1_GATEWAY            optional address (default: Sepolia SP1VerifierGateway)
///   SP1_PROGRAM_VKEY       optional bytes32 (default: prover-sp1/fixtures/vkey.txt)
///   PID_ISSUER_KEY_HASH    optional bytes32 (default: sandbox issuer of the synthetic fixture)
///   PID_VCT_HASH           optional bytes32 (default: sha256("urn:eudi:pid:de:1"))
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.pid.over18.v1"))
///   REGISTRY_ADDRESS       optional; when set, calls setVerifier(POLICY_ID, verifier)
///
/// Dry run (simulation only, nothing is sent):
///   forge script script/DeploySp1Verifier.s.sol:DeploySp1Verifier --rpc-url sepolia
/// Broadcast requires an explicit --broadcast and is not part of this work package.
contract DeploySp1Verifier is Script {
    address constant SEPOLIA_SP1_GATEWAY = 0x397A5f7f3dBd538f23DE225B51f532c34448dA9B;
    bytes32 constant FIXTURE_VKEY = 0x00b092add2a7d3fffa027c1178c7b0d77155f3c9e078925928fcfce4b39a4cc9;
    bytes32 constant FIXTURE_ISSUER_KEY_HASH = 0x841e741b14eacdfdeca2e96fd95af5b987b5b872f88f8e359df29f7635556656;
    bytes32 constant PID_DE_VCT_HASH = 0x27b2d76921e41420732d759e6a3f345b9132e37fae97b1930f39ec58cf9a567d;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address gateway = vm.envOr("SP1_GATEWAY", SEPOLIA_SP1_GATEWAY);
        bytes32 vkey = vm.envOr("SP1_PROGRAM_VKEY", FIXTURE_VKEY);
        bytes32 issuerKeyHash = vm.envOr("PID_ISSUER_KEY_HASH", FIXTURE_ISSUER_KEY_HASH);
        bytes32 vctHash = vm.envOr("PID_VCT_HASH", PID_DE_VCT_HASH);
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        address registryAddress = vm.envOr("REGISTRY_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);
        Sp1PidVerifier verifier = new Sp1PidVerifier(ISP1Verifier(gateway), vkey, issuerKeyHash, vctHash, policyId);
        if (registryAddress != address(0)) {
            AttestationRegistry(registryAddress).setVerifier(policyId, verifier);
        }
        vm.stopBroadcast();

        console.log("Sp1PidVerifier:  ", address(verifier));
        console.log("SP1 gateway:     ", gateway);
        console.log("Registry:        ", registryAddress);
        console.log("programVKey:");
        console.logBytes32(vkey);
        console.log("issuerKeyHash:");
        console.logBytes32(issuerKeyHash);
        console.log("vctHash:");
        console.logBytes32(vctHash);
        console.log("policyId:");
        console.logBytes32(policyId);
    }
}
