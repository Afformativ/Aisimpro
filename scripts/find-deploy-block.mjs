import { ethers } from 'ethers';

const p = new ethers.JsonRpcProvider('https://rpc-amoy.polygon.technology');
const cur = await p.getBlockNumber();
console.log('Current block:', cur);

const contract = new ethers.Contract('0x3920dFdD3cb6C254f2FA9783d0b6c60F19832198', [
  'event OreExtracted(bytes32 indexed id, uint8 metal, address indexed custodian, string mineId, string originCountry, string mineralType, uint256 extractedAt, uint256 weightGrams, string estimatedGrade)',
  'event BarRefined(bytes32 indexed barId, bytes32[] oreIds, uint8 metal, address indexed custodian, string refineryId, uint256 refinedAt, uint256 outputWeightGrams, uint256 finenessPPT, string barSerialNumber)',
  'event ProductCertified(bytes32 indexed productId, bytes32 indexed barId, uint8 metal, address indexed custodian, string assayerId, uint256 certifiedAt, uint256 weightGrams, uint256 finenessPPT, string hallmark, string sku, string productType)',
], p);

// Scan last ~5 days (200k blocks at 2s/block)
const startFrom = cur - 200000;
let oreCount = 0, barCount = 0, prodCount = 0;
let earliestBlock = Infinity;

for (let from = startFrom; from < cur; from += 10000) {
  const to = Math.min(from + 9999, cur);
  try {
    const oreLogs = await contract.queryFilter(contract.filters.OreExtracted(), from, to);
    const barLogs = await contract.queryFilter(contract.filters.BarRefined(), from, to);
    const prodLogs = await contract.queryFilter(contract.filters.ProductCertified(), from, to);
    for (const l of [...oreLogs, ...barLogs, ...prodLogs]) {
      if (l.blockNumber < earliestBlock) earliestBlock = l.blockNumber;
    }
    oreCount += oreLogs.length;
    barCount += barLogs.length;
    prodCount += prodLogs.length;
    if (oreLogs.length || barLogs.length || prodLogs.length) {
      console.log(`  Block ${from}-${to}: ${oreLogs.length} ores, ${barLogs.length} bars, ${prodLogs.length} products`);
    }
  } catch (e) {
    console.log(`  Block ${from}-${to}: error - ${e.message.slice(0, 80)}`);
  }
}
console.log(`\nTotal: ${oreCount} ores, ${barCount} bars, ${prodCount} products`);
console.log(`Earliest event block: ${earliestBlock === Infinity ? 'none' : earliestBlock}`);
console.log(`\nSuggested TRACEABILITY_DEPLOY_BLOCK=${earliestBlock === Infinity ? startFrom : earliestBlock - 1}`);
