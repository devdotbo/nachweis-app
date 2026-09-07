// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {NoirPidVerifier} from "../src/noir/NoirPidVerifier.sol";
import {IHonkVerifier} from "../src/noir/interfaces/IHonkVerifier.sol";
import {HonkVerifier} from "../src/noir/PidSdJwtUltraHonkVerifier.sol";

/// @notice Deploys the bb-generated HonkVerifier (unless HONK_VERIFIER is set) and a NoirPidVerifier
///         for one policy; if REGISTRY_ADDRESS is set, registers it with AttestationRegistry.setVerifier
///         (the deployer key must be the registry owner).
///
/// The HonkVerifier is compiled with optimizer_runs 1 through the compilation restriction in
/// foundry.toml (24,246 bytes runtime, under EIP-170); `new HonkVerifier()` here uses that artifact.
///
/// Env vars (see /.env.example):
///   DEPLOYER_PRIVATE_KEY   required
///   HONK_VERIFIER          optional address of an already deployed HonkVerifier (default: deploy one)
///   PID_ISSUER_KEY_HASH    optional bytes32 (default: sandbox issuer of the synthetic fixture)
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.pid.over18.v1"))
///   REGISTRY_ADDRESS       optional; when set, calls setVerifier(POLICY_ID, verifier)
///
/// Dry run (simulation only, nothing is sent):
///   forge script script/DeployNoirVerifier.s.sol:DeployNoirVerifier --rpc-url sepolia
/// Broadcast requires an explicit --broadcast and is not part of this work package.
contract DeployNoirVerifier is Script {
    bytes32 constant FIXTURE_ISSUER_KEY_HASH = 0x78cf23963b47d3e393c79ea091c4ed80ebbae4ff78992058dd92fd34e1635183;
    uint256 constant EIP170_LIMIT = 24_576;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address honkAddress = vm.envOr("HONK_VERIFIER", address(0));
        bytes32 issuerKeyHash = vm.envOr("PID_ISSUER_KEY_HASH", FIXTURE_ISSUER_KEY_HASH);
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        address registryAddress = vm.envOr("REGISTRY_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);
        if (honkAddress == address(0)) {
            honkAddress = address(new HonkVerifier());
        }
        NoirPidVerifier verifier = new NoirPidVerifier(IHonkVerifier(honkAddress), issuerKeyHash, policyId);
        if (registryAddress != address(0)) {
            AttestationRegistry(registryAddress).setVerifier(policyId, verifier);
        }
        vm.stopBroadcast();

        require(honkAddress.code.length <= EIP170_LIMIT, "HonkVerifier runtime exceeds EIP-170");

        console.log("NoirPidVerifier: ", address(verifier));
        console.log("HonkVerifier:    ", honkAddress);
        console.log("HonkVerifier runtime bytes:", honkAddress.code.length);
        console.log("Registry:        ", registryAddress);
        console.log("issuerKeyHash:");
        console.logBytes32(issuerKeyHash);
        console.log("policyId:");
        console.logBytes32(policyId);
    }
}
