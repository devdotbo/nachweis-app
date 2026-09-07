// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {MockStable} from "../src/test/MockStable.sol";
import {IPermissionsAdapterFactory} from "../src/uniswap/interfaces/IPermissionsAdapterFactory.sol";
import {PermissionedPoolActions} from "../src/uniswap/libraries/PermissionedPoolActions.sol";
import {UniswapSepolia} from "../src/uniswap/UniswapSepolia.sol";
import {PermissionedPoolOnboarding} from "./lib/PermissionedPoolOnboarding.sol";

/// @notice Onboards the Nachweis FundToken into a Uniswap v4 permissioned pool on Sepolia, following the seven
///         steps of https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool
///         (fetched 2026-09-07). Steps 1 to 6 are on-chain and run here; step 7 (routing allowlist with Uniswap
///         Labs) is a web form and is only printed. Steps 1 to 6 live in script/lib/PermissionedPoolOnboarding.sol,
///         shared with the fork tests. See /contracts/docs/uniswap-permissioned-pool.md.
///
/// Addresses come from src/uniswap/UniswapSepolia.sol (source and verification notes there).
///
/// Env vars (see /.env.example):
///   DEPLOYER_PRIVATE_KEY   required; the deployer becomes adapter owner, and registry owner / operator /
///                          token issuer when fresh contracts are deployed
///   REGISTRY_ADDRESS       optional; existing AttestationRegistry (deployer must be operator for POLICY_ID)
///   FUND_TOKEN_ADDRESS     optional; existing FundToken (deployer must be its issuer); requires REGISTRY_ADDRESS
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.pid.over18.v1"))
///   REQUIRED_BITS          optional uint (default: FundToken.DEFAULT_REQUIRED_BITS = 0x3, identity evidence | over 18)
///   POOL_FEE               optional uint24 (default: 3000)
///   TICK_SPACING           optional int24 (default: 60)
///
/// Dry run (simulates every call against a Sepolia fork, sends nothing):
///   forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url sepolia
/// Broadcast (not done in this repository; add --broadcast when a human decides to):
///   forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url sepolia --broadcast
contract CreatePermissionedPool is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.pid.over18.v1"));
        uint256 requiredBits = vm.envOr("REQUIRED_BITS", uint256(0x3)) /* FundToken.DEFAULT_REQUIRED_BITS; literal because forge build cannot resolve the constant through the type in script jobs */;
        uint24 fee = uint24(vm.envOr("POOL_FEE", uint256(3000)));
        int24 tickSpacing = int24(int256(vm.envOr("TICK_SPACING", uint256(60))));

        require(block.chainid == 11155111, "run against Sepolia (chain id 11155111)");
        IPermissionsAdapterFactory factory = IPermissionsAdapterFactory(UniswapSepolia.PERMISSIONS_ADAPTER_FACTORY);
        require(factory.POOL_MANAGER() == UniswapSepolia.POOL_MANAGER, "factory POOL_MANAGER mismatch");
        require(UniswapSepolia.PERMISSIONED_HOOKS.code.length != 0, "PermissionedHooks has no code");

        vm.startBroadcast(deployerKey);

        // Step 0: the Nachweis side. Reuse deployed contracts when given, else deploy the demo set.
        AttestationRegistry registry;
        FundToken fundToken;
        address registryEnv = vm.envOr("REGISTRY_ADDRESS", address(0));
        if (registryEnv == address(0)) {
            registry = new AttestationRegistry(deployer);
            registry.setOperator(policyId, deployer, true);
            fundToken = new FundToken("Nachweis Demo Fund", "NDF", registry, policyId, requiredBits, deployer);
        } else {
            registry = AttestationRegistry(registryEnv);
            fundToken = FundToken(vm.envAddress("FUND_TOKEN_ADDRESS"));
            require(fundToken.issuer() == deployer, "deployer is not the FundToken issuer");
            require(registry.isOperator(policyId, deployer), "deployer is not an operator for POLICY_ID");
        }
        MockStable stable = new MockStable();

        // Steps 1 to 6: checker, adapter, venue attestation and 1 wei deposit, verification, wrapper and hook
        // approvals, PoolManager.initialize at one FundToken per stable, swapping enabled.
        PermissionedPoolOnboarding.Pool memory pool = PermissionedPoolOnboarding.onboard(
            registry, fundToken, IERC20Metadata(address(stable)), deployer, policyId, requiredBits, fee, tickSpacing
        );

        vm.stopBroadcast();

        console.log("AttestationRegistry:     ", address(registry));
        console.log("FundToken:               ", address(fundToken));
        console.log("MockStable:              ", address(stable));
        console.log("EudiAllowlistChecker:    ", address(pool.checker));
        console.log("PermissionsAdapter:      ", address(pool.adapter));
        console.log("Pool currency0:          ", pool.key.currency0);
        console.log("Pool currency1:          ", pool.key.currency1);
        console.log("Pool fee / tickSpacing:  ", fee, uint256(int256(tickSpacing)));
        console.log("Pool hooks:              ", UniswapSepolia.PERMISSIONED_HOOKS);
        console.log("Initial sqrtPriceX96:    ", uint256(pool.sqrtPriceX96));
        console.log("Initial tick:            ", int256(pool.tick));
        console.log("PoolId:");
        console.logBytes32(PermissionedPoolActions.poolId(pool.key));
        console.log("PolicyId:");
        console.logBytes32(policyId);
        console.log("Step 7 (off-chain, human): request routing allowlist at");
        console.log("  https://developers.uniswap.org/permissioned-pools-allowlist");
        console.log("  permissioned token = FundToken, verified adapter = PermissionsAdapter,");
        console.log("  kycUrl = the Nachweis issuer onboarding page (wallet presents its EUDI PID there).");
    }
}
