// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {FundToken} from "./FundToken.sol";
import {IEligibility} from "./interfaces/IEligibility.sol";

/// @title Subscription
/// @notice Demo subscription: an eligible caller receives a fixed amount of fund tokens.
///         Approval withdrawal is not here; revoke lives in the AttestationRegistry.
contract Subscription {
    error NotEligible();

    event Subscribed(address indexed subscriber, uint256 amount);

    FundToken public immutable token;
    uint256 public immutable demoAmount;

    constructor(FundToken token_, uint256 demoAmount_) {
        token = token_;
        demoAmount = demoAmount_;
    }

    function subscribe() external {
        IEligibility registry = token.registry();
        if (!registry.isEligible(msg.sender, token.policyId(), token.REQUIRED_BITS())) revert NotEligible();
        token.mint(msg.sender, demoAmount);
        emit Subscribed(msg.sender, demoAmount);
    }
}
