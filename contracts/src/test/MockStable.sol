// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Unrestricted 6-decimal stablecoin stand-in for the demo pool's second currency. Not for deployment
///         beyond testnets: anyone can mint.
contract MockStable is ERC20 {
    constructor() ERC20("Mock Stable", "mUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
