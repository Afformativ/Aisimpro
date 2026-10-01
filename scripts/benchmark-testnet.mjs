import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ethers } from 'ethers';

const ABI = [
  'function ADMIN_ROLE() view returns (bytes32)',
  'function MINER_ROLE() view returns (bytes32)',
  'function REFINER_ROLE() view returns (bytes32)',
  'function ASSAYER_ROLE() view returns (bytes32)',
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function registerOre(uint8 metal, string mineId, string originCountry, string mineralType, uint256 extractedAt, uint256 weightGrams, string estimatedGrade) returns (bytes32)',
  'function refine(bytes32[] oreIds, uint8 metal, string refineryId, uint256 refinedAt, uint256 outputWeightGrams, uint256 finenessPPT, string barSerialNumber) returns (bytes32)',
  'function certify(bytes32 inputBarId, uint8 metal, string assayerId, uint256 certifiedAt, uint256 weightGrams, uint256 finenessPPT, string hallmark, string sku, string productType) returns (bytes32)',
  'function getRawOre(bytes32 id) view returns (tuple(bytes32 id, uint8 metal, string mineId, string originCountry, string mineralType, uint256 extractedAt, uint256 weightGrams, string estimatedGrade, address currentCustodian, bool exists, bytes32 documentRoot, string evidenceManifestCID))',
  'function getRefinedBar(bytes32 id) view returns (tuple(bytes32 id, bytes32[] inputOreIds, uint8 metal, string refineryId, uint256 refinedAt, uint256 outputWeightGrams, uint256 finenessPPT, string barSerialNumber, address currentCustodian, bool exists, bytes32 documentRoot, string evidenceManifestCID))',
  'function getCertifiedProduct(bytes32 id) view returns (tuple(bytes32 id, bytes32 inputBarId, uint8 metal, string assayerId, uint256 certifiedAt, uint256 weightGrams, uint256 finenessPPT, string hallmark, string sku, string productType, address currentCustodian, bool exists, bytes32 documentRoot, string evidenceManifestCID, string conformityCredentialURI))',
];

const RPC_URL =
  process.env.TRACEABILITY_RPC_URL
  || process.env.ZKEVM_RPC_URL
  || process.env.AMOY_RPC_URL
  || process.env.RPC_URL;
const CONTRACT_ADDRESS = process.env.TRACEABILITY_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const FLOWS = parseInt(process.env.BENCH_FLOWS || '2', 10);
const PRIORITY_GWEI = parseFloat(process.env.TRACEABILITY_GAS_PRICE || '30');
const MAX_GWEI = parseFloat(process.env.TRACEABILITY_MAX_GAS_PRICE || '50');
const MAX_TX_COST_POL = parseFloat(process.env.TRACEABILITY_MAX_TX_COST || '0.02');
const RPC_RETRY_ATTEMPTS = parseInt(process.env.BENCH_RPC_RETRY_ATTEMPTS || '6', 10);
const RPC_RETRY_BASE_MS = parseInt(process.env.BENCH_RPC_RETRY_BASE_MS || '1200', 10);
const BALANCE_BUFFER_POL = parseFloat(process.env.BENCH_BALANCE_BUFFER_POL || '0.002');
const METAL = 0;
const WEIGHT_GRAMS = 1000;
const OUTPUT_WEIGHT_GRAMS = 920;
const FINENESS_PPT = 9950;
const HALLMARK = 'LBMA Good Delivery';
const PRODUCT_TYPE = 'bar';

if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY) {
  throw new Error('Missing TRACEABILITY_RPC_URL/TRACEABILITY_CONTRACT_ADDRESS/PRIVATE_KEY in environment');
}

if (!Number.isInteger(FLOWS) || FLOWS < 1) {
  throw new Error('BENCH_FLOWS must be a positive integer');
}

const NETWORK = ethers.Network.from({ chainId: 80002, name: 'matic-amoy' });
const provider = new ethers.JsonRpcProvider(RPC_URL, NETWORK, {
  staticNetwork: NETWORK,
  batchMaxCount: 1,
});
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
const coder = ethers.AbiCoder.defaultAbiCoder();

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableRpcError(error) {
  const message = `${error?.message || ''} ${error?.info?.responseBody || ''}`.toLowerCase();
  return message.includes('429')
    || message.includes('1015')
    || message.includes('rate limit')
    || message.includes('exceeded maximum retry limit')
    || error?.code === 'SERVER_ERROR';
}

async function withRetry(label, fn, attempts = RPC_RETRY_ATTEMPTS) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt === attempts) {
        throw error;
      }
      const delayMs = RPC_RETRY_BASE_MS * attempt;
      console.warn(`${label}: RPC rate limit, retrying in ${delayMs}ms (${attempt}/${attempts})`);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function oreIdFromArgs(args) {
  return ethers.keccak256(coder.encode(
    ['uint8', 'string', 'string', 'string', 'uint256', 'uint256', 'string', 'address'],
    [...args, wallet.address],
  ));
}

function barIdFromArgs(args) {
  return ethers.keccak256(coder.encode(
    ['bytes32[]', 'uint8', 'string', 'uint256', 'uint256', 'uint256', 'string', 'address'],
    [...args, wallet.address],
  ));
}

function productIdFromArgs(args) {
  return ethers.keccak256(coder.encode(
    ['bytes32', 'uint8', 'string', 'uint256', 'uint256', 'uint256', 'string', 'string', 'string', 'address'],
    [...args, wallet.address],
  ));
}

async function buildOverrides(method, args, nonce, baseFeePerGas) {
  const priorityFeePerGas = ethers.parseUnits(String(PRIORITY_GWEI), 'gwei');
  const maxGasPrice = ethers.parseUnits(String(MAX_GWEI), 'gwei');
  const effectiveGasPrice = baseFeePerGas + priorityFeePerGas;
  const capped = effectiveGasPrice > maxGasPrice;
  const maxPriorityFeePerGas = capped
    ? (maxGasPrice > baseFeePerGas ? maxGasPrice - baseFeePerGas : maxGasPrice)
    : priorityFeePerGas;
  const maxFeePerGas = capped ? maxGasPrice : (baseFeePerGas * 2n) + priorityFeePerGas;
  const estimate = await withRetry(`${method}.estimateGas`, () => contract[method].estimateGas(...args, {
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
  }));
  const estimatedCostPol = Number(ethers.formatEther(estimate * (baseFeePerGas + maxPriorityFeePerGas)));
  if (estimatedCostPol > MAX_TX_COST_POL) {
    throw new Error(`${method} estimate ${estimatedCostPol.toFixed(6)} POL exceeds cap ${MAX_TX_COST_POL}`);
  }
  return {
    nonce,
    gasLimit: (estimate * 130n) / 100n,
    maxFeePerGas,
    maxPriorityFeePerGas,
    estimatedGas: Number(estimate),
    estimatedCostPol,
  };
}

async function sendPhase({ name, method, items, argBuilder, idBuilder, nonceStart }) {
  const prepared = [];
  let nonce = nonceStart;
  const latestBlock = await withRetry(`${method}.getBlock`, () => provider.getBlock('latest'));
  const baseFeePerGas = latestBlock?.baseFeePerGas ?? 0n;

  for (const item of items) {
    const args = argBuilder(item);
    const id = idBuilder(args);
    const overrides = await buildOverrides(method, args, nonce, baseFeePerGas);
    prepared.push({ item, args, id, nonce, overrides });
    nonce += 1;
  }

  const phaseWorstCaseWei = prepared.reduce((sum, entry) => (
    sum + (entry.overrides.gasLimit * entry.overrides.maxFeePerGas)
  ), 0n);
  const bufferWei = ethers.parseEther(String(BALANCE_BUFFER_POL));
  const phaseBalance = await withRetry(`${method}.phaseBalance`, () => provider.getBalance(wallet.address));
  if (phaseBalance < (phaseWorstCaseWei + bufferWei)) {
    throw new Error(
      `Insufficient balance for ${method}: need ~${ethers.formatEther(phaseWorstCaseWei + bufferWei)} POL worst-case, ` +
      `have ${ethers.formatEther(phaseBalance)} POL`,
    );
  }

  const submitted = [];
  for (const entry of prepared) {
    const submittedAt = Date.now();
    const tx = await withRetry(`${method}.send`, () => contract[method](...entry.args, {
      nonce: entry.nonce,
      gasLimit: entry.overrides.gasLimit,
      maxFeePerGas: entry.overrides.maxFeePerGas,
      maxPriorityFeePerGas: entry.overrides.maxPriorityFeePerGas,
    }));
    submitted.push({
      ...entry,
      hash: tx.hash,
      submittedAt,
      waitPromise: tx.wait(),
    });
  }

  const settled = [];
  for (const entry of submitted) {
    const receipt = await withRetry(`${method}.wait`, () => entry.waitPromise);
    const minedAt = Date.now();
    const effectiveGasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice ?? 0n;
    const txCostPol = Number(ethers.formatEther(receipt.gasUsed * effectiveGasPrice));
    settled.push({
      stage: name,
      method,
      label: entry.item.label,
      id: entry.id,
      hash: entry.hash,
      nonce: entry.nonce,
      blockNumber: receipt.blockNumber,
      submittedAt: entry.submittedAt,
      minedAt,
      latencyMs: minedAt - entry.submittedAt,
      gasUsed: Number(receipt.gasUsed),
      effectiveGasPriceGwei: Number(ethers.formatUnits(effectiveGasPrice, 'gwei')),
      txCostPol,
      estimatedGas: entry.overrides.estimatedGas,
      estimatedCostPol: entry.overrides.estimatedCostPol,
      args: entry.args,
      explorerUrl: `https://amoy.polygonscan.com/tx/${entry.hash}`,
    });
  }

  const firstSubmit = Math.min(...settled.map((entry) => entry.submittedAt));
  const lastSubmit = Math.max(...settled.map((entry) => entry.submittedAt));
  const lastMined = Math.max(...settled.map((entry) => entry.minedAt));
  const durationSeconds = (lastMined - firstSubmit) / 1000;

  return {
    transactions: settled,
    nextNonce: nonce,
    metrics: {
      txCount: settled.length,
      submissionWindowSeconds: round((lastSubmit - firstSubmit) / 1000, 3),
      committedWindowSeconds: round(durationSeconds, 3),
      committedTps: round(settled.length / durationSeconds, 4),
      meanLatencyMs: round(mean(settled.map((entry) => entry.latencyMs)), 1),
      p95LatencyMs: round(percentile(settled.map((entry) => entry.latencyMs), 95), 1),
      meanGasUsed: round(mean(settled.map((entry) => entry.gasUsed)), 1),
      meanTxCostPol: round(mean(settled.map((entry) => entry.txCostPol)), 6),
      blocksSpanned: new Set(settled.map((entry) => entry.blockNumber)).size,
    },
  };
}

function summarizePhase(phase) {
  return {
    ...phase.metrics,
    labels: phase.transactions.map((tx) => tx.label),
  };
}

async function main() {
  const runStartedAt = new Date().toISOString();
  const runId = runStartedAt.replace(/[:.]/g, '-');
  const balanceBefore = await withRetry('provider.getBalance.before', () => provider.getBalance(wallet.address));
  const adminRole = await withRetry('contract.ADMIN_ROLE', () => contract.ADMIN_ROLE());
  const minerRole = await withRetry('contract.MINER_ROLE', () => contract.MINER_ROLE());
  const refinerRole = await withRetry('contract.REFINER_ROLE', () => contract.REFINER_ROLE());
  const assayerRole = await withRetry('contract.ASSAYER_ROLE', () => contract.ASSAYER_ROLE());
  const isAdmin = await withRetry('contract.hasRole.admin', () => contract.hasRole(adminRole, wallet.address));
  const isMiner = await withRetry('contract.hasRole.miner', () => contract.hasRole(minerRole, wallet.address));
  const isRefiner = await withRetry('contract.hasRole.refiner', () => contract.hasRole(refinerRole, wallet.address));
  const isAssayer = await withRetry('contract.hasRole.assayer', () => contract.hasRole(assayerRole, wallet.address));

  if (!isAdmin || !isMiner || !isRefiner || !isAssayer) {
    throw new Error('Configured wallet is missing one or more required roles');
  }

  const baseNonce = await withRetry('provider.getTransactionCount', () => provider.getTransactionCount(wallet.address, 'pending'));
  const baseTimestamp = Math.floor(Date.now() / 1000);
  const flows = Array.from({ length: FLOWS }, (_, index) => {
    const suffix = `${runId}-${index + 1}`;
    return {
      index,
      label: `bench-${suffix}`,
      mineId: `BENCH-MINE-${suffix}`,
      originCountry: 'CA',
      mineralType: 'reef',
      estimatedGrade: `8.${index} g/t`,
      refineryId: `BENCH-REFINERY-${suffix}`,
      barSerialNumber: `BENCH-BAR-${suffix}`,
      assayerId: `BENCH-ASSAYER-${suffix}`,
      sku: `BENCH-SKU-${suffix}`,
      extractedAt: baseTimestamp + index,
      refinedAt: baseTimestamp + FLOWS + index,
      certifiedAt: baseTimestamp + (2 * FLOWS) + index,
    };
  });

  const orePhase = await sendPhase({
    name: 'registerOre',
    method: 'registerOre',
    items: flows,
    nonceStart: baseNonce,
    argBuilder: (flow) => [
      METAL,
      flow.mineId,
      flow.originCountry,
      flow.mineralType,
      flow.extractedAt,
      WEIGHT_GRAMS,
      flow.estimatedGrade,
    ],
    idBuilder: oreIdFromArgs,
  });

  const barFlows = flows.map((flow, index) => ({
    ...flow,
    oreId: orePhase.transactions[index].id,
  }));

  const barPhase = await sendPhase({
    name: 'refine',
    method: 'refine',
    items: barFlows,
    nonceStart: orePhase.nextNonce,
    argBuilder: (flow) => [
      [flow.oreId],
      METAL,
      flow.refineryId,
      flow.refinedAt,
      OUTPUT_WEIGHT_GRAMS,
      FINENESS_PPT,
      flow.barSerialNumber,
    ],
    idBuilder: barIdFromArgs,
  });

  const productFlows = barFlows.map((flow, index) => ({
    ...flow,
    barId: barPhase.transactions[index].id,
  }));

  const productPhase = await sendPhase({
    name: 'certify',
    method: 'certify',
    items: productFlows,
    nonceStart: barPhase.nextNonce,
    argBuilder: (flow) => [
      flow.barId,
      METAL,
      flow.assayerId,
      flow.certifiedAt,
      OUTPUT_WEIGHT_GRAMS,
      FINENESS_PPT,
      HALLMARK,
      flow.sku,
      PRODUCT_TYPE,
    ],
    idBuilder: productIdFromArgs,
  });

  const orePublic = [];
  for (const tx of orePhase.transactions) {
    orePublic.push(await withRetry('contract.getRawOre', () => contract.getRawOre(tx.id)));
  }
  const barPublic = [];
  for (const tx of barPhase.transactions) {
    barPublic.push(await withRetry('contract.getRefinedBar', () => contract.getRefinedBar(tx.id)));
  }
  const productPublic = [];
  for (const tx of productPhase.transactions) {
    productPublic.push(await withRetry('contract.getCertifiedProduct', () => contract.getCertifiedProduct(tx.id)));
  }

  const yieldValues = barPublic.map((bar, index) => Number(bar.outputWeightGrams) / Number(orePublic[index].weightGrams));
  const leakageChecks = [
    {
      category: 'counterparty_identity',
      inferable: orePublic.every((ore) => !!ore.currentCustodian)
        && barPublic.every((bar) => !!bar.currentCustodian)
        && productPublic.every((product) => !!product.currentCustodian),
      evidence: 'currentCustodian is publicly readable for ore, bar, and product records',
    },
    {
      category: 'grade_or_purity',
      inferable: orePublic.every((ore) => !!ore.estimatedGrade)
        && barPublic.every((bar) => Number(bar.finenessPPT) > 0)
        && productPublic.every((product) => Number(product.finenessPPT) > 0),
      evidence: 'estimatedGrade and finenessPPT are publicly readable',
    },
    {
      category: 'transformation_yield',
      inferable: yieldValues.every((value) => Number.isFinite(value) && value > 0),
      evidence: 'input weights, output weights, and inputOreIds are public, so yield is derivable',
    },
    {
      category: 'price',
      inferable: false,
      evidence: 'no price field is stored in the public contract state or emitted in benchmark transactions',
    },
  ];

  const inferableCount = leakageChecks.filter((check) => check.inferable).length;
  const privacyLeakagePct = round((inferableCount / leakageChecks.length) * 100, 1);
  const allTransactions = [
    ...orePhase.transactions,
    ...barPhase.transactions,
    ...productPhase.transactions,
  ];
  const firstSubmit = Math.min(...allTransactions.map((tx) => tx.submittedAt));
  const lastMined = Math.max(...allTransactions.map((tx) => tx.minedAt));
  const endToEndSeconds = (lastMined - firstSubmit) / 1000;
  const balanceAfter = await withRetry('provider.getBalance.after', () => provider.getBalance(wallet.address));
  const totalCostPol = Number(ethers.formatEther(balanceBefore - balanceAfter));

  const result = {
    benchmark: {
      ranAt: runStartedAt,
      runId,
      network: {
        chainId: NETWORK.chainId,
        name: NETWORK.name,
        rpcUrl: RPC_URL,
        contractAddress: CONTRACT_ADDRESS,
      },
      wallet: {
        address: wallet.address,
        balanceBeforePol: round(Number(ethers.formatEther(balanceBefore)), 6),
        balanceAfterPol: round(Number(ethers.formatEther(balanceAfter)), 6),
        observedCostPol: round(totalCostPol, 6),
      },
      config: {
        flows: FLOWS,
        txCount: allTransactions.length,
        priorityFeeGwei: PRIORITY_GWEI,
        maxGasPriceGwei: MAX_GWEI,
        maxTxCostPol: MAX_TX_COST_POL,
        weights: {
          oreWeightGrams: WEIGHT_GRAMS,
          outputWeightGrams: OUTPUT_WEIGHT_GRAMS,
        },
      },
      throughput: {
        endToEndSeconds: round(endToEndSeconds, 3),
        committedTps: round(allTransactions.length / endToEndSeconds, 4),
        meanLatencyMs: round(mean(allTransactions.map((tx) => tx.latencyMs)), 1),
        p95LatencyMs: round(percentile(allTransactions.map((tx) => tx.latencyMs), 95), 1),
        meanGasUsed: round(mean(allTransactions.map((tx) => tx.gasUsed)), 1),
        meanTxCostPol: round(mean(allTransactions.map((tx) => tx.txCostPol)), 6),
        phases: {
          registerOre: summarizePhase(orePhase),
          refine: summarizePhase(barPhase),
          certify: summarizePhase(productPhase),
        },
      },
      privacyLeakage: {
        metricDefinition: 'Fraction of draft-defined confidential attribute categories inferable from public on-chain state and transaction traces.',
        categories: leakageChecks,
        inferableCount,
        categoryCount: leakageChecks.length,
        leakagePercent: privacyLeakagePct,
        derivedYields: yieldValues.map((value) => round(value, 4)),
      },
      ids: {
        oreIds: orePhase.transactions.map((tx) => tx.id),
        barIds: barPhase.transactions.map((tx) => tx.id),
        productIds: productPhase.transactions.map((tx) => tx.id),
      },
      transactions: allTransactions,
    },
  };

  const outputDir = join(process.cwd(), 'data', 'benchmarks');
  mkdirSync(outputDir, { recursive: true });
  const timestampedPath = join(outputDir, `testnet-benchmark-${runId}.json`);
  const latestPath = join(outputDir, 'latest-testnet-benchmark.json');
  writeFileSync(timestampedPath, `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(latestPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(JSON.stringify({
    throughput_committed_tps: result.benchmark.throughput.committedTps,
    throughput_end_to_end_seconds: result.benchmark.throughput.endToEndSeconds,
    privacy_leakage_percent: result.benchmark.privacyLeakage.leakagePercent,
    observed_cost_pol: result.benchmark.wallet.observedCostPol,
    result_file: timestampedPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
