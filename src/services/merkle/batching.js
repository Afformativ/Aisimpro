/**
 * Batch Lifecycle Service
 * 
 * Manages the lifecycle of Merkle anchor batches:
 *   open  →  append leaves  →  close  →  (anchor worker handles the rest)
 * 
 * Closure triggers:
 *   1. Explicit close (shipment closed event)
 *   2. Daily cutoff (configurable, default midnight UTC)
 *   3. Max leaf threshold (configurable, default 1000)
 * 
 * Idempotency:
 *   - Repeated close on a closed batch returns the same root.
 *   - Protected by in-memory lock (process-level; use DB-level lock for multi-process).
 */

import { v4 as uuidv4 } from 'uuid';
import store from './store.js';
import {
  createCertificatePackage,
  createAnchorBatch,
  createInclusionProof,
  AnchorBatchStatus,
  ScopeType,
} from './models.js';
import {
  buildCanonicalCertificatePayload,
  CANONICALIZATION_VERSION,
} from './canonicalization.js';
import { sha256Hex, buildTreeWithProofs, TREE_ALGO } from './tree.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_LEAVES_PER_BATCH = parseInt(process.env.MERKLE_MAX_LEAVES || '1000', 10);
const DAILY_CUTOFF_HOUR = parseInt(process.env.MERKLE_DAILY_CUTOFF_HOUR || '0', 10); // UTC hour

// Simple in-process lock set (scope → true)
const _closeLocks = new Set();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ingest a certificate into the Merkle anchoring pipeline.
 * 
 * 1. Build canonical payload + hash → CertificatePackage.
 * 2. Resolve (or open) the current AnchorBatch for the scope.
 * 3. Append leaf hash to the batch.
 * 4. If the batch exceeds MAX_LEAVES, auto-close it.
 * 
 * @param {object} params
 * @param {string} params.certificateId
 * @param {object} params.certificateJson - Full certificate payload
 * @param {string[]} [params.docHashList] - Hashes of related documents
 * @param {string} params.shipmentId
 * @param {string} [params.lotId]
 * @param {string} params.issuerKeyId
 * @param {string} [params.schemaVersion]
 * @param {string} [params.scopeType] - 'shipment' | 'day' | 'lot'
 * @param {string} [params.userId] - Who is ingesting
 * @returns {{ certificatePackage: object, anchorBatch: object }}
 */
export function ingestCertificate({
  certificateId = uuidv4(),
  certificateJson,
  docHashList = [],
  shipmentId,
  lotId = null,
  issuerKeyId,
  schemaVersion = '1.0.0',
  scopeType = ScopeType.SHIPMENT,
  userId = 'system',
}) {
  // 1. Canonicalise + hash
  const canonicalJson = buildCanonicalCertificatePayload({
    certificateId,
    certificateJson,
    docHashList,
    schemaVersion,
    issuerKeyId,
  });
  const contentHash = sha256Hex(canonicalJson);

  // 2. Persist CertificatePackage
  const dayBucket = new Date().toISOString().slice(0, 10);
  const pkg = createCertificatePackage({
    certificateId,
    shipmentId,
    lotId,
    dayBucket,
    canonicalJson,
    contentHash,
    docHashList,
    issuerKeyId,
    schemaVersion,
  });
  store.saveCertificatePackage(pkg);

  // 3. Resolve scope ID
  const scopeId = resolveScopeId(scopeType, { shipmentId, lotId, dayBucket });

  // 4. Get or create open batch for this scope
  let batch = store.getAnchorBatchByScope(scopeId, AnchorBatchStatus.OPEN);
  if (!batch) {
    batch = createAnchorBatch({
      scopeType,
      scopeId,
      issuerKeyId,
    });
    store.saveAnchorBatch(batch);
  }

  // 5. Append leaf
  store.appendLeaf(batch.batchId, certificateId);
  batch.leafCount = store.getLeaves(batch.batchId).length;
  store.saveAnchorBatch(batch);

  store._log('INGEST', 'CertificatePackage', certificateId, { batchId: batch.batchId }, userId);

  // 6. Auto-close if threshold reached
  if (batch.leafCount >= MAX_LEAVES_PER_BATCH) {
    closeBatch(batch.batchId, userId);
  }

  return { certificatePackage: pkg, anchorBatch: batch };
}

/**
 * Close an AnchorBatch: compute Merkle root + generate inclusion proofs.
 * 
 * Idempotent: if the batch is already closed/anchoring/anchored,
 * returns existing data without recomputation.
 * 
 * @param {string} batchId
 * @param {string} [userId]
 * @returns {{ anchorBatch: object, proofCount: number }}
 */
export function closeBatch(batchId, userId = 'system') {
  const batch = store.getAnchorBatch(batchId);
  if (!batch) throw new Error(`AnchorBatch ${batchId} not found`);

  // Idempotency: already closed or further along
  if (batch.status !== AnchorBatchStatus.OPEN) {
    return { anchorBatch: batch, proofCount: store.getInclusionProofsForBatch(batchId).length };
  }

  // Process-level lock
  if (_closeLocks.has(batchId)) {
    return { anchorBatch: batch, proofCount: 0 };
  }
  _closeLocks.add(batchId);

  try {
    batch.status = AnchorBatchStatus.CLOSING;
    store.saveAnchorBatch(batch);

    // 1. Collect leaf hashes in deterministic order (certificateId ascending)
    const certIds = store.getLeaves(batchId);
    certIds.sort(); // lexicographic by certificateId

    const leafHashes = certIds.map(id => {
      const pkg = store.getCertificatePackage(id);
      if (!pkg) throw new Error(`CertificatePackage ${id} missing for batch ${batchId}`);
      return pkg.contentHash;
    });

    if (leafHashes.length === 0) {
      throw new Error(`Batch ${batchId} has no leaves`);
    }

    // 2. Build Merkle tree + proofs
    const { root, proofs } = buildTreeWithProofs(leafHashes);

    // 3. Optional root chaining
    const lastAnchored = store.getLastAnchoredBatch();
    const prevChainedRoot = lastAnchored?.chainedRoot || null;
    const chainedRoot = prevChainedRoot
      ? sha256Hex(Buffer.from(prevChainedRoot + root, 'hex'))
      : root;

    // 4. Update batch
    batch.merkleRoot = root;
    batch.leafCount = leafHashes.length;
    batch.closedAt = new Date().toISOString();
    batch.status = AnchorBatchStatus.CLOSED;
    batch.prevChainedRoot = prevChainedRoot;
    batch.chainedRoot = chainedRoot;
    store.saveAnchorBatch(batch);

    // 5. Generate + persist inclusion proofs
    proofs.forEach((p, idx) => {
      const proof = createInclusionProof({
        certificateId: certIds[idx],
        batchId,
        leafIndex: p.leafIndex,
        leafHash: p.leafHash,
        proofSiblings: p.siblings,
      });
      store.saveInclusionProof(proof);
    });

    store._log('CLOSE_BATCH', 'AnchorBatch', batchId, {
      merkleRoot: root,
      leafCount: leafHashes.length,
    }, userId);

    return { anchorBatch: batch, proofCount: proofs.length };
  } finally {
    _closeLocks.delete(batchId);
  }
}

/**
 * Close ALL open batches matching a scope (e.g., when a shipment is finalised).
 * 
 * @param {string} scopeId
 * @param {string} [userId]
 * @returns {Array<{ anchorBatch: object, proofCount: number }>}
 */
export function closeBatchesByScope(scopeId, userId = 'system') {
  const results = [];
  const openBatches = store.getAllAnchorBatches().filter(
    b => b.scopeId === scopeId && b.status === AnchorBatchStatus.OPEN
  );
  for (const b of openBatches) {
    results.push(closeBatch(b.batchId, userId));
  }
  return results;
}

/**
 * Close all open batches whose day bucket is before today (daily cutoff).
 * Intended to be called by a cron job or periodic timer.
 * 
 * @param {string} [userId]
 * @returns {number} Number of batches closed
 */
export function closeStaleBatches(userId = 'system') {
  const today = new Date().toISOString().slice(0, 10);
  let closed = 0;
  const openBatches = store.getAnchorBatchesByStatus(AnchorBatchStatus.OPEN);
  for (const b of openBatches) {
    // If scope type is 'day' and the day has passed, close
    if (b.scopeType === ScopeType.DAY && b.scopeId < today) {
      closeBatch(b.batchId, userId);
      closed++;
    }
  }
  return closed;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveScopeId(scopeType, { shipmentId, lotId, dayBucket }) {
  switch (scopeType) {
    case ScopeType.SHIPMENT:
      return shipmentId || 'default-shipment';
    case ScopeType.LOT:
      return lotId || 'default-lot';
    case ScopeType.DAY:
      return dayBucket || new Date().toISOString().slice(0, 10);
    default:
      return shipmentId || dayBucket || 'default';
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getOpenBatch(scopeId) {
  return store.getAnchorBatchByScope(scopeId, AnchorBatchStatus.OPEN);
}

export function getClosedUnanchoredBatches() {
  return store.getAnchorBatchesByStatus(AnchorBatchStatus.CLOSED);
}

export function getAnchorBatch(batchId) {
  return store.getAnchorBatch(batchId);
}

export function getCertificatePackage(certificateId) {
  return store.getCertificatePackage(certificateId);
}

export function getInclusionProof(certificateId, batchId) {
  return store.getInclusionProof(certificateId, batchId);
}

export function getInclusionProofsForCertificate(certificateId) {
  return store.getInclusionProofsForCertificate(certificateId);
}

export function getAllAnchorBatches() {
  return store.getAllAnchorBatches();
}

export function getAllCertificatePackages() {
  return store.getAllCertificatePackages();
}

export function getMetrics() {
  return store.getMetrics();
}

export function getMerkleAuditLog(entityId) {
  return store.getMerkleAuditLog(entityId);
}
