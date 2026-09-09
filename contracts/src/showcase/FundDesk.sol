// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FundToken} from "../FundToken.sol";
import {IEligibility} from "../interfaces/IEligibility.sol";

/// @title FundDesk
/// @notice Showcase contract for the investor-money case. Deployed as the FundToken's issuer, so
///         FundToken and Subscription stay untouched. The desk takes stablecoin subscriptions, pays
///         distributions and redemptions. Every investor-facing function checks the
///         AttestationRegistry's isEligible for msg.sender first (evidence plus issuer approval,
///         not revoked, not expired), so a revoked or expired decision closes subscribe, claim and
///         redeem in one place.
///
///         Demo simplifications, stated on purpose:
///         - A distribution is paid per unit over the investor's current FundToken balance at claim
///           time, without a balance snapshot at distribution time. Units bought or received after a
///           distribution still claim it; units sent away lose it.
///         - FundToken has no burn, so redeemed units stay in the desk as inventory. New subscriptions
///           are served from that inventory first and minted only for the remainder.
///         - Rounding dust from per-unit math stays in the desk.
///         - Distributions are enumerated with a bounded loop; fine for demo sizes.
contract FundDesk is Ownable {
    using SafeERC20 for IERC20;

    error NotEligible(address subject);
    error ZeroAmount();
    error NoUnitsOutstanding();
    error AlreadyClaimed(uint256 id);
    error NothingToClaim();
    error TokenAlreadySet();
    error TokenUnset();

    event TokenSet(address token);
    event Subscribed(address indexed investor, uint256 stableIn, uint256 units);
    event Distributed(uint256 indexed id, uint256 totalStable, uint256 perUnit);
    event Claimed(uint256 indexed id, address indexed investor, uint256 stableOut);
    event Redeemed(address indexed investor, uint256 units, uint256 stableOut);

    /// @notice Per-unit distribution record. perUnit is stable wei per 1e18 units.
    struct Distribution {
        uint256 total;
        uint256 perUnit;
    }

    /// @notice 1 mUSD (1e6, 6 decimals) buys 1 NDF (1e18).
    uint256 public constant UNIT_SCALE = 1e12;

    /// @notice Subscription and payout currency (6 decimals; MockStable in tests and local runs).
    IERC20 public immutable stable;

    /// @notice The fund share token. Set once by setToken: the FundToken constructor needs the desk
    ///         address as issuer and the desk needs the token, so setToken avoids address precomputation.
    FundToken public token;

    Distribution[] public distributions;

    /// @notice claimed[id][investor]
    mapping(uint256 => mapping(address => bool)) public claimed;

    constructor(IERC20 stable_, address owner_) Ownable(owner_) {
        stable = stable_;
    }

    // ---------------------------------------------------------------------
    // Setup
    // ---------------------------------------------------------------------

    function setToken(FundToken token_) external onlyOwner {
        if (address(token) != address(0)) revert TokenAlreadySet();
        token = token_;
        emit TokenSet(address(token_));
    }

    // ---------------------------------------------------------------------
    // Eligibility
    // ---------------------------------------------------------------------

    modifier onlyEligible() {
        if (!_eligible(msg.sender)) revert NotEligible(msg.sender);
        _;
    }

    function isEligible(address a) external view returns (bool) {
        return _eligible(a);
    }

    function _eligible(address a) internal view returns (bool) {
        if (address(token) == address(0)) revert TokenUnset();
        IEligibility registry = token.registry();
        return registry.isEligible(a, token.policyId(), token.REQUIRED_BITS());
    }

    // ---------------------------------------------------------------------
    // Unit math
    // ---------------------------------------------------------------------

    function unitsFor(uint256 stableAmount) public pure returns (uint256) {
        return stableAmount * UNIT_SCALE;
    }

    function stableFor(uint256 units) public pure returns (uint256) {
        return units / UNIT_SCALE;
    }

    /// @notice Units held by investors: total supply minus the desk's own inventory.
    function outstandingUnits() public view returns (uint256) {
        return token.totalSupply() - token.balanceOf(address(this));
    }

    // ---------------------------------------------------------------------
    // Subscribe
    // ---------------------------------------------------------------------

    /// @notice Pull stableAmount from the caller and hand out units, inventory first, mint the rest.
    function subscribe(uint256 stableAmount) external onlyEligible {
        if (stableAmount == 0) revert ZeroAmount();
        stable.safeTransferFrom(msg.sender, address(this), stableAmount);

        uint256 units = unitsFor(stableAmount);
        uint256 inventory = token.balanceOf(address(this));
        uint256 fromInventory = units < inventory ? units : inventory;
        if (fromInventory > 0) {
            // FundToken's hook checks the recipient; msg.sender passed onlyEligible above.
            token.transfer(msg.sender, fromInventory);
        }
        uint256 rest = units - fromInventory;
        if (rest > 0) token.mint(msg.sender, rest);

        emit Subscribed(msg.sender, stableAmount, units);
    }

    // ---------------------------------------------------------------------
    // Distributions
    // ---------------------------------------------------------------------

    function distributionCount() external view returns (uint256) {
        return distributions.length;
    }

    /// @notice Pull totalStable from the owner (the issuer's treasury) and record a per-unit payout
    ///         over the units outstanding right now. Rounding dust stays in the desk.
    function distribute(uint256 totalStable) external onlyOwner {
        if (totalStable == 0) revert ZeroAmount();
        uint256 outstanding = outstandingUnits();
        if (outstanding == 0) revert NoUnitsOutstanding();

        stable.safeTransferFrom(msg.sender, address(this), totalStable);

        uint256 perUnit = totalStable * 1e18 / outstanding;
        uint256 id = distributions.length;
        distributions.push(Distribution({total: totalStable, perUnit: perUnit}));
        emit Distributed(id, totalStable, perUnit);
    }

    /// @notice Stable the investor can claim for one distribution, based on the current balance.
    function claimable(address investor, uint256 id) public view returns (uint256) {
        if (claimed[id][investor]) return 0;
        return token.balanceOf(investor) * distributions[id].perUnit / 1e18;
    }

    /// @notice Sum over all distributions. Bounded loop, demo size.
    function claimableTotal(address investor) external view returns (uint256 total) {
        uint256 n = distributions.length;
        for (uint256 id = 0; id < n; id++) {
            total += claimable(investor, id);
        }
    }

    function claim(uint256 id) external onlyEligible returns (uint256 paid) {
        if (claimed[id][msg.sender]) revert AlreadyClaimed(id);
        paid = claimable(msg.sender, id);
        if (paid == 0) revert NothingToClaim();
        claimed[id][msg.sender] = true;
        stable.safeTransfer(msg.sender, paid);
        emit Claimed(id, msg.sender, paid);
    }

    /// @notice Claim every open distribution in one call. Bounded loop, demo size.
    function claimAll() external onlyEligible returns (uint256 paid) {
        uint256 n = distributions.length;
        for (uint256 id = 0; id < n; id++) {
            if (claimed[id][msg.sender]) continue;
            uint256 amount = claimable(msg.sender, id);
            if (amount == 0) continue;
            claimed[id][msg.sender] = true;
            stable.safeTransfer(msg.sender, amount);
            emit Claimed(id, msg.sender, amount);
            paid += amount;
        }
        if (paid == 0) revert NothingToClaim();
    }

    // ---------------------------------------------------------------------
    // Redeem
    // ---------------------------------------------------------------------

    /// @notice Return units to the desk (the investor approved the desk; FundToken's hook allows
    ///         transfers to the issuer) and receive stable at par. The units stay as desk inventory.
    function redeem(uint256 units) external onlyEligible {
        if (units == 0) revert ZeroAmount();
        uint256 stableOut = stableFor(units);
        if (stableOut == 0) revert ZeroAmount();
        token.transferFrom(msg.sender, address(this), units);
        stable.safeTransfer(msg.sender, stableOut);
        emit Redeemed(msg.sender, units, stableOut);
    }
}
