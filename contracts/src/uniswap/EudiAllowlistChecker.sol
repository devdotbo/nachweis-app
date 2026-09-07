// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC165, IERC165} from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import {IEligibility} from "../interfaces/IEligibility.sol";
import {IAllowlistChecker} from "./interfaces/IAllowlistChecker.sol";
import {PermissionFlag, PermissionFlags} from "./libraries/PermissionFlags.sol";

/// @title EudiAllowlistChecker
/// @notice Uniswap v4 permissioned-pool allowlist checker backed by the Nachweis AttestationRegistry.
///         The PermissionsAdapter created by Uniswap's PermissionsAdapterFactory calls
///         checkAllowlist(account, permissionedToken) before a swap (SWAP_ALLOWED) or a liquidity
///         mint (LIQUIDITY_ALLOWED). This contract answers from one on-chain fact only:
///         registry.isEligible(account, policyId, requiredBits), i.e. the account holds a live,
///         unrevoked, unexpired decision whose predicate bits cover requiredBits.
///
///         No personal data is stored or read here. The registry holds predicate bits, a tier, an
///         expiry and an opaque status reference per (address, policyId); nothing names a person.
///         The checker is immutable and view-only: no owner, no setters, no allowlist of its own.
///         To change the policy, deploy a new checker and let the adapter owner call
///         updateAllowListChecker on the adapter.
///
///         Verified against Uniswap/v4-periphery commit dce236d4e2057422d0791d9a973a58765eb46f65
///         (src/hooks/permissionedPools). The adapter requires ERC-165 support for
///         type(IAllowlistChecker).interfaceId; the constructor of PermissionsAdapter reverts with
///         InvalidAllowListChecker otherwise.
contract EudiAllowlistChecker is IAllowlistChecker, ERC165 {
    error RegistryZero();
    error PolicyIdZero();

    /// @notice The Nachweis AttestationRegistry (read interface).
    IEligibility public immutable registry;

    /// @notice Issuer policy the pool enforces (e.g. keccak256 of the policy document hash).
    bytes32 public immutable policyId;

    /// @notice Predicate bits an account must hold under policyId (demo: adult | EU resident | not sanctioned).
    uint256 public immutable requiredBits;

    /// @notice Flags granted to an eligible account. Swapping and providing liquidity, explicitly;
    ///         not ALL_ALLOWED, so flags Uniswap may add later are not granted by accident.
    PermissionFlag public constant ELIGIBLE_FLAGS =
        PermissionFlag.wrap(
            PermissionFlag.unwrap(PermissionFlags.SWAP_ALLOWED) | PermissionFlag.unwrap(PermissionFlags.LIQUIDITY_ALLOWED)
        );

    constructor(IEligibility registry_, bytes32 policyId_, uint256 requiredBits_) {
        if (address(registry_) == address(0)) revert RegistryZero();
        if (policyId_ == bytes32(0)) revert PolicyIdZero();
        registry = registry_;
        policyId = policyId_;
        requiredBits = requiredBits_;
    }

    /// @inheritdoc IAllowlistChecker
    /// @dev `tokenAddress` is not used: this checker enforces one policy regardless of which
    ///      permissioned token the adapter wraps. Deploy one checker per policy.
    function checkAllowlist(address account, address tokenAddress) external view returns (PermissionFlag) {
        tokenAddress;
        return registry.isEligible(account, policyId, requiredBits) ? ELIGIBLE_FLAGS : PermissionFlags.NONE;
    }

    /// @notice ERC-165: the adapter checks this before accepting the checker.
    function supportsInterface(bytes4 interfaceId) public view override(ERC165, IERC165) returns (bool) {
        return interfaceId == type(IAllowlistChecker).interfaceId || super.supportsInterface(interfaceId);
    }
}
