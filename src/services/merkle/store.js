/**
 * Merkle Store
 * 
 * In-memory (+ optional file-persistence) storage for Merkle anchoring
 * entities: CertificatePackage, AnchorBatch, InclusionProof.
 * 
 * Follows the same Map-based pattern as the existing Database /
 * PersistentDatabase classes so it can be swapped for MongoDB later.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../../data');
const PERSIST = process.env.DB_TYPE === 'file' || process.env.DB_TYPE === undefined;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadMap(collection) {
  if (!PERSIST) return new Map();
  const fp = path.join(DATA_DIR, `merkle_${collection}.json`);
  try {
    if (fs.existsSync(fp)) {
      return new Map(Object.entries(JSON.parse(fs.readFileSync(fp, 'utf-8'))));
    }
  } catch { /* ignore */ }
  return new Map();
}

function saveMap(collection, map) {
  if (!PERSIST) return;
  ensureDir(DATA_DIR);
  const fp = path.join(DATA_DIR, `merkle_${collection}.json`);
  fs.writeFileSync(fp, JSON.stringify(Object.fromEntries(map), null, 2));
}

// ---------------------------------------------------------------------------
// MerkleStore class
// ---------------------------------------------------------------------------

class MerkleStore {
  constructor() {
    /** @type {Map<string, object>} certificateId → CertificatePackage */
    this.certificatePackages = loadMap('certificatePackages');
    /** @type {Map<string, object>} batchId → AnchorBatch */
    this.anchorBatches = loadMap('anchorBatches');
    /** @type {Map<string, object>} `${certificateId}:${batchId}` → InclusionProof */
    this.inclusionProofs = loadMap('inclusionProofs');
    /** Ordered list of certificate IDs per batch */
    this.batchLeaves = loadMap('batchLeaves'); // batchId → string[]
    /** Audit trail for merkle operations */
    this.merkleAuditLog = [];
  }

  // ----- audit ----------------------------------------------------------

  _log(action, entityType, entityId, data = {}, userId = 'system') {
    this.merkleAuditLog.push({
      timestamp: new Date().toISOString(),
      action,
      entityType,
      entityId,
      userId,
      dataSummary: JSON.stringify(data).substring(0, 500),
    });
  }

  getMerkleAuditLog(entityId = null) {
    if (entityId) return this.merkleAuditLog.filter(e => e.entityId === entityId);
    return [...this.merkleAuditLog];
  }

  // ----- CertificatePackage ---------------------------------------------

  saveCertificatePackage(pkg) {
    this.certificatePackages.set(pkg.certificateId, pkg);
    saveMap('certificatePackages', this.certificatePackages);
    this._log('CREATE', 'CertificatePackage', pkg.certificateId, pkg);
    return pkg;
  }

  getCertificatePackage(certificateId) {
    return this.certificatePackages.get(certificateId) || null;
  }

  getCertificatePackageByHash(contentHash) {
    return Array.from(this.certificatePackages.values()).find(
      p => p.contentHash === contentHash
    ) || null;
  }

  getCertificatePackagesByScope({ shipmentId, lotId, dayBucket }) {
    return Array.from(this.certificatePackages.values()).filter(p => {
      if (shipmentId && p.shipmentId !== shipmentId) return false;
      if (lotId && p.lotId !== lotId) return false;
      if (dayBucket && p.dayBucket !== dayBucket) return false;
      return true;
    });
  }

  getAllCertificatePackages() {
    return Array.from(this.certificatePackages.values());
  }

  // ----- AnchorBatch -----------------------------------------------------

  saveAnchorBatch(batch) {
    this.anchorBatches.set(batch.batchId, batch);
    saveMap('anchorBatches', this.anchorBatches);
    this._log(
      batch.status === 'open' ? 'CREATE' : 'UPDATE',
      'AnchorBatch',
      batch.batchId,
      batch
    );
    return batch;
  }

  getAnchorBatch(batchId) {
    return this.anchorBatches.get(batchId) || null;
  }

  getAnchorBatchByScope(scopeId, status = null) {
    return Array.from(this.anchorBatches.values()).find(b => {
      if (b.scopeId !== scopeId) return false;
      if (status && b.status !== status) return false;
      return true;
    }) || null;
  }

  getAnchorBatchesByStatus(status) {
    return Array.from(this.anchorBatches.values()).filter(b => b.status === status);
  }

  getAnchorBatchByTxHash(txHash) {
    return Array.from(this.anchorBatches.values()).find(
      b => b.anchorTxHash === txHash
    ) || null;
  }

  getAllAnchorBatches() {
    return Array.from(this.anchorBatches.values());
  }

  getLastAnchoredBatch() {
    const anchored = this.getAnchorBatchesByStatus('anchored');
    if (anchored.length === 0) return null;
    anchored.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    return anchored[0];
  }

  // ----- Batch Leaves (ordered cert IDs per batch) -----------------------

  appendLeaf(batchId, certificateId) {
    const current = this.batchLeaves.get(batchId) || [];
    if (!current.includes(certificateId)) {
      current.push(certificateId);
      this.batchLeaves.set(batchId, current);
      saveMap('batchLeaves', this.batchLeaves);
    }
    return current;
  }

  getLeaves(batchId) {
    return this.batchLeaves.get(batchId) || [];
  }

  // ----- InclusionProof --------------------------------------------------

  saveInclusionProof(proof) {
    const key = `${proof.certificateId}:${proof.batchId}`;
    this.inclusionProofs.set(key, proof);
    saveMap('inclusionProofs', this.inclusionProofs);
    this._log('CREATE', 'InclusionProof', key, proof);
    return proof;
  }

  getInclusionProof(certificateId, batchId) {
    return this.inclusionProofs.get(`${certificateId}:${batchId}`) || null;
  }

  getInclusionProofsForCertificate(certificateId) {
    return Array.from(this.inclusionProofs.values()).filter(
      p => p.certificateId === certificateId
    );
  }

  getInclusionProofsForBatch(batchId) {
    return Array.from(this.inclusionProofs.values()).filter(
      p => p.batchId === batchId
    );
  }

  // ----- Metrics helpers -------------------------------------------------

  getMetrics() {
    const batches = this.getAllAnchorBatches();
    const anchored = batches.filter(b => b.status === 'anchored');
    const failed = batches.filter(b => b.status === 'failed');
    const open = batches.filter(b => b.status === 'open');
    const leafCounts = anchored.map(b => b.leafCount);
    const avgLeaves = leafCounts.length > 0
      ? leafCounts.reduce((a, b) => a + b, 0) / leafCounts.length
      : 0;

    return {
      totalCertificatePackages: this.certificatePackages.size,
      totalAnchorBatches: batches.length,
      openBatches: open.length,
      anchoredBatches: anchored.length,
      failedBatches: failed.length,
      totalInclusionProofs: this.inclusionProofs.size,
      avgCertificatesPerBatch: Math.round(avgLeaves * 100) / 100,
    };
  }
}

// Singleton
const merkleStore = new MerkleStore();
export default merkleStore;
export { MerkleStore };
