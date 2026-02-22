import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.17",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    lukso: {
      url: "https://rpc.mainnet.lukso.network",
      chainId: 42,
      accounts: [PRIVATE_KEY],
    },
    luksoTestnet: {
      url: "https://rpc.testnet.lukso.network",
      chainId: 4201,
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: {
      lukso: "empty",         // Blockscout doesn't require a real API key
      luksoTestnet: "empty",
    },
    customChains: [
      {
        network: "lukso",
        chainId: 42,
        urls: {
          apiURL: "https://explorer.execution.mainnet.lukso.network/api",
          browserURL: "https://explorer.execution.mainnet.lukso.network",
        },
      },
      {
        network: "luksoTestnet",
        chainId: 4201,
        urls: {
          apiURL: "https://explorer.execution.testnet.lukso.network/api",
          browserURL: "https://explorer.execution.testnet.lukso.network",
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};

export default config;
