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

  const rewardsAmount = ethers.utils.parseEther("100");
  const rewardsDuration = 60 * 60 * 24 * 7; // 1 week

  // 0.001 token amount error margin for rewards calculations (due to rounding errors and blockchain time manipulation)
  const rewardsErrorMargin = ethers.utils.parseEther("0.001");

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

  describe.only("Rewards", () => {
    beforeEach(async () => {

      await nftCollection.mint(alice.address, 1);
      await nftCollection
        .connect(alice)
        .setApprovalForAll(stakingContract.address, true);
    });

    it("should claim rewards correctly for one total staker", async () => {
      await stakingContract
      .connect(alice)
      .stake(await nftCollection.tokensOfOwner(alice.address));

      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);

      await ethers.provider.send("evm_increaseTime", [rewardsDuration + 1]);
      await ethers.provider.send("evm_mine", []);

      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      const aliceStakedTokens = aliceStakeInfo[0];
      const aliceRewards = aliceStakeInfo[1];

      await expect(stakingContract.connect(alice).claimRewards())
        .to.emit(stakingContract, "RewardPaid")
        .withArgs(alice.address, aliceRewards);

      expect(await stakingContract.userStakeInfo(alice.address)).to.deep.equal([
        aliceStakedTokens,
        0,
      ]);
    });

    it("should calculate rewards correctly", async () => {
      await stakingContract
        .connect(alice)
        .stake(await nftCollection.tokensOfOwner(alice.address));
        
      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);

      await ethers.provider.send("evm_increaseTime", [rewardsDuration / 2]);
      await ethers.provider.send("evm_mine", []);

      const rewardsForDuration = await stakingContract.getRewardForDuration();

      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      const aliceRewards = aliceStakeInfo[1];

      expect(aliceRewards).to.be.within(rewardsForDuration.sub(rewardsErrorMargin).div(2), rewardsForDuration.add(rewardsErrorMargin).div(2));
    });

    it("should calculate rewards correctly for multiple stakers", async () => {
      await nftCollection.mint(bob.address, 2);
      await nftCollection.connect(bob).setApprovalForAll(stakingContract.address, true);

      // Alice stakes 1 token for the entire rewards duration
      await stakingContract
        .connect(alice)
        .stake(await nftCollection.tokensOfOwner(alice.address));

      // Bob stakes 2 tokens for the entire rewards duration
      await stakingContract
        .connect(bob)
        .stake(await nftCollection.tokensOfOwner(bob.address));

      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);

      await ethers.provider.send("evm_increaseTime", [rewardsDuration]);
      await ethers.provider.send("evm_mine", []);

      const rewardsForDuration = await stakingContract.getRewardForDuration();

      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      const aliceRewards = aliceStakeInfo[1];

      const bobStakeInfo = await stakingContract.userStakeInfo(bob.address);
      const bobRewards = bobStakeInfo[1];
      
      expect(aliceRewards).to.be.within(rewardsForDuration.sub(rewardsErrorMargin).div(3), rewardsForDuration.add(rewardsErrorMargin).div(3));
      expect(bobRewards).to.be.within(rewardsForDuration.sub(rewardsErrorMargin).mul(2).div(3), rewardsForDuration.add(rewardsErrorMargin).mul(2).div(3));
    });

    it("should calculate rewards correctly for multiple stakers with different stake durations", async () => {
      await nftCollection.mint(bob.address, 2);
      await nftCollection.connect(bob).setApprovalForAll(stakingContract.address, true);

      await nftCollection.mint(carol.address, 3);
      await nftCollection.connect(carol).setApprovalForAll(stakingContract.address, true);

      const tokensOfAlice = await nftCollection.tokensOfOwner(alice.address);
      const tokensOfBob = await nftCollection.tokensOfOwner(bob.address);
      const tokensOfCarol = await nftCollection.tokensOfOwner(carol.address);

      // Dividing the staking period into 4 windows

      // Alice stakes 1 token => Alice gets all of rewards in this window (1/4 of total rewards)
      await stakingContract
        .connect(alice)
        .stake(tokensOfAlice);
        
      await stakingContract.startStakingPeriod(rewardsAmount, rewardsDuration);
      const rewardsForDuration = await stakingContract.getRewardForDuration();

      await ethers.provider.send("evm_increaseTime", [rewardsDuration / 4]);
      await ethers.provider.send("evm_mine", []);

      // Bob stakes 2 tokens => Bob 2/3 of rewards in this window (2/3 of 1/4 of total rewards)
      // Alice still has 1 token staked => Alice gets 1/3 of rewards in this window (1/3 of 1/4 of total rewards)
      await stakingContract
        .connect(bob)
        .stake(tokensOfBob);

      await ethers.provider.send("evm_increaseTime", [rewardsDuration / 4]);

      // Carol stakes 2 tokens and Alice unstakes 1 token
      // Carol gets 1/2 of rewards in this window (1/2 of 1/4 of total rewards)
      // Alice gets no more rewards since she withdrew her token
      await stakingContract
        .connect(carol)
        .stake(tokensOfCarol.slice(0, 2));
      await stakingContract
        .connect(alice)
        .withdraw(tokensOfAlice);

      await ethers.provider.send("evm_increaseTime", [rewardsDuration / 4]);
      await ethers.provider.send("evm_mine", []);

      // Bob unstakes 2 tokens and Carol stakes 1 token
      // Carol gets all of the rewards in this window (1/4 of total rewards)
      await stakingContract
        .connect(bob)
        .withdraw(tokensOfBob);
      await stakingContract
        .connect(carol)
        .stake(tokensOfCarol.slice(-1));

      await ethers.provider.send("evm_increaseTime", [rewardsDuration / 4]);
      await ethers.provider.send("evm_mine", []);

      const aliceStakeInfo = await stakingContract.userStakeInfo(alice.address);
      const aliceRewards = aliceStakeInfo[1];

      const bobStakeInfo = await stakingContract.userStakeInfo(bob.address);
      const bobRewards = bobStakeInfo[1];

      const carolStakeInfo = await stakingContract.userStakeInfo(carol.address);
      const carolRewards = carolStakeInfo[1];

      // Alice should have received 33.33% of the total rewards
      expect(aliceRewards).to.be.within(rewardsForDuration.div(3).sub(rewardsErrorMargin), rewardsForDuration.div(3).add(rewardsErrorMargin));

      // Bob should have received 29.16% of the total rewards
      expect(bobRewards).to.be.within(rewardsForDuration.div(6).add(rewardsForDuration.div(8)).sub(rewardsErrorMargin), rewardsForDuration.div(6).add(rewardsForDuration.div(8)).add(rewardsErrorMargin));

      // Carol should have received 37.50% of the total rewards
      expect(carolRewards).to.be.within(rewardsForDuration.div(8).add(rewardsForDuration).div(4).sub(rewardsErrorMargin), rewardsForDuration.div(8).add(rewardsForDuration.div(4)).add(rewardsErrorMargin));
    });
  });
});
