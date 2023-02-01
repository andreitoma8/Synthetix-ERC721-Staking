import type { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import chai, { expect } from "chai";
import chaiAsPromised from "chai-as-promised";
import { ethers } from "hardhat";
import { BigNumber, ContractReceipt, ContractTransaction } from "ethers";
import { BigNumberish } from "ethers";

import { ERC721Staking, NFTCollection, RewardToken } from "../typechain-types";

chai.use(chaiAsPromised);

describe("ERC721Staking", () => {
  let stakingContract: ERC721Staking;
  let rewardToken: RewardToken;
  let nftCollection: NFTCollection;

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  const rewardsAmount = ethers.utils.parseEther("1000");
  const rewardsDuration = 60 * 60 * 24 * 7; // 1 week

  before(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();
  });

  beforeEach(async () => {
    const NFTCollection = await ethers.getContractFactory("NFTCollection");
    nftCollection = (await NFTCollection.deploy()) as NFTCollection;

    const RewardToken = await ethers.getContractFactory("RewardToken");
    rewardToken = (await RewardToken.deploy()) as RewardToken;

    const ERC721Staking = await ethers.getContractFactory("ERC721Staking");
    stakingContract = (await ERC721Staking.deploy(
      nftCollection.address,
      rewardToken.address
    )) as ERC721Staking;

    await rewardToken.mint(stakingContract.address, rewardsAmount);
  });

  describe("Constructor", () => {
    it("should set the correct owner", async () => {
      expect(await stakingContract.owner()).to.equal(deployer.address);
    });

    it("should set the correct reward token address", async () => {
      expect(await stakingContract.rewardToken()).to.equal(rewardToken.address);
    });

    it("should set the correct nft collection address", async () => {
      expect(await stakingContract.nftCollection()).to.equal(
        nftCollection.address
      );
    });
  });

  describe("Staking set-up", () => {
    it("should not allow a staking period to be initialized if the rewards amount is 0", async () => {
      await expect(
        stakingContract.startStakingPeriod(0, rewardsDuration)
      ).to.be.revertedWith("Staking: Amount must be greater than 0");
    });

    it("should not allow a staking period to be initialized if the rewards duration is 0", async () => {
      await expect(
        stakingContract.startStakingPeriod(rewardsAmount, 0)
      ).to.be.revertedWith("Staking: Duration must be greater than 0");
    });

    it("should correctly initialize a staking period", async () => {
      expect(
        await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration)
      )
        .to.emit(stakingContract, "RewardsDurationUpdated")
        .withArgs(rewardsDuration)
        .to.emit(stakingContract, "RewardAdded")
        .withArgs(rewardsAmount);

      expect(await stakingContract.lastUpdateTime()).to.equal(
        (await ethers.provider.getBlock("latest")).timestamp
      );
      expect(await stakingContract.rewardsDuration()).to.equal(rewardsDuration);
      expect(await stakingContract.rewardRate()).to.equal(
        rewardsAmount.div(rewardsDuration)
      );
      expect(await stakingContract.periodFinish()).to.equal(
        (await ethers.provider.getBlock("latest")).timestamp + rewardsDuration
      );
    });

    it("should not allow a staking period to be initialized if one is already active", async () => {
      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);

      await expect(
        stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration)
      ).to.be.revertedWith(
        "Staking: Previous rewards period must be complete before changing the duration for the new period"
      );
    });

    it("should not allow a staking period to be initialized if the rewards amount is bigger than contract balance", async () => {
      await expect(
        stakingContract.startStakingPeriod(
          rewardsAmount.add(ethers.utils.parseEther("1")),
          rewardsDuration
        )
      ).to.be.revertedWith("Staking: Provided reward too high");
    });

    it("should not allow to add reward amount if there is no active staking period", async () => {
      await expect(
        stakingContract.addRewardAmount(rewardsAmount)
      ).to.be.revertedWith(
        "Staking: Rewards period must be ongoing to add more rewards"
      );
    });

    it("should not allow to add reward amount if the rewards amount is 0", async () => {
      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);

      await expect(stakingContract.addRewardAmount(0)).to.be.revertedWith(
        "Staking: Amount must be greater than 0"
      );
    });

    it("should not allow to add reward amount if the rewards amount is bigger than contract balance", async () => {
      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);

      await expect(
        stakingContract.addRewardAmount(ethers.utils.parseEther("1"))
      ).to.be.revertedWith("Staking: Provided reward too high");
    });

    it("should add reward to the total rewards", async () => {
      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);
      const rewardRate = await stakingContract.rewardRate();

      await ethers.provider.send("evm_increaseTime", [rewardsDuration / 2]);
      await ethers.provider.send("evm_mine", []);

      await rewardToken.mint(stakingContract.address, rewardsAmount);

      const tx = await stakingContract.addRewardAmount(rewardsAmount);
      const receipt = await tx.wait();
      const txTimestamp = (await ethers.provider.getBlock(receipt.blockNumber))
        .timestamp;

      const stakingTimeLeft = (await stakingContract.periodFinish()).sub(
        txTimestamp
      );

      const leftoverRewards = stakingTimeLeft.mul(rewardRate);

      expect(await stakingContract.rewardRate()).to.equal(
        leftoverRewards.add(rewardsAmount).div(stakingTimeLeft)
      );
    });
  });

  describe("Staking", () => {
    beforeEach(async () => {
      await nftCollection.mint(alice.address, 3);
      await nftCollection
        .connect(alice)
        .setApprovalForAll(stakingContract.address, true);
    });

    it("should not allow to stake if array param is empty", async () => {
      await expect(stakingContract.connect(alice).stake([])).to.be.revertedWith(
        "Staking: No tokenIds provided"
      );
    });

    it("should stake correctly", async () => {
      const tokensOfAlice = await nftCollection.tokensOfOwner(alice.address);
      const totalStakedSupply = await stakingContract.totalStakedSupply();

      await expect(stakingContract.connect(alice).stake(tokensOfAlice))
        .to.emit(stakingContract, "Staked")
        .withArgs(alice.address, tokensOfAlice);

      expect(
        await nftCollection.tokensOfOwner(stakingContract.address)
      ).to.deep.equal(tokensOfAlice);
      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      expect(aliceStakeInfo[0]).to.deep.equal(tokensOfAlice);
      for (let i = 0; i < tokensOfAlice.length; i++) {
        expect(
          await stakingContract.stakedAssets(tokensOfAlice[i])
        ).to.deep.equal(alice.address);
      }
      expect(await stakingContract.totalStakedSupply()).to.equal(
        totalStakedSupply.add(tokensOfAlice.length)
      );
    });
  });

  describe("Withdrawing", () => {
    beforeEach(async () => {
      await nftCollection.mint(alice.address, 3);
      await nftCollection
        .connect(alice)
        .setApprovalForAll(stakingContract.address, true);
      await stakingContract
        .connect(alice)
        .stake(await nftCollection.tokensOfOwner(alice.address));
    });

    it("should not allow to withdraw if array param is empty", async () => {
      await expect(
        stakingContract.connect(alice).withdraw([])
      ).to.be.revertedWith("Staking: No tokenIds provided");
    });

    it("should not allow to withdraw if array param contains non-staked tokens", async () => {
      await expect(stakingContract.connect(alice).withdraw([7])).to.be.reverted;
    });

    it("should not allow withdrawing someone else's staked tokens", async () => {
      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);

      await expect(
        stakingContract.connect(bob).withdraw(aliceStakeInfo[0])
      ).to.be.revertedWith("Staking: Not the staker of the token");
    });

    it("should withdraw correctly", async () => {
      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      const aliceStakedTokens = aliceStakeInfo[0];
      const totalStakedSupply = await stakingContract.totalStakedSupply();

      await expect(stakingContract.connect(alice).withdraw(aliceStakedTokens))
        .to.emit(stakingContract, "Withdrawn")
        .withArgs(alice.address, aliceStakedTokens);

      expect(await nftCollection.tokensOfOwner(alice.address)).to.deep.equal(
        aliceStakedTokens
      );
      expect(await stakingContract.totalStakedSupply()).to.equal(
        totalStakedSupply.sub(aliceStakedTokens.length)
      );
      for (let i = 0; i < aliceStakedTokens.length; i++) {
        expect(
          await stakingContract.stakedAssets(aliceStakedTokens[i])
        ).to.deep.equal(ethers.constants.AddressZero);
      }
      expect(await stakingContract.userStakeInfo(alice.address)).to.deep.equal([
        [],
        0,
      ]);
    });

    it("should withdraw correctly when just a couple of tokens are withdrawn", async () => {
      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      const aliceStakedTokens = aliceStakeInfo[0];
      const totalStakedSupply = await stakingContract.totalStakedSupply();

      await stakingContract.connect(alice).withdraw([aliceStakedTokens[0]]);

      expect(await nftCollection.tokensOfOwner(alice.address)).to.deep.equal([
        aliceStakedTokens[0],
      ]);
      expect(await stakingContract.totalStakedSupply()).to.equal(
        totalStakedSupply.sub(1)
      );
      expect(
        await stakingContract.stakedAssets(aliceStakedTokens[0])
      ).to.deep.equal(ethers.constants.AddressZero);

      const newAliceStakeInfo = await stakingContract.userStakeInfo(
        alice.address
      );
      const newAliceStakedTokens = newAliceStakeInfo[0];
      expect(newAliceStakedTokens).to.have.lengthOf(
        newAliceStakedTokens.length
      );
      expect(newAliceStakedTokens).to.not.include(aliceStakedTokens[0]);
      for (let i = 0; i < newAliceStakedTokens.length; i++) {
        expect(newAliceStakedTokens).to.deep.include(aliceStakedTokens[i + 1]);
      }
    });

    it("should withdraw correcly form withdraw all", async () => {
      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      const aliceStakedTokens = aliceStakeInfo[0];
      const totalStakedSupply = await stakingContract.totalStakedSupply();

      await stakingContract.connect(alice).withdrawAll();

      expect(await nftCollection.tokensOfOwner(alice.address)).to.deep.equal(
        aliceStakedTokens
      );
      expect(await stakingContract.totalStakedSupply()).to.equal(
        totalStakedSupply.sub(aliceStakedTokens.length)
      );
      for (let i = 0; i < aliceStakedTokens.length; i++) {
        expect(
          await stakingContract.stakedAssets(aliceStakedTokens[i])
        ).to.deep.equal(ethers.constants.AddressZero);
      }
      expect(await stakingContract.userStakeInfo(alice.address)).to.deep.equal([
        [],
        0,
      ]);
    });
  });
});
