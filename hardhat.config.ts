import "@nomicfoundation/hardhat-chai-matchers";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "hardhat-gas-reporter";
import "solidity-coverage";

import { HardhatUserConfig, task } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const NETWORK_GAS_PRICE: Partial<Record<string, number>> = {
  // "mainnet": ethers.utils.parseUnits("10", "gwei").toNumber(),
  // "goerli": ethers.utils.parseUnits("10", "gwei").toNumber(),
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.16",
        settings: {
          optimizer: {
            enabled: true,
            runs: 800,
            details: {
              yul: true,
            },
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      chainId: 31337,
      forking: {
        url: process.env.ETH_MAINNET_URL || "",
        // The Hardhat network will by default fork from the latest mainnet block
        // To pin the block number, specify it below
        // You will need access to a node with archival data for this to work!
        // blockNumber: 14743877,
        // If you want to do some forking, set `enabled` to true
        enabled: false,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    goerli: {
      chainId: 5,
      url: process.env.ETH_GOERLI_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      gasPrice: NETWORK_GAS_PRICE["goerli"] || "auto",
      ...(process.env.FIREBLOCKS === "true" && {
        fireblocks: {
          privateKey:
            process.env.ETH_GOERLI_FIREBLOCKS_API_PRIVATE_KEY_PATH || "",
          apiKey: process.env.ETH_GOERLI_FIREBLOCKS_API_KEY || "",
          vaultAccountIds: process.env.ETH_GOERLI_FIREBLOCKS_VAULT_ACCOUNT_IDS,
        },
      }),
    },
    main: {
      chainId: 1,
      url: process.env.ETH_MAINNET_URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      gasPrice: NETWORK_GAS_PRICE["mainnet"] || "auto",
      ...(process.env.FIREBLOCKS === "true" && {
        fireblocks: {
          privateKey:
            process.env.ETH_MAINNET_FIREBLOCKS_API_PRIVATE_KEY_PATH || "",
          apiKey: process.env.ETH_MAINNET_FIREBLOCKS_API_KEY || "",
          vaultAccountIds: process.env.ETH_MAINNET_FIREBLOCKS_VAULT_ACCOUNT_IDS,
        },
      }),
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
    strict: true,
    only: [],
    except: [],
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      goerli: process.env.ETHERSCAN_API_KEY || "",
    },
  },
};

export default config;
