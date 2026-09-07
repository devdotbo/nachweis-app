// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @notice ABI subset of Uniswap/v4-periphery src/hooks/permissionedPools/PermissionedPositionManager.sol and the
///         PositionManager it extends (main, dce236d4e2057422d0791d9a973a58765eb46f65), hand-written so this
///         repo does not depend on v4-core. Errors listed are the ones a mint can surface.
interface IPermissionedPositionManagerLite {
    /// @dev PositionManager: recipient or caller not LIQUIDITY_ALLOWED (from IERC721Permit_v4).
    error Unauthorized();
    /// @dev Pool hook not allow-listed on the adapter (adapter owner step 5).
    error InvalidHook();
    /// @dev Neither pool currency is a verified adapter.
    error NoVerifiedAdapter();
    /// @dev Position NFTs of permissioned pools cannot be transferred.
    error TransferDisabled();
    error DeadlinePassed(uint256 deadline);
    error MaximumAmountExceeded(uint128 maximumAmount, uint128 amountRequested);

    function modifyLiquidities(bytes calldata unlockData, uint256 deadline) external payable;
    function multicall(bytes[] calldata data) external payable returns (bytes[] memory results);
    function nextTokenId() external view returns (uint256);
    function getPositionLiquidity(uint256 tokenId) external view returns (uint128 liquidity);
    function ownerOf(uint256 tokenId) external view returns (address);
    function permit2() external view returns (address);
    function poolManager() external view returns (address);
    function PERMISSIONS_ADAPTER_FACTORY() external view returns (address);
}
