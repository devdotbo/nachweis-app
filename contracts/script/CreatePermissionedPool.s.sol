// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {MockStable} from "../src/test/MockStable.sol";
import {Decision, IEligibility} from "../src/interfaces/IEligibility.sol";
import {EudiAllowlistChecker} from "../src/uniswap/EudiAllowlistChecker.sol";
import {IPermissionsAdapterFactory} from "../src/uniswap/interfaces/IPermissionsAdapterFactory.sol";
import {IPermissionsAdapterLite} from "../src/uniswap/interfaces/IPermissionsAdapterLite.sol";
import {IPoolManagerLite, PoolKeyLite} from "../src/uniswap/interfaces/IPoolManagerLite.sol";
import {UniswapSepolia} from "../src/uniswap/UniswapSepolia.sol";

/// @notice Onboards the Nachweis FundToken into a Uniswap v4 permissioned pool on Sepolia, following the seven
///         steps of https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool
///         (fetched 2026-09-07). Steps 1 to 6 are on-chain and run here; step 7 (routing allowlist with Uniswap
///         Labs) is a web form and is only printed. See /contracts/docs/uniswap-permissioned-pool.md.
///
/// Addresses come from src/uniswap/UniswapSepolia.sol (source and verification notes there).
///
/// Env vars (see /.env.example):
///   DEPLOYER_PRIVATE_KEY   required; the deployer becomes adapter owner, and registry owner / operator /
///                          token issuer when fresh contracts are deployed
///   REGISTRY_ADDRESS       optional; existing AttestationRegistry (deployer must be operator for POLICY_ID)
///   FUND_TOKEN_ADDRESS     optional; existing FundToken (deployer must be its issuer); requires REGISTRY_ADDRESS
///   POLICY_ID              optional bytes32 (default: keccak256("nachweis.demo.fund.v1"))
///   REQUIRED_BITS          optional uint (default: 0x7)
///   POOL_FEE               optional uint24 (default: 3000)
///   TICK_SPACING           optional int24 (default: 60)
///
/// Dry run (simulates every call against a Sepolia fork, sends nothing):
///   forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url sepolia
/// Broadcast (not done in this repository; add --broadcast when a human decides to):
///   forge script script/CreatePermissionedPool.s.sol:CreatePermissionedPool --rpc-url sepolia --broadcast
contract CreatePermissionedPool is Script {
    /// @dev sqrt(1) * 2^96: a 1:1 starting price. Both sides are demo tokens; the price is not meaningful.
    uint160 constant SQRT_PRICE_1_1 = 79228162514264337593543950336;

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        bytes32 policyId = vm.envOr("POLICY_ID", keccak256("nachweis.demo.fund.v1"));
        uint256 requiredBits = vm.envOr("REQUIRED_BITS", uint256(0x7));
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

        // Step 1: the allowlist checker. Immutable, view-only, reads the registry.
        EudiAllowlistChecker checker = new EudiAllowlistChecker(IEligibility(address(registry)), policyId, requiredBits);

        // Step 2: create the Permissions Adapter (virtual token) through Uniswap's factory.
        IPermissionsAdapterLite adapter =
            IPermissionsAdapterLite(factory.createPermissionsAdapter(IERC20(address(fundToken)), deployer, checker));

        // Step 3: allowlist and fund the adapter. The FundToken gate is the registry itself, so the adapter
        // address gets a decision under the policy (a venue approval, not a person). Then seed 1 wei.
        registry.attestByOperator(
            address(adapter),
            Decision({
                policyId: policyId,
                bits: requiredBits,
                tier: 0,
                expiry: type(uint64).max,
                statusRef: keccak256("nachweis.venue.uniswap-permissions-adapter"),
                revoked: false
            })
        );
        fundToken.mint(deployer, 1);
        fundToken.approve(address(adapter), 1);
        adapter.depositForVerification(1);

        // Step 4: verify the adapter with the factory.
        factory.verifyPermissionsAdapter(address(adapter));

        // Step 5: approve the four wrappers and the permissioned hook.
        adapter.updateAllowedWrapper(UniswapSepolia.PERMISSIONED_POSITION_MANAGER, true);
        adapter.updateAllowedWrapper(UniswapSepolia.UNIVERSAL_ROUTER, true);
        adapter.updateAllowedWrapper(UniswapSepolia.V4_QUOTER, true);
        adapter.updateAllowedWrapper(UniswapSepolia.MIXED_ROUTE_QUOTER_V2, true);
        adapter.updateAllowedHook(UniswapSepolia.PERMISSIONED_HOOKS, true);

        // Step 6: create the pool (adapter as currency, currencies sorted ascending) and enable swapping.
        (address c0, address c1) = address(adapter) < address(stable)
            ? (address(adapter), address(stable))
            : (address(stable), address(adapter));
        PoolKeyLite memory key = PoolKeyLite({
            currency0: c0, currency1: c1, fee: fee, tickSpacing: tickSpacing, hooks: UniswapSepolia.PERMISSIONED_HOOKS
        });
        int24 tick = IPoolManagerLite(UniswapSepolia.POOL_MANAGER).initialize(key, SQRT_PRICE_1_1);
        adapter.updateSwappingEnabled(true);

        vm.stopBroadcast();

        console.log("AttestationRegistry:     ", address(registry));
        console.log("FundToken:               ", address(fundToken));
        console.log("MockStable:              ", address(stable));
        console.log("EudiAllowlistChecker:    ", address(checker));
        console.log("PermissionsAdapter:      ", address(adapter));
        console.log("Pool currency0:          ", c0);
        console.log("Pool currency1:          ", c1);
        console.log("Pool fee / tickSpacing:  ", fee, uint256(int256(tickSpacing)));
        console.log("Pool hooks:              ", UniswapSepolia.PERMISSIONED_HOOKS);
        console.log("Initial tick:            ", int256(tick));
        console.logBytes32(policyId);
        console.log("Step 7 (off-chain, human): request routing allowlist at");
        console.log("  https://developers.uniswap.org/permissioned-pools-allowlist");
        console.log("  permissioned token = FundToken, verified adapter = PermissionsAdapter,");
        console.log("  kycUrl = the Nachweis issuer onboarding page (wallet presents its EUDI PID there).");
    }
}
