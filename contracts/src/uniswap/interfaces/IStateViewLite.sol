// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice ABI subset of Uniswap/v4-periphery src/lens/StateView.sol. `PoolId` is a bytes32 user type.
interface IStateViewLite {
    function getSlot0(bytes32 poolId)
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
    function getLiquidity(bytes32 poolId) external view returns (uint128 liquidity);
    function poolManager() external view returns (address);
}
