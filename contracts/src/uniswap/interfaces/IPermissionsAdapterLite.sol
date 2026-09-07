// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAllowlistChecker} from "./IAllowlistChecker.sol";
import {PermissionFlag} from "../libraries/PermissionFlags.sol";

/// @notice Subset of Uniswap/v4-periphery src/hooks/permissionedPools/interfaces/IPermissionsAdapter.sol
///         at commit dce236d4e2057422d0791d9a973a58765eb46f65, hand-copied so this repo does not need
///         v4-core as a dependency. Differences: `IHooks` parameters are typed `address` (same ABI),
///         and only the members the onboarding steps and tests use are declared.
interface IPermissionsAdapterLite is IERC20 {
    event AllowListCheckerUpdated(IAllowlistChecker indexed newAllowListChecker);
    event AllowedWrapperUpdated(address indexed wrapper, bool allowed);
    event AllowedHookUpdated(address indexed hook, bool allowed);
    event SwappingEnabledUpdated(bool enabled);
    event VerificationDeposit(address indexed depositor, uint256 amount);

    error InvalidAllowListChecker(IAllowlistChecker newAllowListChecker);

    function depositForVerification(uint256 amount) external;
    function updateAllowListChecker(IAllowlistChecker newAllowListChecker) external;
    function updateAllowedWrapper(address wrapper, bool allowed) external;
    function updateAllowedHook(address hook, bool allowed) external;
    function updateSwappingEnabled(bool enabled) external;

    function isAllowed(address account, PermissionFlag permission) external view returns (bool);
    function allowListChecker() external view returns (IAllowlistChecker);
    function allowedWrappers(address wrapper) external view returns (bool);
    function allowedHooks(address hook) external view returns (bool);
    function swappingEnabled() external view returns (bool);
    function POOL_MANAGER() external view returns (address);
    function PERMISSIONED_TOKEN() external view returns (IERC20);
    function owner() external view returns (address);
}
