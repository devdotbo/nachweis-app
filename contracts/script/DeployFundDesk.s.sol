// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {FundDesk} from "../src/showcase/FundDesk.sol";
import {MockStable} from "../src/test/MockStable.sol";

/// @notice Deploys the investor-money showcase: FundDesk as the FundToken's issuer, a MockStable as the
///         subscription currency, and (unless reused) an AttestationRegistry with the operator set.
///
/// Env vars (see /.env.example):
///   DEPLOYER_PRIVATE_KEY   required; deployer becomes registry owner (fresh registry) and deploys the desk
///   OPERATOR_ADDRESS       optional; registry operator and desk owner (default: deployer)
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.pid.over18.v1"))
///   REQUIRED_BITS          optional uint (default: FundToken.DEFAULT_REQUIRED_BITS = 0x3, identity evidence | over 18)
///   REGISTRY_ADDRESS       optional; reuse an existing AttestationRegistry (Sepolia, where the registry with
///                          the proof verifier already exists) instead of deploying a fresh one and calling setOperator
///   STABLE_ADDRESS         optional; reuse an existing MockStable instead of deploying a fresh one
///
/// Usage:
///   forge script script/DeployFundDesk.s.sol:DeployFundDesk --rpc-url $RPC --broadcast
contract DeployFundDesk is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address operator = vm.envOr("OPERATOR_ADDRESS", deployer);
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        uint256 requiredBits = vm.envOr("REQUIRED_BITS", uint256(0x3)); /* FundToken.DEFAULT_REQUIRED_BITS; literal because forge build cannot resolve the constant through the type in script jobs */
        address registryAddress = vm.envOr("REGISTRY_ADDRESS", address(0));
        address stableAddress = vm.envOr("STABLE_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);

        AttestationRegistry registry;
        if (registryAddress == address(0)) {
            registry = new AttestationRegistry(deployer);
            registry.setOperator(policyId, operator, true);
        } else {
            registry = AttestationRegistry(registryAddress);
        }

        MockStable stable = stableAddress == address(0) ? new MockStable() : MockStable(stableAddress);

        // The desk starts owned by the deployer because setToken is onlyOwner.
        FundDesk desk = new FundDesk(IERC20(address(stable)), deployer);
        FundToken token = new FundToken("Nachweis Demo Fund", "NDF", registry, policyId, requiredBits, address(desk));
        desk.setToken(token);
        if (operator != deployer) desk.transferOwnership(operator);

        vm.stopBroadcast();

        console.log("AttestationRegistry:", address(registry));
        console.log("MockStable:", address(stable));
        console.log("FundDesk:", address(desk));
        console.log("FundToken:", address(token));
        console.log("Operator:", operator);
        console.logBytes32(policyId);
    }
}
