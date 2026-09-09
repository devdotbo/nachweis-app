// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {IProofVerifier} from "../src/interfaces/IProofVerifier.sol";
import {EvidenceRouter} from "../src/zkpassport/EvidenceRouter.sol";
import {ZkPassportVerifier} from "../src/zkpassport/ZkPassportVerifier.sol";
import {IZKPassportVerifier} from "../src/zkpassport/interfaces/IZKPassportVerifier.sol";

/// @notice Deploys a ZkPassportVerifier for one policy and, when FALLBACK_VERIFIER is set, an
///         EvidenceRouter in front of it so the same policyId keeps accepting the EUDI route. If
///         REGISTRY_ADDRESS is set, registers the router (or the bare adapter) with
///         AttestationRegistry.setVerifier (the deployer key must be the registry owner).
///
/// Env vars:
///   DEPLOYER_PRIVATE_KEY     required
///   ZKPASSPORT_ROOT          optional; ZKPassportRootVerifier (default: the deterministic address
///                            0x1D000001000EFD9a6371f4d90bB8920D5431c0D8, same on mainnet, Sepolia, Base;
///                            a local anvil needs MockZkPassportRoot here)
///   ZKPASSPORT_DOMAIN        required; hostname the SDK request is created for (VITE_ZKPASSPORT_DOMAIN)
///   ZKPASSPORT_SCOPE         optional; default "attestat-over18" (VITE_ZKPASSPORT_SCOPE)
///   ZKPASSPORT_DEV_MODE      optional bool; default false; true accepts mock passports (testnets only)
///   ZKPASSPORT_VALIDITY      optional seconds the root verifier accepts a proof after generation; default 7 days
///   DECISION_TTL             optional seconds the decision lives after the proof date; default 30 days
///   POLICY_ID                optional bytes32 (default keccak256("nachweis.pid.over18.v1"))
///   FALLBACK_VERIFIER        optional; the policy's current verifier (NoirPidVerifier); when set a router is deployed
///   REGISTRY_ADDRESS         optional; when set, calls setVerifier(POLICY_ID, router or adapter)
///
/// Removal: setVerifier(POLICY_ID, FALLBACK_VERIFIER) restores the EUDI-only state.
contract DeployZkPassportVerifier is Script {
    address constant ROOT_DEFAULT = 0x1D000001000EFD9a6371f4d90bB8920D5431c0D8;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address rootAddress = vm.envOr("ZKPASSPORT_ROOT", ROOT_DEFAULT);
        string memory domain = vm.envString("ZKPASSPORT_DOMAIN");
        string memory scope = vm.envOr("ZKPASSPORT_SCOPE", string("attestat-over18"));
        bool devMode = vm.envOr("ZKPASSPORT_DEV_MODE", false);
        uint256 validity = vm.envOr("ZKPASSPORT_VALIDITY", uint256(7 days));
        uint64 ttl = uint64(vm.envOr("DECISION_TTL", uint256(30 days)));
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        address fallbackAddress = vm.envOr("FALLBACK_VERIFIER", address(0));
        address registryAddress = vm.envOr("REGISTRY_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);
        ZkPassportVerifier verifier =
            new ZkPassportVerifier(IZKPassportVerifier(rootAddress), policyId, domain, scope, devMode, validity, ttl);
        IProofVerifier registered = verifier;
        address routerAddress;
        if (fallbackAddress != address(0)) {
            EvidenceRouter router = new EvidenceRouter(verifier, IProofVerifier(fallbackAddress), verifier.ROUTE_TAG());
            routerAddress = address(router);
            registered = router;
        }
        if (registryAddress != address(0)) {
            AttestationRegistry(registryAddress).setVerifier(policyId, registered);
        }
        vm.stopBroadcast();

        console.log("ZkPassportVerifier:", address(verifier));
        console.log("EvidenceRouter:    ", routerAddress);
        console.log("Fallback verifier: ", fallbackAddress);
        console.log("Registry:          ", registryAddress);
        console.log("Root verifier:     ", rootAddress);
        console.log("domain:", domain);
        console.log("scope: ", scope);
        console.log("devMode:", devMode);
        console.log("validity seconds:", validity);
        console.log("decision ttl seconds:", uint256(ttl));
        console.log("policyId:");
        console.logBytes32(policyId);
    }
}
