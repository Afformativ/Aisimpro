const hre = require('hardhat');

async function main() {
  process.env.DB_TYPE = 'memory';
  process.env.MERKLE_ANCHORING_ENABLED = 'true';
  process.env.MERKLE_MAX_LEAVES = '512';
  process.env.BLOCKCHAIN_NETWORK = 'localhost';
  process.env.PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

  const [deployer] = await hre.ethers.getSigners();
  const Traceability = await hre.ethers.getContractFactory('GoldSilverTraceability');
  const traceability = await Traceability.deploy(deployer.address);
  await traceability.waitForDeployment();
  process.env.CONTRACT_ADDRESS = await traceability.getAddress();

  const { default: anchoringService } = await import('../src/services/anchoring.js');
  const { default: articleTraceabilityService } = await import('../src/services/article-traceability.js');

  await anchoringService.attachSigner(deployer, process.env.CONTRACT_ADDRESS);

  const scopeId = `article-benchmark-${Date.now()}`;
  const totalOreRecords = 120;
  const totalTransfers = 80;
  const totalRefinements = 20;
  const totalCertifications = 20;
  const oreIds = [];
  const barIds = [];

  const startedAt = Date.now();

  for (let i = 0; i < totalOreRecords; i++) {
    const result = await articleTraceabilityService.registerOrePrivate({
      metal: 'GOLD',
      mineId: `mine-${i % 3}`,
      mineralType: 'gold ore',
      weightGrams: 1000 + i,
      countryCode: i % 2 === 0 ? 'CA' : 'AU',
      gradeValue: 800 + (i % 20),
      salt: 10_000 + i,
      ownerRef: `miner-${i % 4}`,
      ownerSalt: 20_000 + i,
      priceCents: 500_000 + i,
      priceSalt: 30_000 + i,
      scopeId,
    });
    oreIds.push(result.record.id);
  }

  for (let i = 0; i < totalTransfers; i++) {
    await articleTraceabilityService.transferCustodyPrivate({
      batchId: oreIds[i],
      toCounterpartyRef: `refiner-${i % 2}`,
      toCounterpartySalt: 40_000 + i,
      scopeId,
    });
  }

  for (let i = 0; i < totalRefinements; i++) {
    const result = await articleTraceabilityService.refinePrivate({
      inputBatchIds: [oreIds[i * 2], oreIds[(i * 2) + 1]],
      metal: 'GOLD',
      refineryRef: `refinery-${i % 2}`,
      refinerySalt: 50_000 + i,
      outputWeightGrams: 1850 + i,
      finenessPPT: 9950 + (i % 5),
      puritySalt: 60_000 + i,
      yieldSalt: 70_000 + i,
      priceCents: 900_000 + i,
      priceSalt: 80_000 + i,
      scopeId,
    });
    barIds.push(result.record.id);
  }

  for (let i = 0; i < totalCertifications; i++) {
    await articleTraceabilityService.certifyPrivate({
      inputBatchId: barIds[i],
      assayerRef: `assayer-${i % 2}`,
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
  }

  const anchorResult = await articleTraceabilityService.closeAndAnchorScope(scopeId);
  const endedAt = Date.now();

  const oreProof = await articleTraceabilityService.proveOriginGrade(oreIds[0], {
    countryCode: 'CA',
    gradeValue: 800,
    salt: 10_000,
    minGrade: 790,
    allowedCountries: ['CA', 'AU', 'US'],
  });

  const productId = Array.from(articleTraceabilityService.records.values()).find((record) => record.stage === 'PRODUCT')?.id;
  const purityProof = await articleTraceabilityService.provePurity(productId, {
    purityPPT: 9950,
    salt: 60_000,
    minValue: 9950,
  });

  const totalEvents = totalOreRecords + totalTransfers + totalRefinements + totalCertifications;
  const elapsedSeconds = (endedAt - startedAt) / 1000;
  const throughput = Number((totalEvents / elapsedSeconds).toFixed(2));

  const verificationBundle = articleTraceabilityService.getVerificationBundle(productId);

  console.log(JSON.stringify({
    traceabilityContract: process.env.CONTRACT_ADDRESS,
    relayer: deployer.address,
    scopeId,
    totalEvents,
    elapsedSeconds,
    throughputEventsPerSecond: throughput,
    closedBatches: anchorResult.closed.length,
    anchoredRoots: anchorResult.anchors.filter((item) => item.success).length,
    oreProofVerifiedLocally: oreProof.proof.verified,
    purityProofVerifiedLocally: purityProof.proof.verified,
    productVerificationBundle: {
      batchId: verificationBundle.record.id,
      anchorBatchId: verificationBundle.anchorBatch?.batchId || null,
      anchorStatus: verificationBundle.anchorBatch?.status || null,
      anchorTxHash: verificationBundle.anchorBatch?.anchorTxHash || null,
    },
    metrics: articleTraceabilityService.getMetrics(),
  }, null, 2));

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
