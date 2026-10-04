/**
 * ZK demo claims
 * Prepared proof bundles for the ZK Claims page. The file holds only public
 * data (ore id, proof, public signals, attestation); the secret values and
 * salts never leave the machine that ran scripts/seed-zk-demo.mjs.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = join(__dirname, '..', '..', 'zk', 'demo', 'demo-claims.json');

function toPublicClaim(claim) {
  const attestation = claim.attestation?.txHash
    ? { txHash: String(claim.attestation.txHash), explorerUrl: claim.attestation.explorerUrl || null }
    : null;
  return {
    id: String(claim.id),
    label: String(claim.label),
    oreId: String(claim.oreId),
    proof: claim.proof || null,
    publicSignals: Array.isArray(claim.publicSignals) ? claim.publicSignals.map(String) : null,
    attestation,
  };
}

export function loadDemoClaims() {
  const file = process.env.ZK_DEMO_CLAIMS_FILE || DEFAULT_FILE;
  if (!existsSync(file)) return [];
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const claims = Array.isArray(raw) ? raw : raw.claims || [];
  return claims.map(toPublicClaim);
}
