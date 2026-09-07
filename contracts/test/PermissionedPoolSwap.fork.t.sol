// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {MockStable} from "../src/test/MockStable.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";
import {IPermissionedPositionManagerLite} from "../src/uniswap/interfaces/IPermissionedPositionManagerLite.sol";
import {IPermissionsAdapterLite} from "../src/uniswap/interfaces/IPermissionsAdapterLite.sol";
import {IPermit2Lite} from "../src/uniswap/interfaces/IPermit2Lite.sol";
import {PoolKeyLite} from "../src/uniswap/interfaces/IPoolManagerLite.sol";
import {IStateViewLite} from "../src/uniswap/interfaces/IStateViewLite.sol";
import {IUniversalRouterLite} from "../src/uniswap/interfaces/IUniversalRouterLite.sol";
import {LiquidityAmounts} from "../src/uniswap/libraries/LiquidityAmounts.sol";
import {PermissionFlags} from "../src/uniswap/libraries/PermissionFlags.sol";
import {PermissionedPoolActions} from "../src/uniswap/libraries/PermissionedPoolActions.sol";
import {TickMath} from "../src/uniswap/libraries/TickMath.sol";
import {UniswapSepolia} from "../src/uniswap/UniswapSepolia.sol";
import {PermissionedPoolOnboarding} from "../script/lib/PermissionedPoolOnboarding.sol";

/// @notice Runs only when SEPOLIA_RPC_URL is set. On a Sepolia fork: onboards a fresh FundToken into a
///         permissioned pool (steps 1 to 6 against the live factory, hook and PoolManager), mints liquidity through
///         the live PermissionedPositionManager, then swaps through the live permissioned Universal Router as an
///         attested investor, as a revoked investor and as a never-attested address. Nothing is broadcast.
contract PermissionedPoolSwapSepoliaForkTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.demo.fund.v1");
    uint256 constant REQUIRED = 0x7;
    uint256 constant FUND_LIQUIDITY = 1000e18;
    uint256 constant STABLE_LIQUIDITY = 1000e6;
    uint128 constant SWAP_IN = 100e6;

    // v4-core CustomRevert.WrappedError (ERC-7751) wraps every hook revert; Hooks.HookCallFailed is the detail.
    error WrappedError(address target, bytes4 selector, bytes reason, bytes details);
    error HookCallFailed();
    // Raised by PermissionedHooks (same name in the router and the position manager).
    error Unauthorized();
    bytes4 constant BEFORE_SWAP_SELECTOR =
        bytes4(keccak256("beforeSwap(address,(address,address,uint24,int24,address),(bool,int256,uint160),bytes)"));
    bytes4 constant BEFORE_ADD_LIQUIDITY_SELECTOR = bytes4(
        keccak256("beforeAddLiquidity(address,(address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)")
    );

    IPermissionedPositionManagerLite constant POSM =
        IPermissionedPositionManagerLite(UniswapSepolia.PERMISSIONED_POSITION_MANAGER);
    IUniversalRouterLite constant ROUTER = IUniversalRouterLite(UniswapSepolia.UNIVERSAL_ROUTER);
    IPermit2Lite constant PERMIT2 = IPermit2Lite(UniswapSepolia.PERMIT2);

    bool forked;
    address issuer = makeAddr("issuer");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    AttestationRegistry registry;
    FundToken token;
    MockStable stable;
    IPermissionsAdapterLite adapter;
    PoolKeyLite key;
    uint256 lpTokenId;

    function setUp() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        // Nachweis side: registry, token, demo stable; the issuer is owner, operator and adapter owner.
        registry = new AttestationRegistry(issuer);
        vm.startPrank(issuer);
        registry.setOperator(POLICY, issuer, true);
        token = new FundToken("Nachweis Demo Fund", "NDF", registry, POLICY, REQUIRED, issuer);
        stable = new MockStable();

        // Uniswap side, steps 1 to 6 against the live contracts.
        PermissionedPoolOnboarding.Pool memory pool = PermissionedPoolOnboarding.onboard(
            registry, token, IERC20Metadata(address(stable)), issuer, POLICY, REQUIRED, 3000, 60
        );
        vm.stopPrank();
        adapter = pool.adapter;
        key = pool.key;

        // The issuer provides the initial liquidity. It must be LIQUIDITY_ALLOWED like anyone else.
        _attest(issuer);
        vm.prank(issuer);
        token.mint(issuer, FUND_LIQUIDITY);
        stable.mint(issuer, STABLE_LIQUIDITY);
        lpTokenId = _mint(issuer, FUND_LIQUIDITY, STABLE_LIQUIDITY);
    }

    function _skipUnlessForked() internal {
        if (!forked) vm.skip(true, "SEPOLIA_RPC_URL not set");
    }

    function _attest(address subject) internal {
        vm.prank(issuer);
        registry.attestByOperator(
            subject,
            Decision({
                policyId: POLICY,
                bits: REQUIRED,
                tier: 1,
                expiry: uint64(block.timestamp + 365 days),
                statusRef: bytes32(0),
                revoked: false
            })
        );
    }

    function _slot0() internal view returns (uint160 sqrtPriceX96, int24 tick) {
        (sqrtPriceX96, tick,,) = IStateViewLite(UniswapSepolia.STATE_VIEW).getSlot0(PermissionedPoolActions.poolId(key));
    }

    function _mintUnlockData(address lp, uint256 fundAmount, uint256 stableAmount)
        internal
        view
        returns (bytes memory)
    {
        (uint160 sqrtPriceX96,) = _slot0();
        int24 lower = TickMath.minUsableTick(key.tickSpacing);
        int24 upper = TickMath.maxUsableTick(key.tickSpacing);
        (uint256 amount0, uint256 amount1) =
            key.currency0 == address(adapter) ? (fundAmount, stableAmount) : (stableAmount, fundAmount);
        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(lower), TickMath.getSqrtPriceAtTick(upper), amount0, amount1
        );
        liquidity -= liquidity / 1000;
        return PermissionedPoolActions.mintUnlockData(
            PermissionedPoolActions.MintParams({
                key: key,
                tickLower: lower,
                tickUpper: upper,
                liquidity: liquidity,
                amount0Max: uint128(amount0),
                amount1Max: uint128(amount1),
                recipient: lp,
                hookData: ""
            })
        );
    }

    function _approveForPosm(address lp, uint256 fundAmount, uint256 stableAmount) internal {
        vm.startPrank(lp);
        token.approve(UniswapSepolia.PERMIT2, fundAmount);
        stable.approve(UniswapSepolia.PERMIT2, stableAmount);
        PERMIT2.approve(address(token), address(POSM), uint160(fundAmount), uint48(block.timestamp + 1 days));
        PERMIT2.approve(address(stable), address(POSM), uint160(stableAmount), uint48(block.timestamp + 1 days));
        vm.stopPrank();
    }

    function _mint(address lp, uint256 fundAmount, uint256 stableAmount) internal returns (uint256 tokenId) {
        _approveForPosm(lp, fundAmount, stableAmount);
        bytes memory unlockData = _mintUnlockData(lp, fundAmount, stableAmount);
        tokenId = POSM.nextTokenId();
        vm.prank(lp);
        POSM.modifyLiquidities(unlockData, block.timestamp + 1 hours);
    }

    /// @dev Stable in, FundToken out, as `swapper`, through the permissioned Universal Router.
    function _swapCalldata() internal view returns (bytes memory commands, bytes[] memory inputs) {
        bool zeroForOne = key.currency0 == address(stable);
        (commands, inputs) = PermissionedPoolActions.swapExactInSingle(key, zeroForOne, SWAP_IN, 0, "");
    }

    function _prepareSwapper(address swapper) internal {
        stable.mint(swapper, SWAP_IN);
        vm.startPrank(swapper);
        stable.approve(UniswapSepolia.PERMIT2, SWAP_IN);
        PERMIT2.approve(address(stable), address(ROUTER), SWAP_IN, uint48(block.timestamp + 1 days));
        vm.stopPrank();
    }

    function _expectHookUnauthorized(bytes4 hookSelector) internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                WrappedError.selector,
                UniswapSepolia.PERMISSIONED_HOOKS,
                hookSelector,
                abi.encodeWithSelector(Unauthorized.selector),
                abi.encodeWithSelector(HookCallFailed.selector)
            )
        );
    }

    // ------------------------------------------------------------------

    function test_forkLiquidityMintedThroughPermissionedPositionManager() public {
        _skipUnlessForked();
        assertEq(POSM.ownerOf(lpTokenId), issuer);
        assertGt(POSM.getPositionLiquidity(lpTokenId), 0);
        // The adapter holds the FundToken the LP paid (plus the 1 wei verification deposit); the PoolManager
        // holds the same amount of virtual token, and the LP's FundToken went down by it.
        uint256 wrapped = adapter.balanceOf(UniswapSepolia.POOL_MANAGER);
        assertGt(wrapped, 0);
        assertEq(token.balanceOf(address(adapter)), wrapped + 1);
        assertEq(token.balanceOf(issuer), FUND_LIQUIDITY - wrapped);
        assertLt(stable.balanceOf(issuer), STABLE_LIQUIDITY);
        assertEq(IStateViewLite(UniswapSepolia.STATE_VIEW).getLiquidity(PermissionedPoolActions.poolId(key)),
            POSM.getPositionLiquidity(lpTokenId));
    }

    function test_forkUnattestedLpCannotMint() public {
        _skipUnlessForked();
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotEligible.selector, bob));
        token.mint(bob, 1e18);
        // Even without holding the token, the mint is refused by the position manager's own recipient check,
        // before the hook and before any transfer.
        stable.mint(bob, 1e6);
        _approveForPosm(bob, 0, 1e6);
        bytes memory unlockData = _mintUnlockData(bob, 0, 1e6);
        vm.prank(bob);
        vm.expectRevert(IPermissionedPositionManagerLite.Unauthorized.selector);
        POSM.modifyLiquidities(unlockData, block.timestamp + 1 hours);
    }

    function test_forkAttestedInvestorSwapsStableForFundToken() public {
        _skipUnlessForked();
        _attest(alice);
        assertTrue(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        _prepareSwapper(alice);
        (bytes memory commands, bytes[] memory inputs) = _swapCalldata();
        (, int24 tickBefore) = _slot0();

        vm.prank(alice);
        ROUTER.execute(commands, inputs, block.timestamp + 1 hours);

        uint256 received = token.balanceOf(alice);
        assertGt(received, 0, "no FundToken received");
        assertEq(stable.balanceOf(alice), 0, "stable not spent");
        // Roughly 100 stable for 90-ish FundToken against 1000/1000 liquidity at a 0.3 percent fee.
        assertGt(received, 85e18);
        assertLt(received, 100e18);
        // The adapter unwrapped on the way out: alice holds the FundToken, not the virtual token.
        assertEq(adapter.balanceOf(alice), 0);
        assertEq(adapter.balanceOf(UniswapSepolia.POOL_MANAGER), adapter.totalSupply());
        (, int24 tickAfter) = _slot0();
        assertTrue(tickAfter != tickBefore, "price did not move");
    }

    function test_forkRevokedInvestorCannotSwap() public {
        _skipUnlessForked();
        _attest(alice);
        _prepareSwapper(alice);
        (bytes memory commands, bytes[] memory inputs) = _swapCalldata();
        vm.prank(alice);
        ROUTER.execute(commands, inputs, block.timestamp + 1 hours);
        uint256 held = token.balanceOf(alice);
        assertGt(held, 0);

        // Revoke: the registry decision flips, the checker answers NONE, the adapter answers false.
        vm.prank(issuer);
        registry.revoke(alice, POLICY);
        assertFalse(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));

        // The same calldata now reverts inside PermissionedHooks.beforeSwap with Unauthorized(), wrapped by
        // the PoolManager as WrappedError(hook, beforeSwap, Unauthorized, HookCallFailed). The router is only
        // the conduit: neither a Permit2 pull nor a settle happened before the hook rejected the swap.
        _prepareSwapper(alice);
        _expectHookUnauthorized(BEFORE_SWAP_SELECTOR);
        vm.prank(alice);
        ROUTER.execute(commands, inputs, block.timestamp + 1 hours);
        assertEq(token.balanceOf(alice), held);
        assertEq(stable.balanceOf(alice), SWAP_IN);

        // Revocation also closes liquidity provision: the position manager's own recipient check rejects the
        // mint before the hook is reached, even though alice still holds FundToken.
        _approveForPosm(alice, held, 0);
        bytes memory unlockData = _mintUnlockData(alice, held, 0);
        vm.prank(alice);
        vm.expectRevert(IPermissionedPositionManagerLite.Unauthorized.selector);
        POSM.modifyLiquidities(unlockData, block.timestamp + 1 hours);
    }

    function test_forkNeverAttestedAddressCannotSwap() public {
        _skipUnlessForked();
        assertFalse(adapter.isAllowed(bob, PermissionFlags.SWAP_ALLOWED));
        _prepareSwapper(bob);
        (bytes memory commands, bytes[] memory inputs) = _swapCalldata();
        _expectHookUnauthorized(BEFORE_SWAP_SELECTOR);
        vm.prank(bob);
        ROUTER.execute(commands, inputs, block.timestamp + 1 hours);
        assertEq(token.balanceOf(bob), 0);
        assertEq(stable.balanceOf(bob), SWAP_IN);
    }
}
