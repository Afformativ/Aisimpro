/**
 * Deploy GoldSilverTraceability to a live network
 *
 * Usage:
 *   npx hardhat run scripts/deploy-traceability.cjs --network zkevm-testnet
 *   npx hardhat run scripts/deploy-traceability.cjs --network amoy
 *   npx hardhat run scripts/deploy-traceability.cjs --network localhost
 *
 * Pre-reqs:
 *   - PRIVATE_KEY set in .env
 *   - Sufficient native tokens (POL / ETH) on the target network
 *   - `npx hardhat compile` already ran
 */

const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = hre.network.name;
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║  Deploy GoldSilverTraceability                      ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Network   : ${network} (chainId ${hre.network.config.chainId || "?"})`);
  console.log(`  Deployer  : ${deployer.address}`);
  console.log(`  Balance   : ${hre.ethers.formatEther(balance)} native`);
  console.log();

  if (balance === 0n) {
    console.error("❌ Zero balance – get testnet tokens first.");
    process.exit(1);
  }

  // Deploy
  console.log("⛏️  Deploying GoldSilverTraceability …");
  const Factory = await hre.ethers.getContractFactory("GoldSilverTraceability");
  const contract = await Factory.deploy(deployer.address);   // superAdmin = deployer
  await contract.waitForDeployment();
  const addr = await contract.getAddress();

  console.log(`✅ Deployed at: ${addr}`);

  // ── Grant all roles to deployer (so the API can call every function) ──
  const ROLES = [
    "MINER_ROLE",
    "REFINER_ROLE",
    "ASSAYER_ROLE",
    "DEALER_ROLE",
    "AUDITOR_ROLE",
    "ADMIN_ROLE",
  ];

  console.log("\n🔑 Granting roles to deployer …");
  for (const name of ROLES) {
    const roleHash = await contract[name]();
    const tx = await contract.grantRole(roleHash, deployer.address);
    await tx.wait();
    console.log(`   ✔ ${name}`);
  }

  // ── Quick smoke test (localhost only — saves gas on live networks) ──
  if (network === "localhost" || network === "hardhat") {
    console.log("\n🧪 Smoke test — register a Gold ore …");
    const ts = Math.floor(Date.now() / 1000);
    const tx = await contract.registerOre(
      0,                   // GOLD
      "SMOKE-TEST-MINE",
      "ZZ",                // country
      "test-ore",
      ts,
      1000,                // 1 kg
      "test grade"
    );
    const receipt = await tx.wait();
    console.log(`   TX  : ${receipt.hash}`);
    console.log(`   Block: ${receipt.blockNumber}`);
  } else {
    console.log("\n⏩ Skipping smoke test on live network to save gas.");
  }

  // Explorer URL
  const explorers = {
    amoy: "https://amoy.polygonscan.com",
    "zkevm-testnet": "https://cardona-zkevm.polygonscan.com",
    localhost: null,
  };
  const explorer = explorers[network];
  if (explorer) {
    console.log(`   🔗 ${explorer}/address/${addr}`);
  }

  // Summary
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Add to your .env:");
  console.log(`  TRACEABILITY_CONTRACT_ADDRESS=${addr}`);
  if (network === "zkevm-testnet") {
    console.log(`  TRACEABILITY_RPC_URL=https://rpc.cardona.zkevm-rpc.com`);
    console.log(`  TRACEABILITY_EXPLORER=https://cardona-zkevm.polygonscan.com`);
  } else if (network === "amoy") {
    console.log(`  TRACEABILITY_RPC_URL=https://rpc-amoy.polygon.technology`);
    console.log(`  TRACEABILITY_EXPLORER=https://amoy.polygonscan.com`);
  }
  console.log("═══════════════════════════════════════════════════════");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
