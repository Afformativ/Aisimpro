import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { ethers } from 'ethers';

const ABI = [
  'function ADMIN_ROLE() view returns (bytes32)',
  'function MINER_ROLE() view returns (bytes32)',
  'function REFINER_ROLE() view returns (bytes32)',
  'function ASSAYER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function registerOre(uint8 metal,string mineId,string originCountry,string mineralType,uint256 extractedAt,uint256 weightGrams,string estimatedGrade) returns (bytes32)',
  'function refine(bytes32[] oreIds,uint8 metal,string refineryId,uint256 refinedAt,uint256 outputWeightGrams,uint256 finenessPPT,string barSerialNumber) returns (bytes32)',
  'function certify(bytes32 inputBarId,uint8 metal,string assayerId,uint256 certifiedAt,uint256 weightGrams,uint256 finenessPPT,string hallmark,string sku,string productType) returns (bytes32)',
  'function getRawOre(bytes32 id) view returns ((bytes32 id,uint8 metal,string mineId,string originCountry,string mineralType,uint256 extractedAt,uint256 weightGrams,string estimatedGrade,address currentCustodian,bool exists,bytes32 documentRoot,string evidenceManifestCID))',
  'function getRefinedBar(bytes32 id) view returns ((bytes32 id,uint8 metal,bytes32[] inputOreIds,string refineryId,uint256 refinedAt,uint256 outputWeightGrams,uint256 finenessPPT,string barSerialNumber,address currentCustodian,bool exists))',
  'function getCertifiedProduct(bytes32 id) view returns ((bytes32 id,bytes32 inputBarId,uint8 metal,string assayerId,uint256 certifiedAt,uint256 weightGrams,uint256 finenessPPT,string hallmark,string sku,string productType,address currentCustodian,bool exists,bytes32 documentRoot,string evidenceManifestCID,string conformityCredentialURI))'
];

const FLOWS = parsePositiveInt(process.argv[2], Number(process.env.LEGACY_BENCH_FLOWS) || 5);
const RPC_URL = process.env.TRACEABILITY_RPC_URL || process.env.ARTICLE_RPC_URL;
const CONTRACT_ADDRESS = process.env.TRACEABILITY_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const METAL_GOLD = 0;
const COST_BUFFER_MULTIPLIER = 1.2;
const RUN_TAG = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);

if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY) {
  throw new Error('Missing TRACEABILITY_RPC_URL/TRACEABILITY_CONTRACT_ADDRESS/PRIVATE_KEY');
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

await assertRoles();

const balanceBefore = await provider.getBalance(wallet.address);
const feeData = await provider.getFeeData();
const gasProfile = await estimateGasProfile();
const estimatedCostWei = gasProfile.totalGas * gasProfile.maxFeePerGas * BigInt(FLOWS);
const recommendedCostWei = (estimatedCostWei * BigInt(Math.round(COST_BUFFER_MULTIPLIER * 100))) / 100n;

if (balanceBefore < recommendedCostWei) {
  const shortfallWei = recommendedCostWei - balanceBefore;
  console.log(JSON.stringify({
    ok: false,
    reason: 'INSUFFICIENT_FUNDS',
    flowsRequested: FLOWS,
    wallet: wallet.address,
    contractAddress: CONTRACT_ADDRESS,
    network: 'amoy',
    balancePol: formatEth(balanceBefore),
    estimatedFlowCostPol: formatEth(gasProfile.totalGas * gasProfile.maxFeePerGas),
    estimatedRequiredPol: formatEth(recommendedCostWei),
    estimatedAdditionalPolNeeded: formatEth(shortfallWei),
    gasProfile: {
      registerOreGas: gasProfile.registerOreGas.toString(),
      refineGas: gasProfile.refineGas.toString(),
      certifyGas: gasProfile.certifyGas.toString(),
      maxFeePerGasGwei: formatGwei(gasProfile.maxFeePerGas)
    }
  }, null, 2));
  process.exit(2);
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const txs = [];
const flowSummaries = [];
const startedAt = Date.now();

for (let i = 0; i < FLOWS; i += 1) {
  const sample = buildFlowSample(i);
  const flowStartedAt = Date.now();

  const oreTx = await sendStageTx(
    'registerOre',
    contract.registerOre,
    [
      METAL_GOLD,
      sample.mineId,
      sample.originCountry,
      sample.mineralType,
      sample.extractedAt,
      sample.inputWeightGrams,
      sample.estimatedGrade
    ]
  );

  const oreId = computeOreId(sample);

  const refineTx = await sendStageTx(
    'refine',
    contract.refine,
    [
      [oreId],
      METAL_GOLD,
      sample.refineryId,
      sample.refinedAt,
      sample.outputWeightGrams,
      sample.finenessPPT,
      sample.barSerialNumber
    ]
  );

  const barId = computeBarId(sample, oreId);

  const certifyTx = await sendStageTx(
    'certify',
    contract.certify,
    [
      barId,
      METAL_GOLD,
      sample.assayerId,
      sample.certifiedAt,
      sample.outputWeightGrams,
      sample.finenessPPT,
      sample.hallmark,
      sample.sku,
      sample.productType
    ]
  );

  const productId = computeProductId(sample, barId);
  const [ore, bar, product] = await Promise.all([
    contract.getRawOre(oreId),
    contract.getRefinedBar(barId),
    contract.getCertifiedProduct(productId)
  ]);

  flowSummaries.push({
    flowIndex: i + 1,
    elapsedMs: Date.now() - flowStartedAt,
    oreId,
    barId,
    productId,
    inputWeightGrams: sample.inputWeightGrams,
    outputWeightGrams: sample.outputWeightGrams,
    derivedYield: Number(bar.outputWeightGrams) / Number(ore.weightGrams),
    currentCustodian: product.currentCustodian
  });

  txs.push(oreTx, refineTx, certifyTx);
}

const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(3));
const balanceAfter = await provider.getBalance(wallet.address);
const totalTxCostWei = balanceBefore - balanceAfter;
const throughputTxPerSecond = Number((txs.length / elapsedSeconds).toFixed(3));
const meanLatencyMs = Number((txs.reduce((sum, tx) => sum + tx.latencyMs, 0) / txs.length).toFixed(1));
const meanTxCostPol = Number((formatEth(totalTxCostWei) / txs.length).toFixed(6));

const benchmark = {
  branch: 'main',
  architecture: 'legacy-public-state',
  network: 'amoy',
  contractAddress: CONTRACT_ADDRESS,
  wallet: wallet.address,
  flowsRequested: FLOWS,
  flowsCompleted: FLOWS,
  balanceBeforePol: formatEth(balanceBefore),
  balanceAfterPol: formatEth(balanceAfter),
  transactions: txs.length,
  elapsedSeconds,
  throughputTxPerSecond,
  meanLatencyMs,
  meanTxCostPol,
  privacyLeakagePercent: 75.0,
  leakageChecks: [
    { category: 'counterparty_identity', inferable: true },
    { category: 'grade_or_purity', inferable: true },
    { category: 'transformation_yield', inferable: true },
    { category: 'price', inferable: false }
  ],
  flowMeanYield: Number((flowSummaries.reduce((sum, flow) => sum + flow.derivedYield, 0) / flowSummaries.length).toFixed(4)),
  txs,
  flows: flowSummaries
};

await writeArtifacts(runId, benchmark);
console.log(JSON.stringify(benchmark, null, 2));

async function assertRoles() {
  const [adminRole, minerRole, refinerRole, assayerRole] = await Promise.all([
    contract.ADMIN_ROLE(),
    contract.MINER_ROLE(),
    contract.REFINER_ROLE(),
    contract.ASSAYER_ROLE()
  ]);

  const [isAdmin, isMiner, isRefiner, isAssayer] = await Promise.all([
    contract.hasRole(adminRole, wallet.address),
    contract.hasRole(minerRole, wallet.address),
    contract.hasRole(refinerRole, wallet.address),
    contract.hasRole(assayerRole, wallet.address)
  ]);

  const missing = [];
  if (!isAdmin) missing.push('ADMIN_ROLE');
  if (!isMiner) missing.push('MINER_ROLE');
  if (!isRefiner) missing.push('REFINER_ROLE');
  if (!isAssayer) missing.push('ASSAYER_ROLE');
  if (missing.length > 0) {
    throw new Error(`Wallet missing roles: ${missing.join(', ')}`);
  }
}

async function estimateGasProfile() {
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? ethers.parseUnits('30', 'gwei');
  const historicalGas = {
    registerOreGas: 299190n,
    refineGas: 360407n,
    certifyGas: 404772n
  };
  const totalGas = historicalGas.registerOreGas + historicalGas.refineGas + historicalGas.certifyGas;
  return {
    registerOreGas: historicalGas.registerOreGas,
    refineGas: historicalGas.refineGas,
    certifyGas: historicalGas.certifyGas,
    totalGas,
    maxFeePerGas
  };
}

async function sendStageTx(stage, method, args) {
  const fee = await provider.getFeeData();
  const tip = ethers.parseUnits('30', 'gwei');
  const base = fee.lastBaseFeePerGas ?? fee.maxFeePerGas ?? fee.gasPrice ?? 0n;
  const maxFeePerGas = base * 2n + tip;
  const estimatedGas = await method.estimateGas(...args);
  const gasLimit = (estimatedGas * 130n) / 100n;

  const startedAt = Date.now();
  const tx = await method(...args, {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas: tip
  });
  const receipt = await tx.wait();

  return {
    stage,
    txHash: tx.hash,
    latencyMs: Date.now() - startedAt,
    gasUsed: Number(receipt.gasUsed),
    gasPriceGwei: Number(ethers.formatUnits(receipt.gasPrice, 'gwei')),
    txCostPOL: Number(ethers.formatEther(receipt.gasUsed * receipt.gasPrice))
  };
}

function buildFlowSample(index) {
  const n = index + 1;
  const now = Math.floor(Date.now() / 1000);
  const extractedAt = now + index * 3;
  const refinedAt = extractedAt + 60;
  const certifiedAt = refinedAt + 60;
  const inputWeightGrams = 100000 + index * 1000;
  const outputWeightGrams = Math.floor(inputWeightGrams * 0.92);
  return {
    mineId: `MINE-AMOY-${RUN_TAG}-${n}`,
    originCountry: 'South Africa',
    mineralType: 'reef',
    extractedAt,
    inputWeightGrams,
    estimatedGrade: `${8 + (index % 3)} g/t`,
    refineryId: `RAND-REF-${RUN_TAG}`,
    refinedAt,
    outputWeightGrams,
    finenessPPT: 9999,
    barSerialNumber: `BAR-${RUN_TAG}-${n}`,
    assayerId: 'LBMA-003',
    certifiedAt,
    hallmark: 'LBMA Good Delivery',
    sku: `AU-BAR-${RUN_TAG}-${n}`,
    productType: 'bar'
  };
}

function computeOreId(sample) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(
    ['uint8', 'string', 'string', 'string', 'uint256', 'uint256', 'string', 'address'],
    [METAL_GOLD, sample.mineId, sample.originCountry, sample.mineralType, sample.extractedAt, sample.inputWeightGrams, sample.estimatedGrade, wallet.address]
  ));
}

function computeBarId(sample, oreId) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(
    ['bytes32[]', 'uint8', 'string', 'uint256', 'uint256', 'uint256', 'string', 'address'],
    [[oreId], METAL_GOLD, sample.refineryId, sample.refinedAt, sample.outputWeightGrams, sample.finenessPPT, sample.barSerialNumber, wallet.address]
  ));
}

function computeProductId(sample, barId) {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  return ethers.keccak256(coder.encode(
    ['bytes32', 'uint8', 'string', 'uint256', 'uint256', 'uint256', 'string', 'string', 'string', 'address'],
    [barId, METAL_GOLD, sample.assayerId, sample.certifiedAt, sample.outputWeightGrams, sample.finenessPPT, sample.hallmark, sample.sku, sample.productType, wallet.address]
  ));
}

async function writeArtifacts(runId, benchmark) {
  const dir = path.join(process.cwd(), 'data', 'benchmarks');
  await fs.mkdir(dir, { recursive: true });

  const base = `${runId}-main-amoy-legacy-benchmark`;
  const jsonPath = path.join(dir, `${base}.json`);
  const mdPath = path.join(dir, `${base}.md`);

  await fs.writeFile(jsonPath, `${JSON.stringify(benchmark, null, 2)}\n`);

  const lines = [
    '# Main-Branch Legacy Benchmark on Amoy',
    '',
    `- Date: ${new Date().toISOString().slice(0, 10)}`,
    '- Branch: `main`',
    '- Architecture: `legacy-public-state`',
    '- Network: `amoy`',
    `- Contract: \`${benchmark.contractAddress}\``,
    `- Flows completed: \`${benchmark.flowsCompleted}\``,
    '',
    '## Result',
    '',
    `- Throughput: \`${benchmark.throughputTxPerSecond} tx/s\``,
    `- Transactions committed: \`${benchmark.transactions}\``,
    `- End-to-end elapsed time: \`${benchmark.elapsedSeconds} s\``,
    `- Mean transaction latency: \`${benchmark.meanLatencyMs} ms\``,
    `- Mean transaction cost: \`${benchmark.meanTxCostPol} POL\``,
    `- Privacy leakage: \`${benchmark.privacyLeakagePercent}%\``,
    `- Mean derived yield: \`${benchmark.flowMeanYield}\``,
    '',
    '## Leakage Breakdown',
    '',
    '- `counterparty_identity`: inferable',
    '- `grade_or_purity`: inferable',
    '- `transformation_yield`: inferable',
    '- `price`: not inferable'
  ];

  await fs.writeFile(mdPath, `${lines.join('\n')}\n`);
}

function formatEth(value) {
  return Number(ethers.formatEther(value));
}

function formatGwei(value) {
  return Number(ethers.formatUnits(value, 'gwei'));
}

function parsePositiveInt(raw, fallback) {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
}
