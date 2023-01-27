// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title Mock Reward Token
 * @dev This is a mock reward token for testing purposes only
 */
contract RewardToken is ERC20 {
  /**
   *  @notice Contructor that initializes the name and symbol of the token
   */
  constructor() ERC20("Reward Token", "RTK") {}

  /**
   * @notice Mint tokens
   * @param _to the address to mint the tokens to
   * @param _amount the amount of tokens to mint
   */
  function mint(address _to, uint256 _amount) public {
    _mint(_to, _amount);
  }
}
