// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {AttestationRegistry} from "../../src/AttestationRegistry.sol";
import {FundToken} from "../../src/FundToken.sol";
import {Decision, IEligibility} from "../../src/interfaces/IEligibility.sol";
import {EudiAllowlistChecker} from "../../src/uniswap/EudiAllowlistChecker.sol";
import {IPermissionsAdapterFactory} from "../../src/uniswap/interfaces/IPermissionsAdapterFactory.sol";
import {IPermissionsAdapterLite} from "../../src/uniswap/interfaces/IPermissionsAdapterLite.sol";
import {IPoolManagerLite, PoolKeyLite} from "../../src/uniswap/interfaces/IPoolManagerLite.sol";
import {UniswapSepolia} from "../../src/uniswap/UniswapSepolia.sol";

/// @notice Steps 1 to 6 of the Uniswap permissioned-pool deploy guide for a Nachweis FundToken, as one internal
///         function so the onboarding script and the fork tests run the identical sequence. The caller (the
///         broadcasting key in a script, the pranked address in a test) must be the FundToken issuer and an
///         operator for `policyId`; it becomes the adapter owner.
library PermissionedPoolOnboarding {
    struct Pool {
        EudiAllowlistChecker checker;
        IPermissionsAdapterLite adapter;
        PoolKeyLite key;
        uint160 sqrtPriceX96;
        int24 tick;
    }

    /// @dev Status reference of the venue decision the adapter receives in step 3.
    bytes32 internal constant VENUE_STATUS_REF = keccak256("nachweis.venue.uniswap-permissions-adapter");

    function onboard(
        AttestationRegistry registry,
        FundToken fundToken,
        IERC20Metadata stable,
        address owner,
        bytes32 policyId,
        uint256 requiredBits,
        uint24 fee,
        int24 tickSpacing
    ) internal returns (Pool memory p) {
        IPermissionsAdapterFactory factory = IPermissionsAdapterFactory(UniswapSepolia.PERMISSIONS_ADAPTER_FACTORY);

        // Step 1: the allowlist checker. Immutable, view-only, reads the registry.
        p.checker = new EudiAllowlistChecker(IEligibility(address(registry)), policyId, requiredBits);

        // Step 2: create the Permissions Adapter (virtual token) through Uniswap's factory.
        p.adapter = IPermissionsAdapterLite(
            factory.createPermissionsAdapter(IERC20(address(fundToken)), owner, p.checker)
        );

        // Step 3: allowlist and fund the adapter. The FundToken gate is the registry itself, so the adapter
        // address gets a decision under the policy (a venue approval, not a person). Then seed 1 wei.
        registry.attestByOperator(
            address(p.adapter),
            Decision({
                policyId: policyId,
                bits: requiredBits,
                tier: 0,
                expiry: type(uint64).max,
                statusRef: VENUE_STATUS_REF,
                revoked: false
            })
        );
        fundToken.mint(owner, 1);
        fundToken.approve(address(p.adapter), 1);
        p.adapter.depositForVerification(1);

        // Step 4: verify the adapter with the factory.
        factory.verifyPermissionsAdapter(address(p.adapter));

        // Step 5: approve the four wrappers and the permissioned hook.
        p.adapter.updateAllowedWrapper(UniswapSepolia.PERMISSIONED_POSITION_MANAGER, true);
        p.adapter.updateAllowedWrapper(UniswapSepolia.UNIVERSAL_ROUTER, true);
        p.adapter.updateAllowedWrapper(UniswapSepolia.V4_QUOTER, true);
        p.adapter.updateAllowedWrapper(UniswapSepolia.MIXED_ROUTE_QUOTER_V2, true);
        p.adapter.updateAllowedHook(UniswapSepolia.PERMISSIONED_HOOKS, true);

        // Step 6: create the pool (adapter as currency, currencies sorted ascending) at a price of one whole
        // FundToken per whole stable, and enable swapping.
        (address c0, address c1) = address(p.adapter) < address(stable)
            ? (address(p.adapter), address(stable))
            : (address(stable), address(p.adapter));
        p.key = PoolKeyLite({
            currency0: c0, currency1: c1, fee: fee, tickSpacing: tickSpacing, hooks: UniswapSepolia.PERMISSIONED_HOOKS
        });
        p.sqrtPriceX96 = sqrtPriceOneToOne(IERC20Metadata(c0).decimals(), IERC20Metadata(c1).decimals());
        p.tick = IPoolManagerLite(UniswapSepolia.POOL_MANAGER).initialize(p.key, p.sqrtPriceX96);
        p.adapter.updateSwappingEnabled(true);
    }

    /// @notice sqrtPriceX96 at which one whole unit of currency0 costs one whole unit of currency1:
    ///         price = 10^decimals1 / 10^decimals0 in raw units, sqrtPriceX96 = sqrt(price) * 2^96.
    ///         For the demo (adapter 18 decimals, stable 6) that is tick -276325 or +276324.
    function sqrtPriceOneToOne(uint8 decimals0, uint8 decimals1) internal pure returns (uint160) {
        return uint160(Math.sqrt(Math.mulDiv(1 << 192, 10 ** uint256(decimals1), 10 ** uint256(decimals0))));
    }
}
