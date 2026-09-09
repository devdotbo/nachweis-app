// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IEligibility} from "../interfaces/IEligibility.sol";

/// @title GatedPayout
/// @notice Showcase "contractor payout desk": a company treasury pays a stablecoin to recipients, and every
///         recipient must hold a live Attestat decision (AttestationRegistry.isEligible: approved, not revoked,
///         not expired, required bits present). The treasury never learns who the recipient is; it only learns
///         that the registry says eligible. The whole batch reverts on the first ineligible recipient.
///
///         `total` is passed as a scalar next to the amounts so a wallet policy (Privy: `payout.total <= cap`)
///         can cap a run without summing an array; the contract checks that the amounts add up to it.
///         Funds move with transferFrom, so the treasury keeps custody until the call: it approves this
///         contract and the policy allows exactly that approve and this payout, nothing else.
contract GatedPayout {
    using SafeERC20 for IERC20;

    error NotEligible(address recipient);
    error LengthMismatch();
    error TotalMismatch(uint256 expected, uint256 given);
    error EmptyRun();
    error ZeroAmount(address recipient);

    /// @notice One event per recipient, tagged with the desk's run reference (never a name).
    event PaidOut(address indexed payer, address indexed recipient, uint256 amount, bytes32 indexed runRef);
    /// @notice One event per run.
    event PayoutRun(address indexed payer, bytes32 indexed runRef, uint256 count, uint256 total);

    IEligibility public immutable registry;
    IERC20 public immutable token;
    bytes32 public immutable policyId;
    uint256 public immutable requiredBits;

    constructor(IEligibility registry_, IERC20 token_, bytes32 policyId_, uint256 requiredBits_) {
        registry = registry_;
        token = token_;
        policyId = policyId_;
        requiredBits = requiredBits_;
    }

    /// @notice Pays `amounts[i]` of `token` from the caller to `recipients[i]`; reverts NotEligible(recipient)
    ///         for the first recipient without a live decision. Nothing is paid unless every recipient is eligible.
    function payout(address[] calldata recipients, uint256[] calldata amounts, uint256 total, bytes32 runRef) external {
        uint256 n = recipients.length;
        if (n == 0) revert EmptyRun();
        if (n != amounts.length) revert LengthMismatch();
        uint256 sum;
        for (uint256 i = 0; i < n; i++) {
            if (amounts[i] == 0) revert ZeroAmount(recipients[i]);
            sum += amounts[i];
        }
        if (sum != total) revert TotalMismatch(sum, total);
        for (uint256 i = 0; i < n; i++) {
            if (!registry.isEligible(recipients[i], policyId, requiredBits)) revert NotEligible(recipients[i]);
            token.safeTransferFrom(msg.sender, recipients[i], amounts[i]);
            emit PaidOut(msg.sender, recipients[i], amounts[i], runRef);
        }
        emit PayoutRun(msg.sender, runRef, n, total);
    }

    /// @notice Eligibility of each recipient under this gate's policy, in one read (used by the desk to preview a run).
    function eligibleOf(address[] calldata recipients) external view returns (bool[] memory out) {
        out = new bool[](recipients.length);
        for (uint256 i = 0; i < recipients.length; i++) {
            out[i] = registry.isEligible(recipients[i], policyId, requiredBits);
        }
    }
}
