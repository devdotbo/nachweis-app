// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {Subscription} from "../src/Subscription.sol";

/// @notice Deploys registry, fund token and subscription; configures the operator and policy.
///
/// Env vars (see /.env.example):
///   DEPLOYER_PRIVATE_KEY   required; deployer becomes registry owner and token issuer
///   OPERATOR_ADDRESS       optional; issuer key that attests/revokes (default: deployer)
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.pid.over18.v1"))
///   REQUIRED_BITS          optional uint (default: FundToken.DEFAULT_REQUIRED_BITS = 0x3, identity evidence | over 18)
///   DEMO_AMOUNT            optional uint (default: 100e18)
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy --rpc-url sepolia --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        uint256 requiredBits = vm.envOr("REQUIRED_BITS", uint256(0x3)) /* FundToken.DEFAULT_REQUIRED_BITS; literal because forge build cannot resolve the constant through the type in script jobs */;
        uint256 demoAmount = vm.envOr("DEMO_AMOUNT", uint256(100e18));

        vm.startBroadcast(deployerKey);

        AttestationRegistry registry = new AttestationRegistry(deployer);
        registry.setOperator(policyId, operator, true);

        FundToken token = new FundToken("Nachweis Demo Fund", "NDF", registry, policyId, requiredBits, deployer);
        Subscription subscription = new Subscription(token, demoAmount);
        token.setSubscription(address(subscription));

        vm.stopBroadcast();

        console.log("AttestationRegistry:", address(registry));
        console.log("FundToken:          ", address(token));
        console.log("Subscription:       ", address(subscription));
        console.log("Operator:           ", operator);
        console.logBytes32(policyId);
    }
}
