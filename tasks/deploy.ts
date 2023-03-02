import { task } from "hardhat/config";

task("deploy", "Deploy the NFT Staking contract")
    .addParam("nft", "The address of the NFT contract")
    .addParam("token", "The address of the reward token contract")
    .addFlag("verify", "Verify the contract on Etherscan")
    .setAction(async (taskArgs, hre) => {
        const { nft, token, verify } = taskArgs;
        const [deployer] = await hre.ethers.getSigners();

        console.log("Deploying contracts with the account:", deployer.address);
        console.log("Account balance:", (await deployer.getBalance()).toString());

        const NFTStaking = await hre.ethers.getContractFactory("ERC721Staking");
        const nftStaking = await NFTStaking.deploy(nft, token);

        console.log("\n*** Deploying the NFT Staking contract ***");

        await nftStaking.deployed();

        console.log("\n*** NFT Staking contract deployed ***");
        console.log("NFT Staking contract address:", nftStaking.address);

        if (verify) {
            console.log("\n*** Verifying the NFT Staking contract ***");
            await nftStaking.deployTransaction.wait(5);
            try {
                await hre.run("verify:verify", {
                    address: nftStaking.address,
                    constructorArguments: [nft, token],
                });
            } catch (error: any) {
                if (error.message.toLowerCase().includes("already verified")) {
                    console.log("Already Verified!")
                } else {
                    console.log(error)
                }
            }
        }
    });