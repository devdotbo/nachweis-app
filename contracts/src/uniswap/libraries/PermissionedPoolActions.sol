// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import {PoolKeyLite} from "../interfaces/IPoolManagerLite.sol";

/// @notice Calldata encoders for the two permissioned-pool operations the Nachweis demo performs: a liquidity
///         mint through PermissionedPositionManager and an exact-input single-hop swap through the permissioned
///         Universal Router. The byte layout is the one v4-periphery (main, dce236d) and universal-router (main)
///         decode; the constants are copied from v4-periphery src/libraries/Actions.sol and universal-router
///         contracts/libraries/Commands.sol. A front end reproduces the same bytes with viem, see
///         /contracts/docs/uniswap-permissioned-pool.md, section "Swap from the app".
library PermissionedPoolActions {
    // v4-periphery Actions
    uint8 internal constant MINT_POSITION = 0x02;
    uint8 internal constant SWAP_EXACT_IN_SINGLE = 0x06;
    uint8 internal constant SETTLE_ALL = 0x0c;
    uint8 internal constant SETTLE_PAIR = 0x0d;
    uint8 internal constant TAKE_ALL = 0x0f;

    // universal-router Commands
    bytes1 internal constant COMMAND_V4_SWAP = 0x10;

    /// @dev Mirror of v4-periphery IV4Router.ExactInputSingleParams at main (dce236d). The field
    ///      `minHopPriceX36` is not present in older releases; 0 disables the per-hop price check.
    struct ExactInputSingleParams {
        PoolKeyLite poolKey;
        bool zeroForOne;
        uint128 amountIn;
        uint128 amountOutMinimum;
        uint256 minHopPriceX36;
        bytes hookData;
    }

    /// @notice `unlockData` for PositionManager.modifyLiquidities: MINT_POSITION then SETTLE_PAIR, the sequence
    ///         the provide-liquidity guide prescribes. The position manager pulls both currencies from the caller
    ///         through Permit2; for the adapter currency it pulls the underlying FundToken and wraps it.
    function mintUnlockData(
        PoolKeyLite memory key,
        int24 tickLower,
        int24 tickUpper,
        uint256 liquidity,
        uint128 amount0Max,
        uint128 amount1Max,
        address recipient,
        bytes memory hookData
    ) internal pure returns (bytes memory unlockData) {
        bytes memory actions = abi.encodePacked(MINT_POSITION, SETTLE_PAIR);
        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(key, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData);
        params[1] = abi.encode(key.currency0, key.currency1);
        unlockData = abi.encode(actions, params);
    }

    /// @notice `commands` and `inputs` for UniversalRouter.execute: one V4_SWAP command whose input is
    ///         SWAP_EXACT_IN_SINGLE, SETTLE_ALL (input currency, max amountIn), TAKE_ALL (output currency,
    ///         min amountOut, to msg.sender). The router pulls the input through Permit2 and, when the output is
    ///         the adapter currency, the adapter unwraps it into the FundToken on the way to the swapper.
    function swapExactInSingle(
        PoolKeyLite memory key,
        bool zeroForOne,
        uint128 amountIn,
        uint128 amountOutMinimum,
        bytes memory hookData
    ) internal pure returns (bytes memory commands, bytes[] memory inputs) {
        (address input, address output) =
            zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        bytes memory actions = abi.encodePacked(SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL);
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            ExactInputSingleParams({
                poolKey: key,
                zeroForOne: zeroForOne,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                minHopPriceX36: 0,
                hookData: hookData
            })
        );
        params[1] = abi.encode(input, uint256(amountIn));
        params[2] = abi.encode(output, uint256(amountOutMinimum));
        commands = abi.encodePacked(COMMAND_V4_SWAP);
        inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
    }

    /// @notice v4-core PoolId: keccak256 of the ABI-encoded key.
    function poolId(PoolKeyLite memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key));
    }
}
