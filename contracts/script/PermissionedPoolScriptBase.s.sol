// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {MockStable} from "../src/test/MockStable.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";
import {IPermissionedPositionManagerLite} from "../src/uniswap/interfaces/IPermissionedPositionManagerLite.sol";
import {IPermissionsAdapterLite} from "../src/uniswap/interfaces/IPermissionsAdapterLite.sol";
import {IPermit2Lite} from "../src/uniswap/interfaces/IPermit2Lite.sol";
import {PoolKeyLite} from "../src/uniswap/interfaces/IPoolManagerLite.sol";
import {IStateViewLite} from "../src/uniswap/interfaces/IStateViewLite.sol";
import {LiquidityAmounts} from "../src/uniswap/libraries/LiquidityAmounts.sol";
import {PermissionedPoolActions} from "../src/uniswap/libraries/PermissionedPoolActions.sol";
import {TickMath} from "../src/uniswap/libraries/TickMath.sol";
import {UniswapSepolia} from "../src/uniswap/UniswapSepolia.sol";
import {PermissionedPoolOnboarding} from "./lib/PermissionedPoolOnboarding.sol";

/// @notice Shared plumbing for the liquidity and swap scripts: load the demo pool from env vars or, when no
///         adapter address is given, bootstrap registry, FundToken, stable and pool in the same simulation so
///         a dry run works before anything is broadcast. Also the attestation helper and the position mint.
///
/// Env vars read here (see /.env.example):
///   DEPLOYER_PRIVATE_KEY   required; FundToken issuer, registry operator, adapter owner
///   ADAPTER_ADDRESS        optional; the verified PermissionsAdapter of an existing pool. When unset the
///                          whole stack is deployed and onboarded in the simulation (dry run only)
///   REGISTRY_ADDRESS, FUND_TOKEN_ADDRESS, STABLE_ADDRESS   required with ADAPTER_ADDRESS
///   POLICY_ID, REQUIRED_BITS, POOL_FEE, TICK_SPACING       same defaults as CreatePermissionedPool
abstract contract PermissionedPoolScriptBase is Script {
    struct Demo {
        AttestationRegistry registry;
        FundToken fundToken;
        MockStable stable;
        IPermissionsAdapterLite adapter;
        PoolKeyLite key;
        bytes32 policyId;
        uint256 requiredBits;
    }

    IPermissionedPositionManagerLite internal constant POSM =
        IPermissionedPositionManagerLite(UniswapSepolia.PERMISSIONED_POSITION_MANAGER);
    IPermit2Lite internal constant PERMIT2 = IPermit2Lite(UniswapSepolia.PERMIT2);

    function _policy() internal view returns (bytes32 policyId, uint256 requiredBits) {
        policyId = vm.envOr("POLICY_ID", keccak256("nachweis.demo.fund.v1"));
        requiredBits = vm.envOr("REQUIRED_BITS", uint256(0x7));
    }

    /// @dev Loads an existing pool or bootstraps one under the deployer key. `bootstrapped` tells the caller
    ///      that the pool has no liquidity yet and that every address printed is simulation-only.
    function _loadOrBootstrap(uint256 deployerKey) internal returns (Demo memory d, bool bootstrapped) {
        require(block.chainid == 11155111, "run against Sepolia (chain id 11155111)");
        address deployer = vm.addr(deployerKey);
        (d.policyId, d.requiredBits) = _policy();
        uint24 fee = uint24(vm.envOr("POOL_FEE", uint256(3000)));
        int24 tickSpacing = int24(int256(vm.envOr("TICK_SPACING", uint256(60))));

        address adapterEnv = vm.envOr("ADAPTER_ADDRESS", address(0));
        if (adapterEnv != address(0)) {
            d.registry = AttestationRegistry(vm.envAddress("REGISTRY_ADDRESS"));
            d.fundToken = FundToken(vm.envAddress("FUND_TOKEN_ADDRESS"));
            d.stable = MockStable(vm.envAddress("STABLE_ADDRESS"));
            d.adapter = IPermissionsAdapterLite(adapterEnv);
            require(address(d.adapter.PERMISSIONED_TOKEN()) == address(d.fundToken), "adapter wraps another token");
            require(d.adapter.swappingEnabled(), "adapter: swapping not enabled (onboarding step 6)");
            (address c0, address c1) = address(d.adapter) < address(d.stable)
                ? (address(d.adapter), address(d.stable))
                : (address(d.stable), address(d.adapter));
            d.key = PoolKeyLite({
                currency0: c0,
                currency1: c1,
                fee: fee,
                tickSpacing: tickSpacing,
                hooks: UniswapSepolia.PERMISSIONED_HOOKS
            });
            (uint160 sqrtPriceX96,) = _slot0(d.key);
            require(sqrtPriceX96 != 0, "pool not initialised for this key (check POOL_FEE / TICK_SPACING)");
            console.log("Loaded pool, adapter:    ", address(d.adapter));
            return (d, false);
        }

        console.log("ADAPTER_ADDRESS unset: bootstrapping registry, FundToken, stable and pool in this run.");
        vm.startBroadcast(deployerKey);
        d.registry = new AttestationRegistry(deployer);
        d.registry.setOperator(d.policyId, deployer, true);
        d.fundToken = new FundToken("Nachweis Demo Fund", "NDF", d.registry, d.policyId, d.requiredBits, deployer);
        d.stable = new MockStable();
        PermissionedPoolOnboarding.Pool memory pool = PermissionedPoolOnboarding.onboard(
            d.registry, d.fundToken, IERC20Metadata(address(d.stable)), deployer, d.policyId, d.requiredBits, fee, tickSpacing
        );
        vm.stopBroadcast();
        d.adapter = pool.adapter;
        d.key = pool.key;
        console.log("Bootstrapped adapter:    ", address(d.adapter));
        console.log("Bootstrapped FundToken:  ", address(d.fundToken));
        console.log("Bootstrapped stable:     ", address(d.stable));
        console.log("Bootstrapped registry:   ", address(d.registry));
        return (d, true);
    }

    /// @dev Attests `subject` under the demo policy with the operator key when it is not eligible yet.
    function _ensureEligible(Demo memory d, address subject, uint256 operatorKey, string memory role) internal {
        if (d.registry.isEligible(subject, d.policyId, d.requiredBits)) {
            console.log(string.concat(role, " is eligible:          "), subject);
            return;
        }
        address operator = vm.addr(operatorKey);
        require(d.registry.isOperator(d.policyId, operator), "operator key is not an operator for POLICY_ID");
        vm.startBroadcast(operatorKey);
        d.registry.attestByOperator(
            subject,
            Decision({
                policyId: d.policyId,
                bits: d.requiredBits,
                tier: 1,
                expiry: uint64(block.timestamp + 365 days),
                statusRef: keccak256(abi.encodePacked("nachweis.demo.", role)),
                revoked: false
            })
        );
        vm.stopBroadcast();
        console.log(string.concat(role, " attested:             "), subject);
    }

    function _slot0(PoolKeyLite memory key) internal view returns (uint160 sqrtPriceX96, int24 tick) {
        (sqrtPriceX96, tick,,) = IStateViewLite(UniswapSepolia.STATE_VIEW).getSlot0(PermissionedPoolActions.poolId(key));
    }

    /// @dev `unlockData` for a mint sized from the current pool price with a 0.1 percent haircut so the settled
    ///      amounts stay within the maxima (the provided amounts).
    function _mintUnlockData(
        Demo memory d,
        address lp,
        uint256 fundAmount,
        uint256 stableAmount,
        int24 tickLower,
        int24 tickUpper
    ) internal view returns (bytes memory unlockData, uint128 liquidity) {
        (uint160 sqrtPriceX96,) = _slot0(d.key);
        (uint256 amount0, uint256 amount1) =
            d.key.currency0 == address(d.adapter) ? (fundAmount, stableAmount) : (stableAmount, fundAmount);
        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), amount0, amount1
        );
        liquidity -= liquidity / 1000;
        unlockData = PermissionedPoolActions.mintUnlockData(
            PermissionedPoolActions.MintParams({
                key: d.key,
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidity: liquidity,
                amount0Max: uint128(amount0),
                amount1Max: uint128(amount1),
                recipient: lp,
                hookData: ""
            })
        );
    }

    /// @dev Mints a position for `lpKey` through PermissionedPositionManager: Permit2 approvals on the FundToken
    ///      and the stable (the underlying tokens, never the adapter), then modifyLiquidities(MINT_POSITION,
    ///      SETTLE_PAIR). The LP must already hold `fundAmount` FundToken and `stableAmount` stable and be
    ///      LIQUIDITY_ALLOWED (eligible in the registry).
    function _mintPosition(
        Demo memory d,
        uint256 lpKey,
        uint256 fundAmount,
        uint256 stableAmount,
        int24 tickLower,
        int24 tickUpper
    ) internal returns (uint256 tokenId) {
        (bytes memory unlockData,) = _mintUnlockData(d, vm.addr(lpKey), fundAmount, stableAmount, tickLower, tickUpper);
        uint48 expiry = uint48(block.timestamp + 1 hours);

        vm.startBroadcast(lpKey);
        d.fundToken.approve(UniswapSepolia.PERMIT2, fundAmount);
        d.stable.approve(UniswapSepolia.PERMIT2, stableAmount);
        PERMIT2.approve(address(d.fundToken), address(POSM), uint160(fundAmount), expiry);
        PERMIT2.approve(address(d.stable), address(POSM), uint160(stableAmount), expiry);
        tokenId = POSM.nextTokenId();
        POSM.modifyLiquidities(unlockData, block.timestamp + 1 hours);
        vm.stopBroadcast();

        console.log("Position tokenId:        ", tokenId);
        console.log("Position liquidity:      ", uint256(POSM.getPositionLiquidity(tokenId)));
        console.log("Position owner:          ", POSM.ownerOf(tokenId));
        console.log("modifyLiquidities unlockData:");
        console.logBytes(unlockData);
    }

    function _fullRange(int24 tickSpacing) internal pure returns (int24 lower, int24 upper) {
        lower = TickMath.minUsableTick(tickSpacing);
        upper = TickMath.maxUsableTick(tickSpacing);
    }
}
