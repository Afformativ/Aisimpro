require("dotenv/config");
require("@nomicfoundation/hardhat-toolbox");

const PRIVATE_KEY =
  process.env.PRIVATE_KEY ||
  "0x0000000000000000000000000000000000000000000000000000000000000001";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
    },
    amoy: {
      url: process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology",
      chainId: 80002,
      accounts: [PRIVATE_KEY],
      gasPrice: 30_000_000_000,   // 30 gwei — keeps deploy cost under 0.1 POL
    },
    "zkevm-testnet": {
      url:
        process.env.ZKEVM_RPC_URL || "https://rpc.cardona.zkevm-rpc.com",
      chainId: 2442,
      accounts: [PRIVATE_KEY],
    },
  },
  paths: {
    sources: "./contracts",
    scripts: "./scripts",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
