# ERC721 Staking Smart Contract

Inspired by [Synthetix's StakingRewards](https://github.com/Synthetixio/synthetix/blob/develop/contracts/StakingRewards.sol)

# Intro

To celebrate 100 Stars on my first Open Soruce [NFT Staking Smart Contract](https://github.com/andreitoma8/ERC721-Staking) I've chosen to come back to NFT Staking and solve some of the limitation my previous project has:

1. There is no end of the period for the rewards distribution.
1. The rewards are fixed and it's very expensive to modify them.

# How it works

The onwer of the contract can set up a period of time for the rewards distribution and the amount of rewards to be distributed. The rewards are distributed to the stakers based on the amount of NFTs they have staked and the amount of time they have staked them, so the APY is dynamic and depends on how many NFTs are staked at a given time.

If you want to know more about how the contract works from a technical perspective and understand the math behind it, you can view [SmartContractProgrammer](https://twitter.com/ProgrammerSmart)'s [video series](https://youtu.be/rXuDelwHLoo) on the subject.

# How to use

## Owner:

1. You will need to already have a NFT Collection deployed and a Reward Token deployed. You can find templates for both of them on some of my other projects:
    1. [ERC721 NFT Collection](https://github.com/andreitoma8/ERC721-Collection)
    1. [ERC20 Token](https://github.com/andreitoma8/ERC20-Token)
1. Deploy the contract and set the NFT Collection address and the Reward Token address.
1. Send the amount of Reward Tokens you want to distribute to the contract.
1. Set the rewards distribution period and the amount of rewards to be distributed.
1. After the current period ends, you can set a new period and amount of rewards to be distributed.

## Stakers:

1. Approve the contract to transfer your NFTs.
1. Stake your NFTs by calling the `stake` function.
1. See your staked NFT Token IDs and accrued rewards by calling the `userStakeInfo` function.
1. Call the `claimRewards` function to receive your rewards.
1. Call the `withdraw` function to unstake specific NFTs or the `withdrawAll` function to unstake all your NFTs and claim your rewards in one transaction.

### If this was helpful please consider donating: `0xA4Ad17ef801Fa4bD44b758E5Ae8B2169f59B666F`. Every bit helps me keep working on Open Source projects, and if you have any recommendations or suggestions for future projects, please let me know!

# Setup

## Install dependencies

```
yarn
```

## Change the `.env.example` file name to `.env` and populate it following the instructions:

```
# Optional for deploying and interacting with contracts using a private key:
PRIVATE_KEY=
# Optional Etherscan key, for verification of the contracts on Etherscan:
ETHERSCAN_API_KEY=
# Optionals RPC-URLs for interacting with Ethereum Mainnet and Goerli:
ETH_MAINNET_URL=
ETH_GOERLI_URL=
# Bool: optional for gas reports generated when running tests:
REPORT_GAS=
```

# Compile contracts

```

yarn hardhat compile

```

# Test

```

yarn hardhat test

```

# Deployment

## Available networks

-   Goerli: `--network goerli`
-   Ethereum Mainnet: `--network main`

## Set a fixed gas price

To set a fixed gas price edit the `hardhat.config.ts` file, adding a gas price for the wanted network. See the example below:

```typescript
const NETWORK_GAS_PRICE: Partial<Record<string, number>> = {
    mainnet: ethers.utils.parseUnits("20", "gwei").toNumber(),
    // "goerli": ethers.utils.parseUnits("10", "gwei").toNumber(),
};
```

## Deploy Staking Contract

```
yarn hardhat deploy --nft <NFT_COLLECTION_ADDRESS> --token <REWARD_TOKEN_ADDRESS> --network <NETWORK>
```

## Verification on Etherscan

If you also want to verify you contract, add the flag `--verify` in the deploy command like so:

```
yarn hardhat deploy --verify --nft <NFT_COLLECTION_ADDRESS> --token <REWARD_TOKEN_ADDRESS> --network <NETWORK>
```
