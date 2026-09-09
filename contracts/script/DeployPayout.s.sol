// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEligibility} from "../src/interfaces/IEligibility.sol";
import {GatedPayout} from "../src/showcase/GatedPayout.sol";
import {MockStable} from "../src/test/MockStable.sol";

/// @notice Showcase "contractor payout desk": deploys the payout gate against an existing AttestationRegistry,
///         plus the mock stablecoin (mUSD, 6 decimals) unless PAYOUT_TOKEN names one, and mints test funds to the
///         treasury address. Deploy.s.sol is unchanged; run it first for the registry.
///
/// Env vars:
///   DEPLOYER_PRIVATE_KEY   required
///   REGISTRY_ADDRESS       required; the AttestationRegistry
///   TREASURY               required; the company's payout wallet (Privy server wallet on Sepolia, anvil key 3 locally)
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.pid.over18.v1"))
///   REQUIRED_BITS          optional uint (default: 0x3, identity evidence | over 18)
///   PAYOUT_TOKEN           optional address of an existing ERC-20 (default: deploy MockStable)
///   MINT_AMOUNT            optional uint in token units (default: 10_000 mUSD = 10_000e6); only when MockStable is deployed
///
/// Usage:
///   forge script script/DeployPayout.s.sol:DeployPayout --rpc-url sepolia --broadcast
contract DeployPayout is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address registry = vm.envAddress("REGISTRY_ADDRESS");
        address treasury = vm.envAddress("TREASURY");
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        uint256 requiredBits = vm.envOr("REQUIRED_BITS", uint256(0x3));
        address tokenAddr = vm.envOr("PAYOUT_TOKEN", address(0));
        uint256 mintAmount = vm.envOr("MINT_AMOUNT", uint256(10_000e6));

        vm.startBroadcast(deployerKey);
        if (tokenAddr == address(0)) {
            MockStable stable = new MockStable();
            stable.mint(treasury, mintAmount);
            tokenAddr = address(stable);
        }
        GatedPayout gate = new GatedPayout(IEligibility(registry), IERC20(tokenAddr), policyId, requiredBits);
        vm.stopBroadcast();

        console.log("PayoutToken:        ", tokenAddr);
        console.log("GatedPayout:        ", address(gate));
        console.log("Treasury:           ", treasury);
        console.logBytes32(policyId);
    }
}
