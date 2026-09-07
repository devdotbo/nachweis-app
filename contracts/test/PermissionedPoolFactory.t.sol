// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AttestationRegistry} from "../src/AttestationRegistry.sol";
import {FundToken} from "../src/FundToken.sol";
import {Decision} from "../src/interfaces/IEligibility.sol";
import {EudiAllowlistChecker} from "../src/uniswap/EudiAllowlistChecker.sol";
import {IAllowlistChecker} from "../src/uniswap/interfaces/IAllowlistChecker.sol";
import {IPermissionsAdapterFactory} from "../src/uniswap/interfaces/IPermissionsAdapterFactory.sol";
import {IPermissionsAdapterLite} from "../src/uniswap/interfaces/IPermissionsAdapterLite.sol";
import {PermissionFlags} from "../src/uniswap/libraries/PermissionFlags.sol";
import {UniswapSepolia} from "../src/uniswap/UniswapSepolia.sol";

/// @notice Exercises the checker through Uniswap's real PermissionsAdapterFactory and PermissionsAdapter.
///         The factory bytecode is a fixture compiled from v4-periphery (see test/fixtures/PermissionsAdapterFactory.json),
///         so no network is needed. Covers onboarding steps 1 to 5 of the deploy guide against the Nachweis
///         FundToken; step 6 (pool initialisation) needs the PoolManager and hook and is covered by the fork test.
contract PermissionedPoolFactoryTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.demo.fund.v1");
    uint256 constant REQUIRED = 0x3; // identity evidence | over 18

    address owner = makeAddr("owner");
    address issuer = makeAddr("issuer");
    address operator = makeAddr("operator");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address poolManager = makeAddr("poolManager");
    address hooks = makeAddr("permissionedHooks");
    address router = makeAddr("universalRouter");

    AttestationRegistry registry;
    FundToken token;
    EudiAllowlistChecker checker;
    IPermissionsAdapterFactory factory;

    function setUp() public {
        vm.warp(1_800_000_000);
        registry = new AttestationRegistry(owner);
        vm.prank(owner);
        registry.setOperator(POLICY, operator, true);
        token = new FundToken("Nachweis Demo Fund", "NDF", registry, POLICY, REQUIRED, issuer);
        checker = new EudiAllowlistChecker(registry, POLICY, REQUIRED);
        factory = IPermissionsAdapterFactory(_deployFactory(poolManager));
    }

    /// @dev Deploys the fixture bytecode with the constructor argument appended, as the factory has no
    ///      Solidity source in this repo (it is solc 0.8.26 and depends on v4-core and solmate).
    function _deployFactory(address poolManager_) internal returns (address deployed) {
        bytes memory initcode =
            abi.encodePacked(vm.getCode("test/fixtures/PermissionsAdapterFactory.json"), abi.encode(poolManager_));
        assembly ("memory-safe") {
            deployed := create(0, add(initcode, 0x20), mload(initcode))
        }
        require(deployed != address(0), "factory deploy failed");
    }

    function _attest(address subject) internal {
        vm.prank(operator);
        registry.attestByOperator(
            subject,
            Decision({
                policyId: POLICY,
                bits: REQUIRED,
                tier: 1,
                expiry: uint64(block.timestamp + 365 days),
                statusRef: keccak256("status/0"),
                revoked: false
            })
        );
    }

    function _createAdapter() internal returns (IPermissionsAdapterLite adapter) {
        adapter = IPermissionsAdapterLite(factory.createPermissionsAdapter(IERC20(address(token)), issuer, checker));
    }

    // ------------------------------------------------------------------
    // Step 2: create the adapter
    // ------------------------------------------------------------------

    function test_fixtureMatchesExpectedFactory() public view {
        assertEq(factory.POOL_MANAGER(), poolManager);
    }

    function test_factoryCreatesAdapterBoundToChecker() public {
        IPermissionsAdapterLite adapter = _createAdapter();
        assertEq(address(adapter.allowListChecker()), address(checker));
        assertEq(address(adapter.PERMISSIONED_TOKEN()), address(token));
        assertEq(adapter.POOL_MANAGER(), poolManager);
        assertEq(adapter.owner(), issuer);
        assertFalse(adapter.swappingEnabled());
        assertEq(factory.permissionsAdapterOf(address(adapter)), address(token));
        assertEq(factory.verifiedPermissionsAdapterOf(address(adapter)), address(0));
        // Virtual token metadata is derived from the FundToken.
        assertEq(IERC20Metadata(address(adapter)).name(), "Uniswap v4 Nachweis Demo Fund");
        assertEq(IERC20Metadata(address(adapter)).symbol(), "v4NDF");
        assertEq(IERC20Metadata(address(adapter)).decimals(), 18);
    }

    function test_adapterRejectsCheckerWithoutErc165() public {
        // The registry itself does not implement IAllowlistChecker / ERC-165.
        IAllowlistChecker bogus = IAllowlistChecker(address(registry));
        vm.expectRevert(abi.encodeWithSelector(IPermissionsAdapterLite.InvalidAllowListChecker.selector, bogus));
        factory.createPermissionsAdapter(IERC20(address(token)), issuer, bogus);
    }

    // ------------------------------------------------------------------
    // The check the hook performs: adapter.isAllowed(account, flag)
    // ------------------------------------------------------------------

    function test_adapterIsAllowedFollowsRegistry() public {
        IPermissionsAdapterLite adapter = _createAdapter();
        assertFalse(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        assertFalse(adapter.isAllowed(alice, PermissionFlags.LIQUIDITY_ALLOWED));

        _attest(alice);
        assertTrue(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        assertTrue(adapter.isAllowed(alice, PermissionFlags.LIQUIDITY_ALLOWED));
        assertFalse(adapter.isAllowed(bob, PermissionFlags.SWAP_ALLOWED));
        // ALL_ALLOWED (0xFFFF) is deliberately not granted.
        assertFalse(adapter.isAllowed(alice, PermissionFlags.ALL_ALLOWED));

        vm.prank(operator);
        registry.revoke(alice, POLICY);
        assertFalse(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        assertFalse(adapter.isAllowed(alice, PermissionFlags.LIQUIDITY_ALLOWED));
    }

    function test_adapterIsAllowedFalseAfterExpiry() public {
        IPermissionsAdapterLite adapter = _createAdapter();
        _attest(alice);
        assertTrue(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        vm.warp(block.timestamp + 365 days);
        assertFalse(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
    }

    function test_ownerCanSwapCheckerForNewPolicy() public {
        IPermissionsAdapterLite adapter = _createAdapter();
        EudiAllowlistChecker stricter = new EudiAllowlistChecker(registry, POLICY, 0xF);
        _attest(alice); // bits 0x3, does not cover 0xF
        assertTrue(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        vm.prank(issuer);
        adapter.updateAllowListChecker(stricter);
        assertFalse(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
    }

    // ------------------------------------------------------------------
    // Steps 3 to 5: allowlist and fund the adapter, verify, approve wrappers and hook
    // ------------------------------------------------------------------

    function test_verifyRequiresAdapterToHoldFundToken() public {
        IPermissionsAdapterLite adapter = _createAdapter();

        vm.expectRevert(
            abi.encodeWithSelector(IPermissionsAdapterFactory.PermissionsAdapterNotVerified.selector, address(adapter))
        );
        factory.verifyPermissionsAdapter(address(adapter));

        // Step 3a: the FundToken transfer hook blocks the adapter until it is attested itself. The adapter's
        // solmate SafeTransferLib replaces the token's NotEligible(adapter) error with its own string.
        vm.prank(issuer);
        token.mint(issuer, 1);
        vm.prank(issuer);
        token.approve(address(adapter), 1);
        vm.prank(issuer);
        vm.expectRevert(bytes("TRANSFER_FROM_FAILED"));
        adapter.depositForVerification(1);
        // Direct mint to the adapter shows the underlying reason.
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(FundToken.NotEligible.selector, address(adapter)));
        token.mint(address(adapter), 1);

        // Step 3b: attest the adapter address under the policy, then seed 1 wei.
        _attest(address(adapter));
        vm.prank(issuer);
        vm.expectEmit(true, true, true, true, address(adapter));
        emit IPermissionsAdapterLite.VerificationDeposit(issuer, 1);
        adapter.depositForVerification(1);
        assertEq(token.balanceOf(address(adapter)), 1);

        // Step 4.
        factory.verifyPermissionsAdapter(address(adapter));
        assertEq(factory.verifiedPermissionsAdapterOf(address(adapter)), address(token));

        vm.expectRevert(
            abi.encodeWithSelector(IPermissionsAdapterFactory.PermissionsAdapterAlreadyVerified.selector, address(adapter))
        );
        factory.verifyPermissionsAdapter(address(adapter));
    }

    function test_ownerApprovesWrappersHookAndSwapping() public {
        IPermissionsAdapterLite adapter = _createAdapter();
        vm.startPrank(issuer);
        adapter.updateAllowedWrapper(router, true);
        adapter.updateAllowedHook(hooks, true);
        adapter.updateSwappingEnabled(true);
        vm.stopPrank();
        assertTrue(adapter.allowedWrappers(router));
        assertTrue(adapter.allowedHooks(hooks));
        assertTrue(adapter.swappingEnabled());

        vm.prank(alice);
        vm.expectRevert();
        adapter.updateSwappingEnabled(false);
    }
}

/// @notice Runs only when SEPOLIA_RPC_URL is set: forks Sepolia, checks the published addresses, and creates an
///         adapter for a fresh registry and FundToken against the live factory. Nothing is broadcast.
contract PermissionedPoolSepoliaForkTest is Test {
    bytes32 constant POLICY = keccak256("nachweis.demo.fund.v1");
    uint256 constant REQUIRED = 0x3; // identity evidence | over 18

    function test_forkLiveFactoryAcceptsChecker() public {
        string memory rpc = vm.envOr("SEPOLIA_RPC_URL", string(""));
        if (bytes(rpc).length == 0) {
            vm.skip(true, "SEPOLIA_RPC_URL not set");
            return;
        }
        vm.createSelectFork(rpc);

        IPermissionsAdapterFactory factory = IPermissionsAdapterFactory(UniswapSepolia.PERMISSIONS_ADAPTER_FACTORY);
        assertGt(UniswapSepolia.PERMISSIONS_ADAPTER_FACTORY.code.length, 0, "factory has no code");
        assertGt(UniswapSepolia.PERMISSIONED_HOOKS.code.length, 0, "hooks have no code");
        assertEq(factory.POOL_MANAGER(), UniswapSepolia.POOL_MANAGER, "PoolManager mismatch");

        address issuer = makeAddr("issuer");
        address alice = makeAddr("alice");
        AttestationRegistry registry = new AttestationRegistry(issuer);
        vm.prank(issuer);
        registry.setOperator(POLICY, issuer, true);
        FundToken token = new FundToken("Nachweis Demo Fund", "NDF", registry, POLICY, REQUIRED, issuer);
        EudiAllowlistChecker checker = new EudiAllowlistChecker(registry, POLICY, REQUIRED);

        IPermissionsAdapterLite adapter =
            IPermissionsAdapterLite(factory.createPermissionsAdapter(IERC20(address(token)), issuer, checker));
        assertEq(address(adapter.allowListChecker()), address(checker));
        assertFalse(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
        vm.prank(issuer);
        registry.attestByOperator(
            alice,
            Decision({
                policyId: POLICY,
                bits: REQUIRED,
                tier: 1,
                expiry: uint64(block.timestamp + 365 days),
                statusRef: bytes32(0),
                revoked: false
            })
        );
        assertTrue(adapter.isAllowed(alice, PermissionFlags.SWAP_ALLOWED));
    }
}
