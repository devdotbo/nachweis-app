// SPDX-License-Identifier: MIT
// Copied verbatim (apart from this header) from Uniswap/v4-periphery
// src/hooks/permissionedPools/interfaces/IAllowlistChecker.sol
// at commit dce236d4e2057422d0791d9a973a58765eb46f65 (main, 2026-08-20). Identical at the commit the deploy
// guide pins, 3245c3cb99c48fa1dc2459c3b60abc37d4294aba. Not published on npm at the time of copying.
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {PermissionFlag} from "../libraries/PermissionFlags.sol";

interface IAllowlistChecker is IERC165 {
    /// @notice Returns the permission flags for `account` with respect to `tokenAddress`
    /// @param account The account whose allowlist status is being checked
    /// @param tokenAddress The permissioned token the check is being made for
    /// @dev `tokenAddress` lets a single allowlist checker serve multiple assets without an extra round-trip into the adapter
    function checkAllowlist(address account, address tokenAddress) external view returns (PermissionFlag);
}
