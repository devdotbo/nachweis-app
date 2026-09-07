// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IEligibility} from "./interfaces/IEligibility.sol";

/// @title FundToken
/// @notice Demo fund share token. Every transfer requires the recipient to be eligible under the
///         issuer's policy in the AttestationRegistry. Exceptions: burns (to == 0) and transfers
///         back to the issuer (redemption). Minting is restricted to the issuer and the Subscription contract.
contract FundToken is ERC20 {
    error NotEligible(address subject);
    error NotIssuer(address caller);
    error NotMinter(address caller);
    error SubscriptionAlreadySet();

    event SubscriptionSet(address indexed subscription);

    IEligibility public immutable registry;
    bytes32 public immutable policyId;
    /// @notice Predicate bits a holder must have under policyId. The demo policy requires
    ///         DEFAULT_REQUIRED_BITS; deployments may pass another mask.
    uint256 public immutable REQUIRED_BITS;

    /// @notice Bit 0 = identity evidence, bit 1 = over 18: the bits the proof path can assert.
    ///         Single source of truth for the demo policy; the deploy scripts default to it.
    ///         Bits 2 (EU resident) and 3 (not sanctioned) are reserved and not required anywhere.
    uint256 public constant DEFAULT_REQUIRED_BITS = 0x3;
    address public immutable issuer;

    /// @notice The Subscription contract allowed to mint. Set once by the issuer.
    address public subscription;

    constructor(
        string memory name_,
        string memory symbol_,
        IEligibility registry_,
        bytes32 policyId_,
        uint256 requiredBits_,
        address issuer_
    ) ERC20(name_, symbol_) {
        registry = registry_;
        policyId = policyId_;
        REQUIRED_BITS = requiredBits_;
        issuer = issuer_;
    }

    function setSubscription(address subscription_) external {
        if (msg.sender != issuer) revert NotIssuer(msg.sender);
        if (subscription != address(0)) revert SubscriptionAlreadySet();
        subscription = subscription_;
        emit SubscriptionSet(subscription_);
    }

    function mint(address to, uint256 amount) external {
        if (msg.sender != issuer && msg.sender != subscription) revert NotMinter(msg.sender);
        _mint(to, amount);
    }

    /// @dev Transfer hook. Covers transfer, transferFrom and mint (from == 0).
    function _update(address from, address to, uint256 value) internal override {
        if (to != address(0) && to != issuer) {
            if (!registry.isEligible(to, policyId, REQUIRED_BITS)) revert NotEligible(to);
        }
        super._update(from, to, value);
    }
}
