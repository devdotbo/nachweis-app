// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {console} from "forge-std/Script.sol";
import {UniswapSepolia} from "../src/uniswap/UniswapSepolia.sol";
import {PermissionedPoolScriptBase} from "./PermissionedPoolScriptBase.s.sol";

/// @notice Mints the initial position in the Nachweis permissioned pool through Uniswap's
///         PermissionedPositionManager, following
///         https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/provide-liquidity
///         (fetched 2026-09-07): Permit2 approvals on the underlying tokens, then modifyLiquidities with
///         MINT_POSITION + SETTLE_PAIR. The pool key is the one CreatePermissionedPool initialised.
///
/// Env vars (in addition to PermissionedPoolScriptBase):
///   LP_PRIVATE_KEY      optional; the liquidity provider (default: DEPLOYER_PRIVATE_KEY, i.e. the issuer).
///                       Must be eligible under the policy; when it is not, the deployer key attests it.
///   FUND_AMOUNT         optional; FundToken side in wei (default 1000e18). Minted to the LP by the issuer.
///   STABLE_AMOUNT       optional; stable side in raw units (default 1000e6). Minted to the LP (demo token).
///   TICK_LOWER, TICK_UPPER   optional; default full range for the pool's tick spacing.
///
/// Dry run (nothing is sent; without ADAPTER_ADDRESS the pool is bootstrapped in the same simulation):
///   forge script script/AddLiquidityPermissioned.s.sol:AddLiquidityPermissioned --rpc-url sepolia
contract AddLiquidityPermissioned is PermissionedPoolScriptBase {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 lpKey = vm.envOr("LP_PRIVATE_KEY", deployerKey);
        uint256 fundAmount = vm.envOr("FUND_AMOUNT", uint256(1000e18));
        uint256 stableAmount = vm.envOr("STABLE_AMOUNT", uint256(1000e6));
        address deployer = vm.addr(deployerKey);
        address lp = vm.addr(lpKey);

        (Demo memory d, bool bootstrapped) = _loadOrBootstrap(deployerKey);
        require(d.fundToken.issuer() == deployer, "deployer is not the FundToken issuer");
        (int24 tickLower, int24 tickUpper) = _fullRange(d.key.tickSpacing);
        tickLower = int24(vm.envOr("TICK_LOWER", int256(tickLower)));
        tickUpper = int24(vm.envOr("TICK_UPPER", int256(tickUpper)));

        // The LP must be LIQUIDITY_ALLOWED: the position manager checks the recipient, the hook checks the caller.
        _ensureEligible(d, lp, deployerKey, "LP");

        // Fund the LP: FundToken from the issuer, stable from the demo faucet.
        vm.startBroadcast(deployerKey);
        if (d.fundToken.balanceOf(lp) < fundAmount) d.fundToken.mint(lp, fundAmount - d.fundToken.balanceOf(lp));
        if (d.stable.balanceOf(lp) < stableAmount) d.stable.mint(lp, stableAmount - d.stable.balanceOf(lp));
        vm.stopBroadcast();

        _mintPosition(d, lpKey, fundAmount, stableAmount, tickLower, tickUpper);

        console.log("Adapter held by PoolManager:", d.adapter.balanceOf(UniswapSepolia.POOL_MANAGER));
        console.log("Tick lower:              ", int256(tickLower));
        console.log("Tick upper:              ", int256(tickUpper));
        console.log("FundToken held by adapter:", d.fundToken.balanceOf(address(d.adapter)));
        if (bootstrapped) console.log("Bootstrapped run: every address above is simulation-only.");
    }
}
