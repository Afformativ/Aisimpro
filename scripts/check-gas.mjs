import { ethers } from 'ethers';

const p = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
const WALLET = '0x3ef410c459e8525BfBdC557Ca36d2Bf264393649';
const CONTRACT = '0x3920dFdD3cb6C254f2FA9783d0b6c60F19832198';

// RPC suggestions
const feeData = await p.getFeeData();
console.log('--- RPC suggestions ---');
console.log('gasPrice:', ethers.formatUnits(feeData.gasPrice, 'gwei'), 'gwei');
console.log('maxPriorityFeePerGas:', feeData.maxPriorityFeePerGas ? ethers.formatUnits(feeData.maxPriorityFeePerGas, 'gwei') + ' gwei' : 'null');

// Latest block
const block = await p.getBlock('latest');
console.log('\nBlock:', block.number, '| baseFee:', ethers.formatUnits(block.baseFeePerGas || 0n, 'gwei'), 'gwei');

// Your wallet's txs - search from known events in contract
console.log('\n--- Your wallet transactions (last 2000 blocks) ---');
const latest = block.number;
const from = 34455100; // deploy block
const iface = new ethers.Interface([
  'event OreExtracted(bytes32 indexed oreId, address indexed miner)',
  'event BarRefined(bytes32 indexed barId, address indexed refiner)',
  'event ProductCertified(bytes32 indexed productId, address indexed assayer)',
]);

// Get all logs from the contract in the range
const logs = await p.getLogs({ address: CONTRACT, fromBlock: from, toBlock: latest });
const seen = new Set();
for (const log of logs) {
  if (seen.has(log.transactionHash)) continue;
  seen.add(log.transactionHash);
  try {
    const tx = await p.getTransaction(log.transactionHash);
    const receipt = await p.getTransactionReceipt(log.transactionHash);
    if (!tx || !receipt) continue;
    const effPrice = receipt.gasPrice || receipt.effectiveGasPrice || 0n;
    const cost = ethers.formatEther(effPrice * receipt.gasUsed);
    console.log(
      'Block:', log.blockNumber,
      '| type:', tx.type,
      '| effective:', ethers.formatUnits(effPrice, 'gwei'), 'gwei',
      '| gasUsed:', Number(receipt.gasUsed),
      '| cost:', cost, 'POL',
      '| maxPriority:', tx.maxPriorityFeePerGas ? ethers.formatUnits(tx.maxPriorityFeePerGas, 'gwei') + ' gwei' : '-',
      tx.from.toLowerCase() === WALLET.toLowerCase() ? '← YOUR TX' : ''
    );
  } catch(e) { /* skip */ }
}
console.log('\nDone');
