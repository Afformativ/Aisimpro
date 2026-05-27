/**
 * Merkle Anchoring – Public Façade
 * 
 * Re-exports all sub-modules through a single entry point.
 * Feature-flag: entire module is no-op when MERKLE_ANCHORING_ENABLED !== 'true'.
 */

// Sub-modules
export { CANONICALIZATION_VERSION, canonicalize, buildCanonicalCertificatePayload, normalizeTimestamp, deepSortAndNormalize } from './canonicalization.js';
export { TREE_ALGO, buildTree, buildTreeWithProofs, getInclusionProof, verifyProof, hashPair, sha256Hex } from './tree.js';
export { AnchorBatchStatus, ScopeType, createCertificatePackage, createAnchorBatch, createInclusionProof } from './models.js';
export {
  ingestCertificate,
  closeBatch,
  closeBatchesByScope,
  closeStaleBatches,
  getOpenBatch,
  getClosedUnanchoredBatches,
  getAnchorBatch,
  getCertificatePackage,
  getInclusionProof as getProof,
  getInclusionProofsForCertificate,
  getAllAnchorBatches,
  getAllCertificatePackages,
  getMetrics,
  getMerkleAuditLog,
} from './batching.js';
export { processUnanchoredBatches, anchorBatch as anchorSingleBatch, retryFailedBatches } from './anchor-worker.js';
export { verifyCertificate, verifyStandalone, verifyBatchContinuity, exportVerificationPackage } from './verification.js';

// Traceability bridge (gold & silver mining provenance integration)
export {
  TRACEABILITY_SCHEMA_VERSION,
  buildOreExtractedLeaf,
  buildBarRefinedLeaf,
  buildProductCertifiedLeaf,
  buildCustodyTransferredLeaf,
  ingestTraceabilityEvent,
  attachContractListeners,
} from './traceability-bridge.js';

// Re-export store for direct access if needed
export { default as merkleStore } from './store.js';

// ---------------------------------------------------------------------------
// Feature flag helper
// ---------------------------------------------------------------------------

/**
 * @returns {boolean} Whether Merkle anchoring is enabled
 */
export function isMerkleAnchoringEnabled() {
  return process.env.MERKLE_ANCHORING_ENABLED === 'true';
}
