/**
 * Merkle Domain Models
 * 
 * Factory functions for the three core entities introduced by
 * Merkle-root anchoring:
 *   - CertificatePackage  (off-chain, one per certificate)
 *   - AnchorBatch         (one per closure unit)
 *   - InclusionProof      (one per certificate-per-batch)
 */

import { v4 as uuidv4 } from 'uuid';
import { CANONICALIZATION_VERSION } from './canonicalization.js';
import { TREE_ALGO } from './tree.js';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const AnchorBatchStatus = {
  OPEN: 'open',
  CLOSING: 'closing',
  CLOSED: 'closed',
  ANCHORING: 'anchoring',
  ANCHORED: 'anchored',
  FAILED: 'failed',
};

export const ScopeType = {
  SHIPMENT: 'shipment',
  DAY: 'day',
  LOT: 'lot',
};

// ---------------------------------------------------------------------------
// CertificatePackage
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {object} CertificatePackage
 */
export function createCertificatePackage({
  certificateId = uuidv4(),
  shipmentId,
  lotId = null,
  dayBucket = null,
  canonicalJson,
  contentHash,
  docHashList = [],
  issuerKeyId,
  schemaVersion = '1.0.0',
}) {
  return {
    certificateId,
    shipmentId,
    lotId,
    dayBucket: dayBucket || new Date().toISOString().slice(0, 10), // YYYY-MM-DD
    canonicalJson,
    contentHash,
    docHashList,
    issuerKeyId,
    schemaVersion,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// AnchorBatch
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {object} AnchorBatch
 */
export function createAnchorBatch({
  batchId = uuidv4(),
  scopeType,
  scopeId,
  issuerKeyId = null,
  canonicalizationVersion = CANONICALIZATION_VERSION,
  treeAlgo = TREE_ALGO,
}) {
  return {
    batchId,
    scopeType,
    scopeId,
    leafCount: 0,
    merkleRoot: null,
    treeAlgo,
    canonicalizationVersion,
    issuerKeyId,
    openedAt: new Date().toISOString(),
    closedAt: null,
    anchorChainId: null,
    anchorTxHash: null,
    anchorBlockNumber: null,
    anchorBlockTime: null,
    status: AnchorBatchStatus.OPEN,
    prevChainedRoot: null,
    chainedRoot: null,
  };
}

// ---------------------------------------------------------------------------
// InclusionProof
// ---------------------------------------------------------------------------

/**
 * @param {object} params
 * @returns {object} InclusionProof
 */
export function createInclusionProof({
  certificateId,
  batchId,
  leafIndex,
  leafHash,
  proofSiblings,  // Array<{ position: 'left'|'right', hash: string }>
  proofAlgoVersion = TREE_ALGO,
}) {
  return {
    certificateId,
    batchId,
    leafIndex,
    leafHash,
    proofSiblings,
    proofAlgoVersion,
    generatedAt: new Date().toISOString(),
  };
}
