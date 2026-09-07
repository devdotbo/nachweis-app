// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice ABI subset of Uniswap/permit2 IAllowanceTransfer: the allowance-based path the position manager and
///         the Universal Router use to pull tokens (`permit2.transferFrom(owner, to, amount, token)`).
interface IPermit2Lite {
    function approve(address token, address spender, uint160 amount, uint48 expiration) external;
    function allowance(address user, address token, address spender)
        external
        view
        returns (uint160 amount, uint48 expiration, uint48 nonce);
}
