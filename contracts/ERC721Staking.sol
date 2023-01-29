// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @author Andrei Toma
/// @title ERC721 NFT Staking Contract
/// @notice Staking Contract that uses the Synthetix Staking model to distribute ERC20 token rewards in a dynamic way, proportionally based on the amount of ERC721 tokens staked by each staker at any given time.

contract ERC721Staking is ERC721Holder, ReentrancyGuard, Ownable {
  using SafeERC20 for IERC20;

  IERC20 public rewardToken;
  IERC721 public nftCollection;

  uint256 public periodFinish;
  uint256 public rewardRate;
  uint256 public rewardsDuration;
  uint256 public lastUpdateTime;
  uint256 private rewardPerTokenStored;
  uint256 public totalStakedSupply;

  mapping(address => uint256) public userRewardPerTokenPaid;
  mapping(address => uint256) private rewards;
  mapping(uint256 => address) public stakedAssets;
  mapping(address => uint256[]) private tokensStaked;

  /// @param _nftCollection the address of the ERC721 Contract
  /// @param _rewardToken the address of the ERC20 token used for rewards
  constructor(address _nftCollection, address _rewardToken) {
    nftCollection = IERC721(_nftCollection);
    rewardToken = IERC20(_rewardToken);
  }

  /// @notice functon called by the users to Stake NFTs
  /// @param tokenIds array of Token IDs of the NFTs to be staked
  /// @dev the Token IDs have to be prevoiusly approved for transfer in the ERC721 contract with the address of this contract
  function stake(
    uint256[] memory tokenIds
  ) external nonReentrant updateReward(msg.sender) {
    require(tokenIds.length != 0, "Staking: No tokenIds provided");

    uint256 amount = tokenIds.length;
    for (uint256 i = 0; i < amount; i += 1) {
      nftCollection.safeTransferFrom(msg.sender, address(this), tokenIds[i]);

      stakedAssets[tokenIds[i]] = msg.sender;
      tokensStaked[msg.sender].push(tokenIds[i]);
    }
    totalStakedSupply += amount;

    emit Staked(msg.sender, amount, tokenIds);
  }

  /// @notice function called by the user to Withdraw NFTs from staking
  /// @param tokenIds array of Token IDs of the NFTs to be withdrawn
  function withdraw(
    uint256[] memory tokenIds
  ) public nonReentrant updateReward(msg.sender) {
    require(tokenIds.length != 0, "Staking: No tokenIds provided");

    uint256 amount = tokenIds.length;
    for (uint256 i = 0; i < amount; i += 1) {
      require(
        stakedAssets[tokenIds[i]] == msg.sender,
        "Staking: Not the staker of the token"
      );

      nftCollection.safeTransferFrom(address(this), msg.sender, tokenIds[i]);

      stakedAssets[tokenIds[i]] = address(0);

      uint256 length = tokensStaked[msg.sender].length;
      for (uint256 j; j < length; ++j) {
        if (tokensStaked[msg.sender][j] == tokenIds[i]) {
          tokensStaked[msg.sender][j] = tokensStaked[msg.sender][length - 1];
          tokensStaked[msg.sender].pop();
          break;
        }
      }
    }
    totalStakedSupply -= amount;

    emit Withdrawn(msg.sender, amount, tokenIds);
  }

  /// @notice function called by the user to claim his accumulated rewards
  function claimRewards() public nonReentrant updateReward(msg.sender) {
    uint256 reward = rewards[msg.sender];
    if (reward > 0) {
      rewards[msg.sender] = 0;

      rewardToken.safeTransfer(msg.sender, reward);

      emit RewardPaid(msg.sender, reward);
    }
  }

  /// @notice function called by the user to withdraw all NFTs and claim the rewards in one transaction
  function withdrawAll() external {
    withdraw(tokensStaked[msg.sender]);
    claimRewards();
  }

  /// @notice function useful for Front End to see the stake and rewards for users
  /// @param _user the address of the user to get informations for
  /// @return _tokensStaked an array of NFT Token IDs that are staked by the user
  /// @return _availableRewards the rewards accumulated by the user
  function userStakeInfo(
    address _user
  )
    public
    view
    returns (uint256[] memory _tokensStaked, uint256 _availableRewards)
  {
    _tokensStaked = tokensStaked[_user];
    _availableRewards = calculateRewards(_user);
  }

  /// @notice getter function to get the reward per second for staking one NFT
  /// @return _rewardPerToken the amount of token per second rewarded for staking one NFT
  function getRewardPerToken() external view returns (uint256 _rewardPerToken) {
    return rewardRate / totalStakedSupply;
  }

  /// @notice function for the Owner of the Contract to start a Staking period and set the amount of ERC20 Tokens to be distributed as rewards in said period
  /// @param _amount the amount of Reward Tokens to be distributed
  /// @param _duration the duration in with the rewards will be distributed, in seconds
  /// @dev  the Staking Contract have to already own enough Rewards Tokens to distribute all the rewards, so make sure to send all the tokens to the contract before calling this function
  function startStakingPeriod(
    uint256 _amount,
    uint256 _duration
  ) external onlyOwner {
    require(_amount > 0, "Staking: Amount must be greater than 0");
    require(_duration > 0, "Staking: Duration must be greater than 0");
    require(
      block.timestamp > periodFinish,
      "Staking: Previous rewards period must be complete before changing the duration for the new period"
    );

    rewardsDuration = _duration;

    emit RewardsDurationUpdated(rewardsDuration);

    rewardRate = _amount / rewardsDuration;

    uint256 balance = rewardToken.balanceOf(address(this));
    require(
      rewardRate <= balance / rewardsDuration,
      "Staking: Provided reward too high"
    );

    lastUpdateTime = block.timestamp;
    periodFinish = block.timestamp + rewardsDuration;

    emit RewardAdded(_amount);
  }

  /// @return _lastRewardsApplicable the last time the rewards were applicable, returns block.timestamp if the rewards period is not ended
  function lastTimeRewardApplicable()
    public
    view
    returns (uint256 _lastRewardsApplicable)
  {
    return block.timestamp < periodFinish ? block.timestamp : periodFinish;
  }

  /// @notice calculates the rewards per token for the current time whenever a new deposit/withdraw is made to keep track of the correct token distribution between stakers
  function rewardPerToken() public view returns (uint256) {
    if (totalStakedSupply == 0) {
      return rewardPerTokenStored;
    }
    return
      rewardPerTokenStored +
      (((lastTimeRewardApplicable() - lastUpdateTime) * rewardRate * 1e18) /
        totalStakedSupply);
  }

  /// @notice used to calculate the earned rewards for a user
  /// @param _user the address of the user to calculate available rewards for
  /// @return _rewards the amount of tokens available as rewards for the passed address
  function calculateRewards(
    address _user
  ) public view returns (uint256 _rewards) {
    return
      ((tokensStaked[_user].length *
        (rewardPerToken() - userRewardPerTokenPaid[_user])) / 1e18) +
      rewards[_user];
  }

  /// @return _distributedTokens the total amount of ERC20 Tokens distributed as rewards for the set staking period
  function getRewardForDuration()
    external
    view
    returns (uint256 _distributedTokens)
  {
    return rewardRate * rewardsDuration;
  }

  /// @notice fuction used by the Owner to add rewards to be distributed in the current staking period. Rewards can be added multiple times in the same staking period; this will increase the rewards rate for the active period.
  /// @param _amount the amount of tokens to be added to the rewards pool
  /// @dev the Staking Contract have to already own enough Rewards Tokens to distribute all the rewards, so make sure to send all the tokens to the contract before calling this function
  function addRewardAmount(
    uint256 _amount
  ) external onlyOwner updateReward(address(0)) {
    require(
      block.timestamp < periodFinish,
      "Staking: Rewards period must be ongoing to add more rewards"
    );

    uint256 remaining = periodFinish - block.timestamp;
    uint256 leftover = remaining * rewardRate;
    rewardRate = (_amount + leftover) / remaining;

    uint256 balance = rewardToken.balanceOf(address(this));
    require(
      rewardRate <= balance / remaining,
      "Staking: Provided reward too high"
    );

    lastUpdateTime = block.timestamp;

    emit RewardAdded(_amount);
  }

  /// @notice modifier used to keep track of the dynamic rewards for user each time a deposit or withdrawal is made
  modifier updateReward(address account) {
    rewardPerTokenStored = rewardPerToken();
    lastUpdateTime = lastTimeRewardApplicable();
    if (account != address(0)) {
      rewards[account] = calculateRewards(account);
      userRewardPerTokenPaid[account] = rewardPerTokenStored;
    }
    _;
  }

  event RewardAdded(uint256 reward);
  event Staked(address indexed user, uint256 amount, uint256[] tokenIds);
  event Withdrawn(address indexed user, uint256 amount, uint256[] tokenIds);
  event RewardPaid(address indexed user, uint256 reward);
  event RewardsDurationUpdated(uint256 newDuration);
}
