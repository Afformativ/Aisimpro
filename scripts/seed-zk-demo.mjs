/**
 * Seed the two ZK demo batches and write their public proof bundles.
 *
 *   Demo batch A: approved country, grade above the threshold -> proof + attestation
 *   Demo batch B: approved country, grade below the threshold -> no proof
 *
 * Usage: node scripts/seed-zk-demo.mjs [output-file]
 *
 * Live mode needs TRACEABILITY_CONTRACT_ADDRESS and PRIVATE_KEY (an account with
 * MINER or ADMIN role) and a configured ore disclosure verifier. Without them the
 * contract service runs in simulation mode, which is enough for local UI work.
 * If they are set but the contract cannot be reached, the script stops and writes nothing.
 * Salts are random and are never written to disk.
 */

import 'dotenv/config';
import { randomBytes } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import traceabilityContract from '../src/services/traceability-contract.js';
import zkOreProofService from '../src/services/zk-ore-proof.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(process.argv[2] || join(__dirname, '..', 'zk', 'demo', 'demo-claims.json'));

const CLAIM = { minGrade: 500, allowedCountries: ['CA', 'AU', 'US'] };

const BATCHES = [
  { id: 'A', label: 'Demo batch A', mineId: 'MINE-0417', weightGrams: 125000, countryCode: 'CA', gradeValue: 825 },
  { id: 'B', label: 'Demo batch B', mineId: 'MINE-2093', weightGrams: 98000, countryCode: 'CA', gradeValue: 310 },
];

// 31 random bytes always stay below the BN254 field modulus.
const randomSalt = () => BigInt(`0x${randomBytes(31).toString('hex')}`);

// The seed only sends transactions, so skip the background scan of past events.
const status = await traceabilityContract.connect({ scanEvents: false });
const live = status && status.simulation === false && !status.error;
if (!live && process.env.TRACEABILITY_CONTRACT_ADDRESS && process.env.PRIVATE_KEY) {
  // A live run that cannot connect must not fall back to simulated batches.
  console.error(`Could not connect to the traceability contract (${status?.error || 'unknown error'}). Nothing was written.`);
  process.exit(1);
}
console.log(`Traceability contract: ${live ? `live at ${status.address}` : 'SIMULATION'}`);

const claims = [];
for (const batch of BATCHES) {
  const salt = randomSalt();
  const { commitment } = await zkOreProofService.computeCommitment({
    countryCode: batch.countryCode,
    gradeValue: batch.gradeValue,
    salt,
  });
  const ore = await traceabilityContract.registerOrePrivate({
    metal: 'GOLD',
    mineId: batch.mineId,
    mineralType: 'Gold ore',
    weightGrams: batch.weightGrams,
    privacyCommitment: commitment,
  });
  const claim = { id: batch.id, label: batch.label, oreId: ore.id, proof: null, publicSignals: null, attestation: null };

  let proofResult = null;
  try {
    proofResult = await zkOreProofService.generateProof({
      countryCode: batch.countryCode,
      gradeValue: batch.gradeValue,
      salt,
      ...CLAIM,
    });
  } catch (err) {
    // A batch that does not meet the claim cannot produce a proof.
    console.log(`${batch.label}: no proof (${String(err.message).split('\n')[0]})`);
  }

  if (proofResult) {
    claim.proof = proofResult.proof;
    claim.publicSignals = proofResult.publicSignals;
    const attestation = await traceabilityContract.attestOreSelectiveDisclosure(ore.id, proofResult.solidity);
    if (attestation.txHash) {
      claim.attestation = { txHash: attestation.txHash, explorerUrl: attestation.explorerUrl || null };
    } else if (live) {
      throw new Error(`${batch.label}: attestation returned no transaction hash`);
    }
  }

  claims.push(claim);
  console.log(`${batch.label}: ore ${ore.id}${claim.proof ? ', proof attached' : ''}${claim.attestation ? `, attested in ${claim.attestation.txHash}` : ''}`);
}

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify({ claim: CLAIM, claims }, null, 2)}\n`);
console.log(`Wrote ${claims.length} demo claims to ${outFile}`);
process.exit(0);
