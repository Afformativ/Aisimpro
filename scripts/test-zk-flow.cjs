const hre = require("hardhat");

async function main() {
  const { default: zkOreProofService } = await import("../src/services/zk-ore-proof.js");
  const ethers = hre.ethers;
  const [deployer, miner, auditor] = await ethers.getSigners();

  const VerifierFactory = await ethers.getContractFactory("OreSelectiveDisclosureVerifier");
  const verifier = await VerifierFactory.deploy();
  await verifier.waitForDeployment();

  const TraceabilityFactory = await ethers.getContractFactory("GoldSilverTraceability");
  const traceability = await TraceabilityFactory.deploy(deployer.address);
  await traceability.waitForDeployment();

  const MINER_ROLE = await traceability.MINER_ROLE();
  const ADMIN_ROLE = await traceability.ADMIN_ROLE();
  await (await traceability.grantRole(MINER_ROLE, miner.address)).wait();
  await (await traceability.grantRole(ADMIN_ROLE, deployer.address)).wait();
  await (await traceability.setOreDisclosureVerifier(await verifier.getAddress())).wait();

  const hidden = {
    countryCode: "CA",
    gradeValue: 825n,
    salt: 123456789n,
  };

  const commitmentData = await zkOreProofService.computeCommitment(hidden);
  const tx = await traceability.connect(miner).registerOrePrivate(
    0,
    "MINE-CA-DEMO",
    "reef",
    1710000000,
    125000,
    commitmentData.commitment
  );
  const receipt = await tx.wait();
  const oreEvent = receipt.logs
    .map((log) => {
      try { return traceability.interface.parseLog(log); } catch { return null; }
    })
    .find((parsed) => parsed && parsed.name === "OreExtracted");

  if (!oreEvent) {
    throw new Error("OreExtracted event not found");
  }

  const oreId = oreEvent.args[0];
  const onChainCommitment = await traceability.getOrePrivacyCommitment(oreId);
  if (onChainCommitment.toString() !== commitmentData.commitment) {
    throw new Error("Stored commitment mismatch");
  }

  const proofResult = await zkOreProofService.generateProof({
    ...hidden,
    minGrade: 800,
    allowedCountries: ["CA", "US", "AU"],
    expectedCommitment: onChainCommitment.toString(),
  });

  if (!proofResult.verified) {
    throw new Error("Local Groth16 verification failed");
  }

  const valid = await traceability.connect(auditor).verifyOreSelectiveDisclosure(
    oreId,
    proofResult.solidity.a,
    proofResult.solidity.b,
    proofResult.solidity.c,
    proofResult.solidity.input
  );

  if (!valid) {
    throw new Error("On-chain Groth16 verification failed");
  }

  const attestTx = await traceability.connect(auditor).attestOreSelectiveDisclosure(
    oreId,
    proofResult.solidity.a,
    proofResult.solidity.b,
    proofResult.solidity.c,
    proofResult.solidity.input
  );
  await attestTx.wait();

  console.log(JSON.stringify({
    verifier: await verifier.getAddress(),
    traceability: await traceability.getAddress(),
    oreId,
    commitment: commitmentData.commitmentHex,
    proofVerifiedLocally: proofResult.verified,
    proofVerifiedOnChain: valid,
  }, null, 2));

  process.exit(0);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
