// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @notice Uniswap permissioned-pool deployment addresses on Sepolia (chain id 11155111).
///
/// Source: https://developers.uniswap.org/docs/protocols/v4-hooks/permissioned-pools/deploy-a-permissioned-pool
/// (section "Sepolia testnet") and https://developers.uniswap.org/deployments.json (records
/// permissioned-pools-*-sepolia, permit2-permit2-sepolia, v4-stateview-sepolia; generatedAt 2026-07-15).
/// Both fetched 2026-09-07.
/// Cross-checked the same day with read-only RPC calls: the factory has code and reports
/// POOL_MANAGER() == 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543 (the v4-core 1.0.0 Sepolia PoolManager);
/// PermissionedHooks reports PERMISSIONS_ADAPTER_FACTORY() == the factory address; the factory's
/// runtime bytecode equals a local build of v4-periphery main at dce236d4e2057422d0791d9a973a58765eb46f65
/// apart from the two immutable POOL_MANAGER slots.
/// Swap and liquidity entry points, checked 2026-09-07 at block 11655920 (public RPC): the permissioned
/// Universal Router and PermissionedPositionManager have code and both report
/// PERMISSIONS_ADAPTER_FACTORY() == the factory and poolManager() == POOL_MANAGER; the position manager
/// reports permit2() == PERMIT2 and name() == "Uniswap v4 Permissioned Positions NFT"; StateView reports
/// poolManager() == POOL_MANAGER. The router has no public PERMIT2 getter; its Permit2 is the canonical
/// address per deployments.json.
library UniswapSepolia {
    address internal constant POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    address internal constant PERMISSIONS_ADAPTER_FACTORY = 0xE6B0d96919334C33d06266d1420F97f6f434fA2B;
    /// @dev deployments.json id permissioned-pools-permissionedpositionmanager-sepolia (sourceRef main).
    address internal constant PERMISSIONED_POSITION_MANAGER = 0xf99D553912084c99F6299291b75Fe9B7119Aa1A7;
    address internal constant PERMISSIONED_HOOKS = 0x51247E2291d290d17C08813A175AC86465EdE8c0;
    /// @dev deployments.json id permissioned-pools-universalrouter-sepolia (sourceRef main). This is the
    ///      permissioned-pools build of the Universal Router, not the universal-router 2.0.0 release (0x470FFC67…) and not
    ///      UniversalRouter#v2.2 (0xB0C89059…), which are also listed for Sepolia.
    address internal constant UNIVERSAL_ROUTER = 0x54C707Df83f03bc9cA64ED2CcF9C99B63FD854b7;
    address internal constant V4_QUOTER = 0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227;
    address internal constant MIXED_ROUTE_QUOTER_V2 = 0x4745F77b56a0E2294426E3936dc4Fab68d9543Cd;
    /// @dev deployments.json id permit2-permit2-sepolia; the canonical Permit2 address on every chain.
    address internal constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    /// @dev deployments.json id v4-stateview-sepolia; read-only lens for slot0 and liquidity.
    address internal constant STATE_VIEW = 0xE1Dd9c3fA50EDB962E442f60DfBc432e24537E4C;
}
