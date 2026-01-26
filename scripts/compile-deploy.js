#!/usr/bin/env node

/**
 * Compile and Deploy EventLogger Contract to Polygon Amoy Testnet
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import solc from 'solc';

const SOLIDITY_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract EventLogger {
    event HashAnchored(bytes32 indexed id, bytes32 hash, uint256 timestamp, address indexed sender);

    function logHash(bytes32 id, bytes32 hash) external {
        emit HashAnchored(id, hash, block.timestamp, msg.sender);
    }
}
`;

const AMOY_CONFIG = {
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  chainId: 80002,
  explorerUrl: 'https://amoy.polygonscan.com',
  name: 'Polygon Amoy Testnet'
};

function compileContract() {
  const input = {
    language: 'Solidity',
    sources: {
      'EventLogger.sol': {
        content: SOLIDITY_SOURCE
      }
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object']
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  
  if (output.errors) {
    const errors = output.errors.filter(e => e.severity === 'error');
    if (errors.length > 0) {
      console.error('Compilation errors:');
      errors.forEach(e => console.error(e.formattedMessage));
      process.exit(1);
    }
  }

  const contract = output.contracts['EventLogger.sol']['EventLogger'];
  return {
    abi: contract.abi,
    bytecode: '0x' + contract.evm.bytecode.object
  };
}

async function deploy() {
  console.log(' Compiling and Deploying EventLogger to Polygon Amoy Testnet...\n');

  if (!process.env.PRIVATE_KEY) {
    console.error(' PRIVATE_KEY not found in .env file');
    process.exit(1);
  }

  // Compile the contract
  console.log('Compiling contract...');
  const { abi, bytecode } = compileContract();
  console.log('Compiled successfully');
  console.log(`   ABI functions: ${abi.filter(a => a.type === 'function').map(a => a.name).join(', ')}`);

  try {
    const provider = new ethers.JsonRpcProvider(AMOY_CONFIG.rpcUrl);
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    
    console.log(`\n Network: ${AMOY_CONFIG.name}`);
    console.log(` Deployer: ${wallet.address}`);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(` Balance: ${ethers.formatEther(balance)} MATIC\n`);
    
    if (balance === 0n) {
      console.error(' No MATIC balance! Get test tokens from:');
      console.error('   https://faucet.polygon.technology/');
      process.exit(1);
    }

    console.log('Deploying contract...');
    
    const factory = new ethers.ContractFactory(abi, bytecode, wallet);
    const contract = await factory.deploy();
    
    console.log(`Transaction sent: ${contract.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation...');
    
    await contract.waitForDeployment();
    const contractAddress = await contract.getAddress();
    
    console.log('\n Contract deployed successfully!');
    console.log(` Contract Address: ${contractAddress}`);
    console.log(` Explorer: ${AMOY_CONFIG.explorerUrl}/address/${contractAddress}`);
    
    // Test the contract
    console.log('\n Testing contract...');
    const testId = ethers.keccak256(ethers.toUtf8Bytes('test:deployment'));
    const testHash = ethers.keccak256(ethers.toUtf8Bytes('hello-world'));
    
    console.log(`   ID: ${testId}`);
    console.log(`   Hash: ${testHash}`);
    
    const tx = await contract.logHash(testId, testHash);
    console.log(`Test TX sent: ${tx.hash}`);
    
    const receipt = await tx.wait();
    console.log(`Test confirmed in block ${receipt.blockNumber}`);
    console.log(`TX: ${AMOY_CONFIG.explorerUrl}/tx/${receipt.hash}`);
    
    console.log('\n Update your .env file:');
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
