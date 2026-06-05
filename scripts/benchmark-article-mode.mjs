import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ethers } from 'ethers';

const ARTICLE_EVENTS = parseInt(process.env.ARTICLE_BENCH_EVENTS || '2000', 10);
const ARTICLE_BATCH_SIZE = parseInt(process.env.ARTICLE_BENCH_BATCH_SIZE || '500', 10);
const ARTICLE_SCOPE_PREFIX = process.env.ARTICLE_BENCH_SCOPE_PREFIX || 'article-live';
const ARTICLE_RPC_URL = process.env.ARTICLE_RPC_URL || process.env.ZKEVM_RPC_URL || process.env.RPC_URL || 'https://rpc.cardona.zkevm-rpc.com';
const ARTICLE_PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARTICLE_CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ARTICLE_CHAIN_ID = parseInt(process.env.ARTICLE_CHAIN_ID || '2442', 10);
const ARTICLE_CHAIN_NAME = process.env.ARTICLE_CHAIN_NAME || 'polygon-zkevm-cardona';
const ARTICLE_EXPLORER = process.env.ARTICLE_EXPLORER || 'https://cardona-zkevm.polygonscan.com';
const OUTPUT_DIR = join(process.cwd(), 'data', 'benchmarks');

if (!Number.isInteger(ARTICLE_EVENTS) || ARTICLE_EVENTS < 4) {
  throw new Error('ARTICLE_BENCH_EVENTS must be an integer >= 4');
}

if (!Number.isInteger(ARTICLE_BATCH_SIZE) || ARTICLE_BATCH_SIZE < 4) {
  throw new Error('ARTICLE_BENCH_BATCH_SIZE must be an integer >= 4');
}

if (!ARTICLE_RPC_URL || !ARTICLE_PRIVATE_KEY || !ARTICLE_CONTRACT_ADDRESS) {
  throw new Error('Missing ARTICLE_RPC_URL/ZKEVM_RPC_URL/RPC_URL, PRIVATE_KEY, or CONTRACT_ADDRESS');
}

process.env.DB_TYPE = 'memory';
process.env.MERKLE_ANCHORING_ENABLED = 'true';
process.env.MERKLE_MAX_LEAVES = String(ARTICLE_BATCH_SIZE);
process.env.BLOCKCHAIN_NETWORK = process.env.ARTICLE_BLOCKCHAIN_NETWORK || 'zkevm-testnet';
process.env.CONTRACT_ADDRESS = ARTICLE_CONTRACT_ADDRESS;

function round(value, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function nowIso() {
  return new Date().toISOString();
}

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[index];
}

async function runPreflight() {
  const { spawnSync } = await import('child_process');
  const result = spawnSync(
    process.execPath,
    [join(process.cwd(), 'scripts', 'preflight-article-benchmark.mjs')],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
    }
  );

  if (result.stdout) {
    const preflight = JSON.parse(result.stdout);
    if (!preflight.ok) {
      throw new Error(
        `Insufficient balance on chain ${preflight.network.actualChainId}. ` +
        `Wallet ${preflight.wallet.address} has ${preflight.wallet.balancePol} POL, ` +
        `recommended ${preflight.benchmark.recommendedBalancePol} POL ` +
        `(shortfall ${preflight.benchmark.shortfallPol} POL).`
      );
    }
    return preflight;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Benchmark preflight failed');
  }

  throw new Error('Benchmark preflight produced no output');
}

async function main() {
  const { default: anchoringService } = await import('../src/services/anchoring.js');
  const { ArticleTraceabilityService } = await import('../src/services/article-traceability.js');
  const { scoreArticleModeLeakage } = await import('../src/services/privacy-leakage.js');

  const runStartedAt = nowIso();
  const runId = runStartedAt.replace(/[:.]/g, '-');
  const preflight = await runPreflight();
  const provider = new ethers.JsonRpcProvider(ARTICLE_RPC_URL, ethers.Network.from({
    chainId: ARTICLE_CHAIN_ID,
    name: ARTICLE_CHAIN_NAME,
  }), {
    staticNetwork: ethers.Network.from({ chainId: ARTICLE_CHAIN_ID, name: ARTICLE_CHAIN_NAME }),
    batchMaxCount: 1,
  });
  const signer = new ethers.Wallet(ARTICLE_PRIVATE_KEY, provider);

  await anchoringService.connect(ARTICLE_PRIVATE_KEY);
  const articleTraceabilityService = new ArticleTraceabilityService();

  const totalGroups = Math.floor(ARTICLE_EVENTS / 4);
  const scopeCount = Math.max(1, Math.ceil(ARTICLE_EVENTS / ARTICLE_BATCH_SIZE));
  const scopeIds = Array.from({ length: scopeCount }, (_, index) => (
    `${ARTICLE_SCOPE_PREFIX}-${runId}-${index + 1}`
  ));

  const eventLog = [];
  const productIds = [];
  const startedAtMs = Date.now();

  for (let i = 0; i < totalGroups; i += 1) {
    const eventIndex = i * 4;
    const scopeId = scopeIds[Math.min(scopeIds.length - 1, Math.floor(eventIndex / ARTICLE_BATCH_SIZE))];

    const ore = await articleTraceabilityService.registerOrePrivate({
      metal: 'GOLD',
      mineId: `BENCH-MINE-${i}`,
      mineralType: 'gold ore',
      weightGrams: 1000 + i,
      countryCode: i % 2 === 0 ? 'CA' : 'AU',
      gradeValue: 820 + (i % 30),
      salt: 10_000 + i,
      ownerRef: `miner-${i % 8}`,
      ownerSalt: 20_000 + i,
      priceCents: 500_000 + i,
      priceSalt: 30_000 + i,
      scopeId,
    });
    eventLog.push({ type: 'ore', batchId: ore.record.id, scopeId, at: Date.now() });

    const transfer = await articleTraceabilityService.transferCustodyPrivate({
      batchId: ore.record.id,
      toCounterpartyRef: `refiner-${i % 4}`,
      toCounterpartySalt: 40_000 + i,
      scopeId,
    });
    eventLog.push({ type: 'transfer', batchId: transfer.record.id, scopeId, at: Date.now() });

    const bar = await articleTraceabilityService.refinePrivate({
      inputBatchIds: [ore.record.id],
      metal: 'GOLD',
      refineryRef: `refinery-${i % 4}`,
      refinerySalt: 50_000 + i,
      outputWeightGrams: 930 + i,
      finenessPPT: 9950 + (i % 5),
      puritySalt: 60_000 + i,
      yieldSalt: 70_000 + i,
      priceCents: 850_000 + i,
      priceSalt: 80_000 + i,
      scopeId,
    });
    eventLog.push({ type: 'refine', batchId: bar.record.id, scopeId, at: Date.now() });

    const product = await articleTraceabilityService.certifyPrivate({
      inputBatchId: bar.record.id,
      assayerRef: `assayer-${i % 4}`,
      assayerSalt: 90_000 + i,
      productType: 'Good Delivery Bar',
      hallmark: `LBMA-${i}`,
      sku: `SKU-${i}`,
      finenessPPT: 9950 + (i % 5),
      puritySalt: 60_000 + i,
      priceCents: 1_200_000 + i,
      priceSalt: 100_000 + i,
      scopeId,
    });
    productIds.push(product.record.id);
    eventLog.push({ type: 'certify', batchId: product.record.id, scopeId, at: Date.now() });
  }

  const closeStartedAt = Date.now();
  const anchorResults = [];
  for (const scopeId of scopeIds) {
    anchorResults.push({
      scopeId,
      startedAt: Date.now(),
      result: await articleTraceabilityService.closeAndAnchorScope(scopeId),
      endedAt: Date.now(),
    });
  }
  const endedAtMs = Date.now();

  const proofChecks = [];
  const firstProduct = productIds.length > 0
    ? articleTraceabilityService.getRecord(productIds[0], { includePrivate: true })
    : null;
  if (firstProduct) {
    const purity = await articleTraceabilityService.provePurity(firstProduct.id, {
      purityPPT: firstProduct.privateState.finenessPPT,
      salt: firstProduct.privateState.puritySalt,
      minValue: 9950,
    });
    proofChecks.push({
      type: 'purity',
      batchId: firstProduct.id,
      verifiedLocally: purity.proof.verified,
    });
  }

  const firstOre = Array.from(articleTraceabilityService.records.values()).find((record) => record.stage === 'ORE');
  if (firstOre) {
    const originGrade = await articleTraceabilityService.proveOriginGrade(firstOre.id, {
      countryCode: firstOre.privateState.countryCode,
      gradeValue: firstOre.privateState.gradeValue,
      salt: firstOre.privateState.salt,
      minGrade: 800,
      allowedCountries: ['CA', 'AU', 'US'],
    });
    proofChecks.push({
      type: 'origin_grade',
      batchId: firstOre.id,
      verifiedLocally: originGrade.proof.verified,
    });
  }

  const publicSnapshot = Array.from(articleTraceabilityService.records.keys()).map((id) => (
    articleTraceabilityService.getRecord(id)
  ));
  const leakage = scoreArticleModeLeakage(publicSnapshot);

  const anchorTransactions = anchorResults.flatMap((entry) => (
    entry.result.anchors.filter((anchor) => anchor.success)
  ));
  const anchorLatenciesMs = anchorResults.map((entry) => entry.endedAt - entry.startedAt);
  const totalEvents = eventLog.length;
  const ingestionSeconds = (closeStartedAt - startedAtMs) / 1000;
  const endToEndSeconds = (endedAtMs - startedAtMs) / 1000;

  const benchmark = {
    ranAt: runStartedAt,
    runId,
    network: {
      chainId: ARTICLE_CHAIN_ID,
      name: ARTICLE_CHAIN_NAME,
      rpcUrl: ARTICLE_RPC_URL,
      explorerUrl: ARTICLE_EXPLORER,
      contractAddress: ARTICLE_CONTRACT_ADDRESS,
    },
    wallet: {
      address: signer.address,
      balancePol: round(Number(ethers.formatEther(await provider.getBalance(signer.address))), 6),
    },
    preflight,
    config: {
      totalEventsRequested: ARTICLE_EVENTS,
      totalEventsCommitted: totalEvents,
      batchSize: ARTICLE_BATCH_SIZE,
      scopeCount: scopeIds.length,
      eventMix: {
        ore: totalGroups,
        transfer: totalGroups,
        refine: totalGroups,
        certify: totalGroups,
      },
    },
    throughput: {
      ingestionSeconds: round(ingestionSeconds, 3),
      anchorSeconds: round((endedAtMs - closeStartedAt) / 1000, 3),
      endToEndSeconds: round(endToEndSeconds, 3),
      sustainedIngressTps: round(totalEvents / ingestionSeconds, 3),
      committedBusinessTps: round(totalEvents / endToEndSeconds, 3),
      anchorTransactions: anchorTransactions.length,
      anchorTxPerSecond: round(anchorTransactions.length / endToEndSeconds, 3),
      meanAnchorLatencyMs: round(anchorLatenciesMs.reduce((sum, value) => sum + value, 0) / (anchorLatenciesMs.length || 1), 1),
      p95AnchorLatencyMs: round(percentile(anchorLatenciesMs, 95), 1),
    },
    privacyLeakage: leakage,
    proofs: proofChecks,
    anchors: anchorResults.map((entry) => ({
      scopeId: entry.scopeId,
      anchorCount: entry.result.anchors.length,
      successfulAnchors: entry.result.anchors.filter((anchor) => anchor.success).length,
      txHashes: entry.result.anchors.map((anchor) => anchor.txHash).filter(Boolean),
      durationMs: entry.endedAt - entry.startedAt,
    })),
    metrics: articleTraceabilityService.getMetrics(),
    publicSnapshot,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const jsonPath = join(OUTPUT_DIR, `article-benchmark-${runId}.json`);
  writeFileSync(jsonPath, `${JSON.stringify(benchmark, null, 2)}\n`);

  const summaryPath = join(OUTPUT_DIR, `article-benchmark-${runId}.md`);
  writeFileSync(summaryPath, [
    `# Article Benchmark ${runId}`,
    '',
    `Ran at: ${runStartedAt}`,
    `Network: ${ARTICLE_CHAIN_NAME} (${ARTICLE_CHAIN_ID})`,
    `Contract: ${ARTICLE_CONTRACT_ADDRESS}`,
    '',
    '## Throughput',
    '',
    `- Total committed business events: ${totalEvents}`,
    `- Batch size: ${ARTICLE_BATCH_SIZE}`,
    `- Scope count: ${scopeIds.length}`,
    `- Sustained ingress throughput: ${benchmark.throughput.sustainedIngressTps} events/s`,
    `- End-to-end committed throughput: ${benchmark.throughput.committedBusinessTps} events/s`,
    `- Anchor transactions: ${anchorTransactions.length}`,
    `- Anchor tx/s: ${benchmark.throughput.anchorTxPerSecond}`,
    '',
    '## Privacy Leakage',
    '',
    `- Inferable confidential instances: ${leakage.inferableCount}/${leakage.totalApplicable}`,
    `- Leakage percent: ${leakage.leakagePercent}%`,
    '',
    '## Proof checks',
    '',
    ...proofChecks.map((proof) => `- ${proof.type}: ${proof.verifiedLocally ? 'verified' : 'failed'}`),
    '',
    `JSON output: ${jsonPath}`,
    '',
  ].join('\n'));

  console.log(JSON.stringify({
    committed_business_tps: benchmark.throughput.committedBusinessTps,
    sustained_ingress_tps: benchmark.throughput.sustainedIngressTps,
    privacy_leakage_percent: benchmark.privacyLeakage.leakagePercent,
    anchor_tx_count: benchmark.throughput.anchorTransactions,
    result_file: jsonPath,
    summary_file: summaryPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
