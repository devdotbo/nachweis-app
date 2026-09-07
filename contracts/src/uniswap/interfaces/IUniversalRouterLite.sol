// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice ABI subset of Uniswap/universal-router contracts/UniversalRouter.sol (main) in its permissioned-pools
///         build, whose V4SwapRouter inherits v4-periphery PermissionedV4Router. Errors listed are the ones the
///         router itself raises on a permissioned swap; errors raised inside PoolManager or the hook surface as
///         v4-core CustomRevert.WrappedError instead.
interface IUniversalRouterLite {
    error ExecutionFailed(uint256 commandIndex, bytes message);
    error TransactionDeadlinePassed();
    /// @dev PermissionedV4Router: swapper not SWAP_ALLOWED on a verified adapter currency.
    error Unauthorized();
    /// @dev PermissionedV4Router: adapter.swappingEnabled() is false.
    error SwappingDisabled();
    /// @dev PermissionedV4Router: pool hook not allow-listed on the adapter.
    error HookNotAllowed();

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
    function execute(bytes calldata commands, bytes[] calldata inputs) external payable;
    function poolManager() external view returns (address);
    function PERMISSIONS_ADAPTER_FACTORY() external view returns (address);
}
