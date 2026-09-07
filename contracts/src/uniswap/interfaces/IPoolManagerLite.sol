// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice ABI-compatible mirror of Uniswap v4-core PoolKey. `Currency` and `IHooks` are address-sized
///         user types in v4-core, so the ABI encoding of this struct is identical.
struct PoolKeyLite {
    address currency0;
    address currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

/// @notice The one PoolManager function pool creation needs (v4-core IPoolManager.initialize).
interface IPoolManagerLite {
    function initialize(PoolKeyLite memory key, uint160 sqrtPriceX96) external returns (int24 tick);
}
