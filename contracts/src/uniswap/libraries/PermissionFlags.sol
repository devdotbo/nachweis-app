// SPDX-License-Identifier: MIT
// Copied verbatim (apart from this header) from Uniswap/v4-periphery
// src/hooks/permissionedPools/libraries/PermissionFlags.sol
// at commit dce236d4e2057422d0791d9a973a58765eb46f65 (main, 2026-08-20). Identical at the commit the deploy
// guide pins, 3245c3cb99c48fa1dc2459c3b60abc37d4294aba.
pragma solidity ^0.8.0;

type PermissionFlag is bytes2;

using {or as |} for PermissionFlag global;
using {and as &} for PermissionFlag global;
using {eq as ==} for PermissionFlag global;

function or(PermissionFlag a, PermissionFlag b) pure returns (PermissionFlag) {
    return PermissionFlag.wrap(PermissionFlag.unwrap(a) | PermissionFlag.unwrap(b));
}

function and(PermissionFlag a, PermissionFlag b) pure returns (PermissionFlag) {
    return PermissionFlag.wrap(PermissionFlag.unwrap(a) & PermissionFlag.unwrap(b));
}

function eq(PermissionFlag a, PermissionFlag b) pure returns (bool) {
    return PermissionFlag.unwrap(a) == PermissionFlag.unwrap(b);
}

library PermissionFlags {
    PermissionFlag constant NONE = PermissionFlag.wrap(0x0000);
    PermissionFlag constant SWAP_ALLOWED = PermissionFlag.wrap(0x0001);
    PermissionFlag constant LIQUIDITY_ALLOWED = PermissionFlag.wrap(0x0002);
    PermissionFlag constant ALL_ALLOWED = PermissionFlag.wrap(0xFFFF);
}
