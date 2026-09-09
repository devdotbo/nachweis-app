// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {FundToken} from "../src/FundToken.sol";
import {Subscription} from "../src/Subscription.sol";
import {IEligibility} from "../src/interfaces/IEligibility.sol";

/// @notice A second issuer's instrument on the same registry and policy id (showcase savings plan,
///         docs/showcase/savings-plan.md). Deploys FundToken B and its Subscription B; no new contract,
///         no registry change. Issuer B is whoever holds ISSUER_B_PRIVATE_KEY (default: DEPLOYER_PRIVATE_KEY).
///         FundToken B's transfer check reads the same `isEligible(to, policyId, requiredBits)` as
///         FundToken A, so the investor's one decision opens or closes both instruments together.
///
/// Env vars:
///   ISSUER_B_PRIVATE_KEY   optional; deployer and issuer of FundToken B (default: DEPLOYER_PRIVATE_KEY)
///   DEPLOYER_PRIVATE_KEY   required when ISSUER_B_PRIVATE_KEY is unset
///   REGISTRY_ADDRESS       required; the existing AttestationRegistry
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.pid.over18.v1"))
///   REQUIRED_BITS          optional uint (default: 0x3 = FundToken.DEFAULT_REQUIRED_BITS)
///   DEMO_AMOUNT_B          optional uint (default: 50e18)
///
/// Usage:
///   REGISTRY_ADDRESS=0x... forge script script/DeploySecondIssuer.s.sol:DeploySecondIssuer --rpc-url <rpc> --broadcast
contract DeploySecondIssuer is Script {
    function run() external {
        uint256 issuerKey = vm.envOr("ISSUER_B_PRIVATE_KEY", uint256(0));
        if (issuerKey == 0) issuerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address issuerB = vm.addr(issuerKey);
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        uint256 requiredBits = vm.envOr("REQUIRED_BITS", uint256(0x3)) /* FundToken.DEFAULT_REQUIRED_BITS; literal because forge build cannot resolve the constant through the type in script jobs */;
        uint256 demoAmount = vm.envOr("DEMO_AMOUNT_B", uint256(50e18));
        require(registry != address(0), "REGISTRY_ADDRESS is zero");

        vm.startBroadcast(issuerKey);

        FundToken token = new FundToken("Attestat Demo Fund B", "NDF-B", IEligibility(registry), policyId, requiredBits, issuerB);
        Subscription subscription = new Subscription(token, demoAmount);
        token.setSubscription(address(subscription));

        vm.stopBroadcast();

        console.log("FundTokenB:         ", address(token));
        console.log("SubscriptionB:      ", address(subscription));
        console.log("IssuerB:            ", issuerB);
        console.log("Registry (shared):  ", registry);
        console.logBytes32(policyId);
    }
}
