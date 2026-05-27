/**
 * Hardhat demo script – Gold & Silver Mining Provenance
 *
 * Deploys GoldSilverTraceability, assigns roles, and walks through
 * two full supply-chain flows:
 *
 *   GOLD:   RawOre → RefinedBar → CertifiedProduct → dealer
 *   SILVER: RawOre → RefinedBar → CertifiedProduct → dealer
 *
 * Run:  npx hardhat run scripts/demo.cjs --network localhost
 */

const hre = require("hardhat");

// -----------------------------------------------------------------------
// QR helper  –  chainId:contractAddress:recordType:idHex
// -----------------------------------------------------------------------
function buildQrString(chainId, contractAddress, recordType, idHex) {
  return `${chainId}:${contractAddress}:${recordType}:${idHex}`;
}

// Metal enum values matching Solidity
const Metal = { GOLD: 0, SILVER: 1 };

async function main() {
  const ethers = hre.ethers;
  const [deployer, miner, refiner, assayer, dealer, auditor] =
    await ethers.getSigners();

  console.log("=".repeat(70));
  console.log("  Gold & Silver Mining Provenance – Hardhat Demo");
  console.log("=".repeat(70));
  console.log(`Deployer  : ${deployer.address}`);
  console.log(`Miner     : ${miner.address}`);
  console.log(`Refiner   : ${refiner.address}`);
  console.log(`Assayer   : ${assayer.address}`);
  console.log(`Dealer    : ${dealer.address}`);
  console.log(`Auditor   : ${auditor.address}`);
  console.log();

  // ------------------------------------------------------------------
  // 1. Deploy
  // ------------------------------------------------------------------
  const Factory = await ethers.getContractFactory("GoldSilverTraceability");
  const contract = await Factory.deploy(deployer.address);
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log(`✅ Contract deployed at ${contractAddress}\n`);

  // ------------------------------------------------------------------
  // 2. Grant roles  (deployer == SUPERADMIN)
  // ------------------------------------------------------------------
  const MINER_ROLE   = ethers.keccak256(ethers.toUtf8Bytes("MINER"));
  const REFINER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REFINER"));
  const ASSAYER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("ASSAYER"));
  const DEALER_ROLE  = ethers.keccak256(ethers.toUtf8Bytes("DEALER"));
  const AUDITOR_ROLE = ethers.keccak256(ethers.toUtf8Bytes("AUDITOR"));
  const ADMIN_ROLE   = ethers.keccak256(ethers.toUtf8Bytes("ADMIN"));

  await contract.grantRole(MINER_ROLE,   miner.address);
  await contract.grantRole(REFINER_ROLE, refiner.address);
  await contract.grantRole(ASSAYER_ROLE, assayer.address);
  await contract.grantRole(DEALER_ROLE,  dealer.address);
  await contract.grantRole(AUDITOR_ROLE, auditor.address);
  await contract.grantRole(ADMIN_ROLE,   deployer.address);
  console.log("✅ Roles granted\n");

  // ------------------------------------------------------------------
  // 3. Set IPFS certificate template CIDs  (admin)
  // ------------------------------------------------------------------
  await contract.setTemplateCID(0, "QmOreExtractionCertTemplate_v1");      // RAW_ORE
  await contract.setTemplateCID(1, "QmRefinedBarCertTemplate_v1");         // REFINED_BAR
  await contract.setTemplateCID(2, "QmCertifiedProductCertTemplate_v1");   // CERTIFIED_PRODUCT
  console.log("✅ IPFS template CIDs set\n");

  // ==================================================================
  //  FLOW A: GOLD
  // ==================================================================
  console.log("━".repeat(70));
  console.log("  FLOW A  ──  GOLD  (South Africa → Rand Refinery → LBMA bar)");
  console.log("━".repeat(70));

  const extractedAtGold = Math.floor(Date.now() / 1000);

  // --- 4a. Register Gold Ore  (miner) ---
  const txOreGold = await contract.connect(miner).registerOre(
    Metal.GOLD,              // metal
    "MINE-ZA-DRIEFONTEIN",   // mineId
    "South Africa",          // originCountry
    "reef",                  // mineralType (Witwatersrand reef)
    extractedAtGold,         // extractedAt
    50000,                   // weightGrams  (50 kg ore)
    "8 g/t"                  // estimatedGrade (grams gold per tonne)
  );
  const rcOreGold = await txOreGold.wait();

  let goldOreId;
  for (const log of rcOreGold.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "OreExtracted") { goldOreId = parsed.args[0]; break; }
    } catch { /* skip */ }
  }

  console.log("\n── Gold Ore Extracted ──");
  console.log(`  ID       : ${goldOreId}`);
  console.log(`  QR       : ${buildQrString(31337, contractAddress, "RAW_ORE", goldOreId)}`);

  const oreRec = await contract.getRawOre(goldOreId);
  console.log(`  Mine     : ${oreRec.mineId}`);
  console.log(`  Country  : ${oreRec.originCountry}`);
  console.log(`  Type     : ${oreRec.mineralType}`);
  console.log(`  Weight   : ${oreRec.weightGrams}g`);
  console.log(`  Grade    : ${oreRec.estimatedGrade}`);

  const oreValid = await contract.verifyOre(
    goldOreId, Metal.GOLD, "MINE-ZA-DRIEFONTEIN", "South Africa", "reef",
    extractedAtGold, 50000, "8 g/t", miner.address
  );
  console.log(`  Verified : ${oreValid}\n`);

  // --- 5a. Transfer ore to refiner ---
  await contract.connect(miner).transferCustody(0, goldOreId, refiner.address);
  console.log("  ➜ Custody: Miner → Refiner\n");

  // --- 6a. Refine into gold bar ---
  const refinedAtGold = extractedAtGold + 86400 * 3; // +3 days

  const txBarGold = await contract.connect(refiner).refine(
    [goldOreId],             // inputOreIds
    Metal.GOLD,              // metal
    "RAND-REFINERY-ZA",      // refineryId
    refinedAtGold,           // refinedAt
    400,                     // outputWeightGrams (400g = ~12.86 troy oz)
    9999,                    // finenessPPT (999.9‰)
    "RR-2026-001234"         // barSerialNumber
  );
  const rcBarGold = await txBarGold.wait();

  let goldBarId;
  for (const log of rcBarGold.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "BarRefined") { goldBarId = parsed.args[0]; break; }
    } catch { /* skip */ }
  }

  console.log("── Gold Bar Refined ──");
  console.log(`  ID       : ${goldBarId}`);
  console.log(`  QR       : ${buildQrString(31337, contractAddress, "REFINED_BAR", goldBarId)}`);

  const barRec = await contract.getRefinedBar(goldBarId);
  console.log(`  Refinery : ${barRec.refineryId}`);
  console.log(`  Serial   : ${barRec.barSerialNumber}`);
  console.log(`  Weight   : ${barRec.outputWeightGrams}g`);
  console.log(`  Fineness : ${barRec.finenessPPT}‰`);

  const barValid = await contract.verifyBar(
    goldBarId, [goldOreId], Metal.GOLD, "RAND-REFINERY-ZA",
    refinedAtGold, 400, 9999, "RR-2026-001234", refiner.address
  );
  console.log(`  Verified : ${barValid}\n`);

  // --- 7a. Transfer bar to assayer ---
  await contract.connect(refiner).transferCustody(1, goldBarId, assayer.address);
  console.log("  ➜ Custody: Refiner → Assayer\n");

  // --- 8a. Certify gold product ---
  const certifiedAtGold = refinedAtGold + 86400 * 2; // +2 days

  const txProdGold = await contract.connect(assayer).certify(
    goldBarId,
    Metal.GOLD,
    "LBMA-ASSAYER-UK-003",
    certifiedAtGold,
    400,                      // weightGrams
    9999,                     // finenessPPT
    "LBMA Good Delivery",     // hallmark
    "AU-BAR-400G-9999-001",   // sku
    "bar"                     // productType
  );
  const rcProdGold = await txProdGold.wait();

  let goldProductId;
  for (const log of rcProdGold.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "ProductCertified") { goldProductId = parsed.args[0]; break; }
    } catch { /* skip */ }
  }

  console.log("── Gold Product Certified ──");
  console.log(`  ID       : ${goldProductId}`);
  console.log(`  QR       : ${buildQrString(31337, contractAddress, "CERTIFIED_PRODUCT", goldProductId)}`);

  const prodRec = await contract.getCertifiedProduct(goldProductId);
  console.log(`  Hallmark : ${prodRec.hallmark}`);
  console.log(`  SKU      : ${prodRec.sku}`);
  console.log(`  Type     : ${prodRec.productType}`);
  console.log(`  Weight   : ${prodRec.weightGrams}g`);
  console.log(`  Fineness : ${prodRec.finenessPPT}‰`);

  const prodValid = await contract.verifyProduct(
    goldProductId, goldBarId, Metal.GOLD, "LBMA-ASSAYER-UK-003",
    certifiedAtGold, 400, 9999, "LBMA Good Delivery",
    "AU-BAR-400G-9999-001", "bar", assayer.address
  );
  console.log(`  Verified : ${prodValid}\n`);

  // --- 9a. Transfer to dealer ---
  await contract.connect(assayer).transferCustody(2, goldProductId, dealer.address);
  const updatedGold = await contract.getCertifiedProduct(goldProductId);
  console.log("  ➜ Custody: Assayer → Dealer");
  console.log(`  Dealer   : ${updatedGold.currentCustodian}\n`);

  // ==================================================================
  //  FLOW B: SILVER
  // ==================================================================
  console.log("━".repeat(70));
  console.log("  FLOW B  ──  SILVER  (Mexico → ASAHI Refinery → 1000oz bar)");
  console.log("━".repeat(70));

  const extractedAtSilver = Math.floor(Date.now() / 1000);

  // --- 4b. Register Silver Ore ---
  const txOreSilver = await contract.connect(miner).registerOre(
    Metal.SILVER,
    "MINE-MX-FRESNILLO",
    "Mexico",
    "lode",
    extractedAtSilver,
    200000,                // 200 kg ore
    "350 g/t"              // silver grade
  );
  const rcOreSilver = await txOreSilver.wait();

  let silverOreId;
  for (const log of rcOreSilver.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "OreExtracted") { silverOreId = parsed.args[0]; break; }
    } catch { /* skip */ }
  }

  console.log("\n── Silver Ore Extracted ──");
  console.log(`  ID       : ${silverOreId}`);
  const silverOreRec = await contract.getRawOre(silverOreId);
  console.log(`  Mine     : ${silverOreRec.mineId}`);
  console.log(`  Country  : ${silverOreRec.originCountry}`);
  console.log(`  Weight   : ${silverOreRec.weightGrams}g\n`);

  // --- Transfer & refine silver ---
  await contract.connect(miner).transferCustody(0, silverOreId, refiner.address);
  console.log("  ➜ Custody: Miner → Refiner\n");

  const refinedAtSilver = extractedAtSilver + 86400 * 5;

  const txBarSilver = await contract.connect(refiner).refine(
    [silverOreId],
    Metal.SILVER,
    "ASAHI-REFINERY-US",
    refinedAtSilver,
    31103,                 // ~1000 troy oz in grams
    9990,                  // 999.0‰
    "ASH-AG-2026-005678"
  );
  const rcBarSilver = await txBarSilver.wait();

  let silverBarId;
  for (const log of rcBarSilver.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "BarRefined") { silverBarId = parsed.args[0]; break; }
    } catch { /* skip */ }
  }

  console.log("── Silver Bar Refined ──");
  console.log(`  ID       : ${silverBarId}`);
  const silverBarRec = await contract.getRefinedBar(silverBarId);
  console.log(`  Refinery : ${silverBarRec.refineryId}`);
  console.log(`  Serial   : ${silverBarRec.barSerialNumber}`);
  console.log(`  Weight   : ${silverBarRec.outputWeightGrams}g (~1000 ozt)`);
  console.log(`  Fineness : ${silverBarRec.finenessPPT}‰\n`);

  // --- Certify silver ---
  await contract.connect(refiner).transferCustody(1, silverBarId, assayer.address);
  console.log("  ➜ Custody: Refiner → Assayer\n");

  const certifiedAtSilver = refinedAtSilver + 86400;

  const txProdSilver = await contract.connect(assayer).certify(
    silverBarId,
    Metal.SILVER,
    "COMEX-ASSAYER-US-011",
    certifiedAtSilver,
    31103,
    9990,
    "COMEX Approved",
    "AG-BAR-1000OZ-999-001",
    "bar"
  );
  const rcProdSilver = await txProdSilver.wait();

  let silverProductId;
  for (const log of rcProdSilver.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed && parsed.name === "ProductCertified") { silverProductId = parsed.args[0]; break; }
    } catch { /* skip */ }
  }

  console.log("── Silver Product Certified ──");
  console.log(`  ID       : ${silverProductId}`);
  const silverProdRec = await contract.getCertifiedProduct(silverProductId);
  console.log(`  Hallmark : ${silverProdRec.hallmark}`);
  console.log(`  SKU      : ${silverProdRec.sku}`);
  console.log(`  Weight   : ${silverProdRec.weightGrams}g\n`);

  await contract.connect(assayer).transferCustody(2, silverProductId, dealer.address);
  console.log("  ➜ Custody: Assayer → Dealer\n");

  // ------------------------------------------------------------------
  // Template CIDs
  // ------------------------------------------------------------------
  const oreCID  = await contract.getTemplateCID(0);
  const barCID  = await contract.getTemplateCID(1);
  const prodCID = await contract.getTemplateCID(2);
  console.log("── IPFS Template CIDs ──");
  console.log(`  RAW_ORE           : ${oreCID}`);
  console.log(`  REFINED_BAR       : ${barCID}`);
  console.log(`  CERTIFIED_PRODUCT : ${prodCID}`);

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------
  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY – All Computed IDs");
  console.log("=".repeat(70));
  console.log("  GOLD FLOW:");
  console.log(`    Ore     : ${goldOreId}`);
  console.log(`    Bar     : ${goldBarId}`);
  console.log(`    Product : ${goldProductId}`);
  console.log("  SILVER FLOW:");
  console.log(`    Ore     : ${silverOreId}`);
  console.log(`    Bar     : ${silverBarId}`);
  console.log(`    Product : ${silverProductId}`);
  console.log("=".repeat(70));
  console.log("\n✅ Demo complete – full gold & silver provenance recorded on-chain.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
