// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {console} from "forge-std/Script.sol";
import {IUniversalRouterLite} from "../src/uniswap/interfaces/IUniversalRouterLite.sol";
import {PermissionFlags} from "../src/uniswap/libraries/PermissionFlags.sol";
import {PermissionedPoolActions} from "../src/uniswap/libraries/PermissionedPoolActions.sol";
import {UniswapSepolia} from "../src/uniswap/UniswapSepolia.sol";
import {PermissionedPoolScriptBase} from "./PermissionedPoolScriptBase.s.sol";

/// @notice An investor swaps the demo stable for FundToken through the permissioned Universal Router:
///         exact-input single hop (V4_SWAP: SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL) with Permit2 allowance
///         approvals for the input. The hook checks the investor against the Nachweis registry via the adapter
///         before the swap; the adapter unwraps the output into FundToken, whose own transfer gate checks the
///         investor again.
///
/// Env vars (in addition to PermissionedPoolScriptBase):
///   INVESTOR_PRIVATE_KEY   required; the swapper. When not eligible and ATTEST_INVESTOR is true (default),
///                          the deployer key attests it first.
///   ATTEST_INVESTOR        optional bool (default true)
///   REVOKE_INVESTOR        optional bool (default false): the deployer key revokes the investor right before
///                          the swap, so the run shows the revert (video beat "revoke, then the swap fails")
///   SWAP_AMOUNT_IN         optional; stable in, raw units (default 100e6). Minted to the investor (demo token)
///   SWAP_MIN_OUT           optional; minimum FundToken out in wei (default 0, dry-run only)
///   FUND_LIQUIDITY, STABLE_LIQUIDITY   optional; only used when the pool is bootstrapped in this run
///                          (defaults 1000e18 / 1000e6, minted by the deployer as LP)
///
/// Dry run (nothing is sent):
///   INVESTOR_PRIVATE_KEY=<key> forge script script/SwapPermissioned.s.sol:SwapPermissioned --rpc-url sepolia
contract SwapPermissioned is PermissionedPoolScriptBase {
    IUniversalRouterLite internal constant ROUTER = IUniversalRouterLite(UniswapSepolia.UNIVERSAL_ROUTER);

    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 investorKey = vm.envUint("INVESTOR_PRIVATE_KEY");
        uint128 amountIn = uint128(vm.envOr("SWAP_AMOUNT_IN", uint256(100e6)));
        uint128 minOut = uint128(vm.envOr("SWAP_MIN_OUT", uint256(0)));
        address investor = vm.addr(investorKey);

        (Demo memory d, bool bootstrapped) = _loadOrBootstrap(deployerKey);
        if (bootstrapped) {
            // A fresh pool has no liquidity; the deployer provides it so the swap has something to trade against.
            uint256 fundLiquidity = vm.envOr("FUND_LIQUIDITY", uint256(1000e18));
            uint256 stableLiquidity = vm.envOr("STABLE_LIQUIDITY", uint256(1000e6));
            address deployer = vm.addr(deployerKey);
            _ensureEligible(d, deployer, deployerKey, "LP");
            vm.startBroadcast(deployerKey);
            d.fundToken.mint(deployer, fundLiquidity);
            d.stable.mint(deployer, stableLiquidity);
            vm.stopBroadcast();
            (int24 lower, int24 upper) = _fullRange(d.key.tickSpacing);
            _mintPosition(d, deployerKey, fundLiquidity, stableLiquidity, lower, upper);
        }

        if (vm.envOr("ATTEST_INVESTOR", true)) _ensureEligible(d, investor, deployerKey, "investor");
        if (vm.envOr("REVOKE_INVESTOR", false)) {
            vm.startBroadcast(deployerKey);
            d.registry.revoke(investor, d.policyId);
            vm.stopBroadcast();
            console.log("Investor revoked; the swap below is expected to revert in PermissionedHooks.beforeSwap.");
        }
        console.log("adapter.isAllowed(investor, SWAP_ALLOWED):", d.adapter.isAllowed(investor, PermissionFlags.SWAP_ALLOWED));

        bool zeroForOne = d.key.currency0 == address(d.stable);
        (bytes memory commands, bytes[] memory inputs) =
            PermissionedPoolActions.swapExactInSingle(d.key, zeroForOne, amountIn, minOut, "");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 stableBefore = d.stable.balanceOf(investor);
        uint256 fundBefore = d.fundToken.balanceOf(investor);

        vm.startBroadcast(investorKey);
        if (stableBefore < amountIn) {
            d.stable.mint(investor, amountIn - stableBefore);
            stableBefore = amountIn;
        }
        // Permit2 allowance path: token -> Permit2 once, then Permit2 -> router for this amount.
        d.stable.approve(UniswapSepolia.PERMIT2, amountIn);
        PERMIT2.approve(address(d.stable), address(ROUTER), amountIn, uint48(deadline));
        ROUTER.execute(commands, inputs, deadline);
        vm.stopBroadcast();

        console.log("Investor:                ", investor);
        console.log("Stable in:               ", stableBefore - d.stable.balanceOf(investor));
        console.log("FundToken out:           ", d.fundToken.balanceOf(investor) - fundBefore);
        (, int24 tick) = _slot0(d.key);
        console.log("Pool tick after swap:    ", int256(tick));
        console.log("UniversalRouter.execute calldata (commands, inputs[0], deadline):");
        console.logBytes(commands);
        console.logBytes(inputs[0]);
        console.log(deadline);
        if (bootstrapped) console.log("Bootstrapped run: every address above is simulation-only.");
    }
}
