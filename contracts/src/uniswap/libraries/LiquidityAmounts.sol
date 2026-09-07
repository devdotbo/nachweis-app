// SPDX-License-Identifier: MIT
// Subset of Uniswap/v4-core test/utils/LiquidityAmounts.sol as vendored under lib/v4-core of v4-periphery main
// (dce236d4e2057422d0791d9a973a58765eb46f65): the three liquidity-for-amounts functions. FullMath.mulDiv is
// replaced by OpenZeppelin Math.mulDiv (same semantics, floor division).
pragma solidity ^0.8.0;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Liquidity amount functions
/// @notice Computes the liquidity a position receives for given token amounts and a price range.
library LiquidityAmounts {
    uint256 internal constant Q96 = 0x1000000000000000000000000;

    function toUint128(uint256 x) private pure returns (uint128 y) {
        require((y = uint128(x)) == x, "liquidity overflow");
    }

    /// @dev amount0 * (sqrt(upper) * sqrt(lower)) / (sqrt(upper) - sqrt(lower))
    function getLiquidityForAmount0(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, uint256 amount0)
        internal
        pure
        returns (uint128 liquidity)
    {
        if (sqrtPriceAX96 > sqrtPriceBX96) (sqrtPriceAX96, sqrtPriceBX96) = (sqrtPriceBX96, sqrtPriceAX96);
        uint256 intermediate = Math.mulDiv(sqrtPriceAX96, sqrtPriceBX96, Q96);
        return toUint128(Math.mulDiv(amount0, intermediate, sqrtPriceBX96 - sqrtPriceAX96));
    }

    /// @dev amount1 / (sqrt(upper) - sqrt(lower))
    function getLiquidityForAmount1(uint160 sqrtPriceAX96, uint160 sqrtPriceBX96, uint256 amount1)
        internal
        pure
        returns (uint128 liquidity)
    {
        if (sqrtPriceAX96 > sqrtPriceBX96) (sqrtPriceAX96, sqrtPriceBX96) = (sqrtPriceBX96, sqrtPriceAX96);
        return toUint128(Math.mulDiv(amount1, Q96, sqrtPriceBX96 - sqrtPriceAX96));
    }

    /// @notice The maximum liquidity received for amount0 and amount1 at the current price and the range bounds.
    function getLiquidityForAmounts(
        uint160 sqrtPriceX96,
        uint160 sqrtPriceAX96,
        uint160 sqrtPriceBX96,
        uint256 amount0,
        uint256 amount1
    ) internal pure returns (uint128 liquidity) {
        if (sqrtPriceAX96 > sqrtPriceBX96) (sqrtPriceAX96, sqrtPriceBX96) = (sqrtPriceBX96, sqrtPriceAX96);
        if (sqrtPriceX96 <= sqrtPriceAX96) {
            liquidity = getLiquidityForAmount0(sqrtPriceAX96, sqrtPriceBX96, amount0);
        } else if (sqrtPriceX96 < sqrtPriceBX96) {
            uint128 liquidity0 = getLiquidityForAmount0(sqrtPriceX96, sqrtPriceBX96, amount0);
            uint128 liquidity1 = getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceX96, amount1);
            liquidity = liquidity0 < liquidity1 ? liquidity0 : liquidity1;
        } else {
            liquidity = getLiquidityForAmount1(sqrtPriceAX96, sqrtPriceBX96, amount1);
        }
    }
}
