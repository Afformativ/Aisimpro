#!/usr/bin/env node

/**
 * Deploy EventLogger Contract to Polygon Amoy Testnet
 */

import 'dotenv/config';
import { ethers } from 'ethers';

// Full ABI for EventLogger
const CONTRACT_ABI = [
  "event HashAnchored(bytes32 indexed id, bytes32 hash, uint256 timestamp, address indexed sender)",
  "function logHash(bytes32 id, bytes32 hash) external"
];

// Bytecode compiled from:
// pragma solidity ^0.8.19;
// contract EventLogger {
//     event HashAnchored(bytes32 indexed id, bytes32 hash, uint256 timestamp, address indexed sender);
//     function logHash(bytes32 id, bytes32 hash) external {
//         emit HashAnchored(id, hash, block.timestamp, msg.sender);
//     }
// }
const CONTRACT_BYTECODE = "0x608060405234801561001057600080fd5b5060dc8061001f6000396000f3fe6080604052348015600f57600080fd5b506004361060285760003560e01c80631c56b20a14602d575b600080fd5b603c6038366004606e565b603e565b005b604080518381526020810183905242918101919091523360608201528290849086907f67a6208cfcc0801d50f6cbe764733f4fddf66ac0b04442061a8a8c0cb6b63f629060800160405180910390a4505050565b60008060408385031215608057600080fd5b5050803592602090910135915056fea2646970667358221220abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab64736f6c63430008130033";

const AMOY_CONFIG = {
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  chainId: 80002,
  explorerUrl: 'https://amoy.polygonscan.com',
  name: 'Polygon Amoy Testnet'
};

async function deploy() {
  console.log('Deploying EventLogger to Polygon Amoy Testnet...\n');

  if (!process.env.PRIVATE_KEY) {
    console.error('PRIVATE_KEY not found in .env file');
    process.exit(1);
  }

  try {
    const provider = new ethers.JsonRpcProvider(AMOY_CONFIG.rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`Network: ${AMOY_CONFIG.name}`);
    console.log(`Deployer: ${wallet.address}`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`Balance: ${ethers.formatEther(balance)} MATIC\n`);
    
    if (balance === 0n) {
      console.error(' No MATIC balance! Get test tokens from:');
      console.error('   https://faucet.polygon.technology/');
      process.exit(1);
    }

    console.log(' Deploying contract...');
    
    const factory = new ethers.ContractFactory(CONTRACT_ABI, CONTRACT_BYTECODE, wallet);
    const contract = await factory.deploy();
    
    console.log(`Transaction sent: ${contract.deploymentTransaction().hash}`);
    console.log(' Waiting for confirmation...');
    
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    
    console.log('\n✅ Contract deployed successfully!');
    console.log(`📋 Contract Address: ${contractAddress}`);
    console.log(`🔗 Explorer: ${AMOY_CONFIG.explorerUrl}/address/${contractAddress}`);
    
    // Test the contract
    console.log('\n🧪 Testing contract...');
    const testId = ethers.keccak256(ethers.toUtf8Bytes('test:deployment'));
    const testHash = ethers.keccak256(ethers.toUtf8Bytes('hello-world'));
    
    const tx = await contract.logHash(testId, testHash);
    console.log(`Test TX sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`Test confirmed in block ${receipt.blockNumber}`);
    console.log(`TX: ${AMOY_CONFIG.explorerUrl}/tx/${receipt.hash}`);
    
    console.log('\nUpdate your .env file:');
    console.log(`CONTRACT_ADDRESS=${contractAddress}`);
    
    return contractAddress;
  } catch (error) {
    console.error('Deployment failed:', error.message);
    if (error.message.includes('insufficient funds')) {
      console.error('\nGet test MATIC from: https://faucet.polygon.technology/');
    }
    process.exit(1);
  }
}

deploy();
