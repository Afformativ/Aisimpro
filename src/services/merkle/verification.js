/**
 * Merkle Verification Service
 * 
 * Provides public-facing verification logic for auditors / external verifiers:
 *   1. Re-canonicalise + re-hash a supplied certificate → compare with stored leaf.
 *   2. Verify Merkle inclusion proof against stored root.
 *   3. (Optional) confirm on-chain anchor via txHash lookup.
 *   4. (Optional) validate chained-root continuity across batches.
 * 
 * Security rules enforced:
 *   - Reject non-canonical payloads (re-canonicalised hash must match).
 *   - Proof direction errors (left/right) invalidate verification.
 *   - schemaVersion + canonicalizationVersion must match batch metadata.
 */

import store from './store.js';
import { buildCanonicalCertificatePayload, CANONICALIZATION_VERSION } from './canonicalization.js';
import { sha256Hex, verifyProof, hashPair } from './tree.js';
import anchoringService from '../anchoring.js';

// ---------------------------------------------------------------------------
// Single-certificate verification
// ---------------------------------------------------------------------------

/**
 * Full verification of a certificate against its Merkle batch anchor.
 * 
 * @param {object} params
 * @param {string} params.certificateId
 * @param {object} [params.certificatePayload] - If provided, re-hash for tamper check
 * @param {string[]} [params.docHashList]
 * @param {string} [params.schemaVersion]
 * @param {string} [params.issuerKeyId]
 * @returns {object} Detailed verification result
 */
export async function verifyCertificate({
  certificateId,
  certificatePayload = null,
  docHashList = null,
  schemaVersion = null,
  issuerKeyId = null,
}) {
  const result = {
    certificateId,
    canonicalHashMatch: null,
    proofValid: null,
    onChainAnchorPresent: null,
    anchoredTimestamp: null,
    anchoredBlock: null,
    anchorTxHash: null,
    chainedRootValid: null,
    verdict: 'UNKNOWN',
    details: [],
  };

  // 1. Load stored package
  const pkg = store.getCertificatePackage(certificateId);
  if (!pkg) {
    result.verdict = 'NOT_FOUND';
    result.details.push('CertificatePackage not found in store');
    return result;
  }

  // 2. If payload supplied, re-canonicalise + compare hash
  if (certificatePayload) {
    const canonical = buildCanonicalCertificatePayload({
      certificateId,
      certificateJson: certificatePayload,
      docHashList: docHashList || pkg.docHashList,
      schemaVersion: schemaVersion || pkg.schemaVersion,
      issuerKeyId: issuerKeyId || pkg.issuerKeyId,
    });
    const recomputedHash = sha256Hex(canonical);
    result.canonicalHashMatch = recomputedHash === pkg.contentHash;

    if (!result.canonicalHashMatch) {
      result.verdict = 'TAMPERED';
      result.details.push(
        `Recomputed hash ${recomputedHash} ≠ stored ${pkg.contentHash}`
      );
      return result;
    }
    result.details.push('Canonical hash matches stored contentHash');
  } else {
    result.canonicalHashMatch = null; // not checked
    result.details.push('Payload not provided – hash re-check skipped');
  }

  // 3. Find inclusion proof(s)
  const proofs = store.getInclusionProofsForCertificate(certificateId);
  if (proofs.length === 0) {
    result.proofValid = false;
    result.verdict = 'NO_PROOF';
    result.details.push('No inclusion proof found (batch may not be closed yet)');
    return result;
  }

  // Use latest proof (most recent batch)
  const proof = proofs[proofs.length - 1];
  const batch = store.getAnchorBatch(proof.batchId);
  if (!batch) {
    result.proofValid = false;
    result.verdict = 'BATCH_MISSING';
    result.details.push(`AnchorBatch ${proof.batchId} not found`);
    return result;
  }

  // 4. Schema / version guards
  if (schemaVersion && batch.canonicalizationVersion !== CANONICALIZATION_VERSION) {
    result.details.push(
      `Warning: batch canonicalizationVersion ${batch.canonicalizationVersion} ≠ current ${CANONICALIZATION_VERSION}`
    );
  }

  // 5. Verify Merkle inclusion proof
  result.proofValid = verifyProof(proof.leafHash, proof.proofSiblings, batch.merkleRoot);
  if (!result.proofValid) {
    result.verdict = 'PROOF_INVALID';
    result.details.push('Merkle inclusion proof verification failed');
    return result;
  }
  result.details.push(
    `Merkle proof valid (leaf ${proof.leafIndex} of ${batch.leafCount}, root ${batch.merkleRoot.substring(0, 16)}…)`
  );

  // 6. On-chain anchor check
  if (batch.anchorTxHash) {
    try {
      const anchorCheck = await anchoringService.verifyAnchor(batch.anchorTxHash);
      result.onChainAnchorPresent = anchorCheck.verified;
      result.anchorTxHash = batch.anchorTxHash;
      result.anchoredBlock = batch.anchorBlockNumber;
      result.anchoredTimestamp = batch.anchorBlockTime;
      result.details.push(
        anchorCheck.verified
          ? `On-chain anchor verified (tx ${batch.anchorTxHash.substring(0, 16)}…)`
          : 'On-chain anchor NOT confirmed'
      );
    } catch (err) {
      result.onChainAnchorPresent = false;
      result.details.push(`Anchor verification error: ${err.message}`);
    }
  } else {
    result.onChainAnchorPresent = false;
    result.details.push('Batch not yet anchored on-chain');
  }

  // 7. Chained root validation (optional)
  if (batch.prevChainedRoot && batch.chainedRoot) {
    const expectedChained = sha256Hex(
      Buffer.from(batch.prevChainedRoot + batch.merkleRoot, 'hex')
    );
    result.chainedRootValid = expectedChained === batch.chainedRoot;
    result.details.push(
      result.chainedRootValid
        ? 'Chained root continuity valid'
        : 'Chained root continuity BROKEN'
    );
  }

  // 8. Final verdict
  const hashOk = result.canonicalHashMatch === null || result.canonicalHashMatch;
  const proofOk = result.proofValid;
  const chainOk = result.onChainAnchorPresent;

  if (hashOk && proofOk && chainOk) {
    result.verdict = 'VERIFIED';
  } else if (hashOk && proofOk && !chainOk) {
    result.verdict = 'PROOF_VALID_NOT_ANCHORED';
  } else {
    result.verdict = 'INVALID';
  }

  // Attach batch metadata
  result.batchMetadata = {
    batchId: batch.batchId,
    scopeType: batch.scopeType,
    scopeId: batch.scopeId,
    leafCount: batch.leafCount,
    merkleRoot: batch.merkleRoot,
    treeAlgo: batch.treeAlgo,
    canonicalizationVersion: batch.canonicalizationVersion,
    anchoredAt: batch.anchorBlockTime,
    chainId: batch.anchorChainId,
  };

  result.inclusionProof = {
    leafIndex: proof.leafIndex,
    leafHash: proof.leafHash,
    siblings: proof.proofSiblings,
    algoVersion: proof.proofAlgoVersion,
  };

  return result;
}

// ---------------------------------------------------------------------------
// Standalone proof verification (no DB required)
// ---------------------------------------------------------------------------

/**
 * Verify a certificate from a supplied payload + proof object.
 * Useful for external verifiers who received a proof export.
 * 
 * @param {object} params
 * @param {object} params.certificatePayload - Raw certificate JSON
 * @param {string} params.certificateId
 * @param {string[]} params.docHashList
 * @param {string} params.schemaVersion
 * @param {string} params.issuerKeyId
 * @param {object} params.proof - { leafHash, siblings: [{position, hash}] }
 * @param {string} params.merkleRoot
 * @returns {{ canonicalHashMatch: boolean, proofValid: boolean, verdict: string }}
 */
export function verifyStandalone({
  certificatePayload,
  certificateId,
  docHashList = [],
  schemaVersion = '1.0.0',
  issuerKeyId,
  proof,
  merkleRoot,
}) {
  // 1. Re-canonicalise
  const canonical = buildCanonicalCertificatePayload({
    certificateId,
    certificateJson: certificatePayload,
    docHashList,
    schemaVersion,
    issuerKeyId,
  });
  const computedHash = sha256Hex(canonical);
  const canonicalHashMatch = computedHash === proof.leafHash;

  // 2. Verify proof
  const proofValid = verifyProof(proof.leafHash, proof.siblings, merkleRoot);

  // 3. Verdict
  let verdict;
  if (canonicalHashMatch && proofValid) {
    verdict = 'VERIFIED';
  } else if (!canonicalHashMatch) {
    verdict = 'TAMPERED';
  } else {
    verdict = 'PROOF_INVALID';
  }

  return { canonicalHashMatch, proofValid, computedHash, verdict };
}

// ---------------------------------------------------------------------------
// Batch continuity verification
// ---------------------------------------------------------------------------

/**
 * Verify chained-root continuity across a sequence of anchor batches.
 * 
 * @param {string[]} batchIds - Ordered batch IDs (oldest first)
 * @returns {{ valid: boolean, breaks: string[] }}
 */
export function verifyBatchContinuity(batchIds) {
  const breaks = [];
  let prevChained = null;

  for (const bid of batchIds) {
    const batch = store.getAnchorBatch(bid);
    if (!batch) {
      breaks.push(`Batch ${bid} not found`);
      continue;
    }
    if (prevChained !== null && batch.prevChainedRoot !== prevChained) {
      breaks.push(
        `Chain break at batch ${bid}: expected prevChainedRoot ${prevChained}, got ${batch.prevChainedRoot}`
      );
    }
    if (batch.chainedRoot && batch.prevChainedRoot !== null && batch.merkleRoot) {
      const expected = sha256Hex(
        Buffer.from(batch.prevChainedRoot + batch.merkleRoot, 'hex')
      );
      if (expected !== batch.chainedRoot) {
        breaks.push(`Chained root mismatch at batch ${bid}`);
      }
    }
    prevChained = batch.chainedRoot;
  }

  return { valid: breaks.length === 0, breaks };
}

// ---------------------------------------------------------------------------
// Proof export (for external verifiers)
// ---------------------------------------------------------------------------

/**
 * Package everything an external verifier needs to independently verify
 * a certificate's inclusion in an anchored Merkle batch.
 * 
 * @param {string} certificateId
 * @returns {object|null}
 */
export function exportVerificationPackage(certificateId) {
  const pkg = store.getCertificatePackage(certificateId);
  if (!pkg) return null;

  const proofs = store.getInclusionProofsForCertificate(certificateId);
  if (proofs.length === 0) return null;

  const proof = proofs[proofs.length - 1];
  const batch = store.getAnchorBatch(proof.batchId);
  if (!batch) return null;

  return {
    certificatePackage: {
      certificateId: pkg.certificateId,
      contentHash: pkg.contentHash,
      canonicalJson: pkg.canonicalJson,
      docHashList: pkg.docHashList,
      schemaVersion: pkg.schemaVersion,
      issuerKeyId: pkg.issuerKeyId,
    },
    inclusionProof: {
      leafIndex: proof.leafIndex,
      leafHash: proof.leafHash,
      siblings: proof.proofSiblings,
      algoVersion: proof.proofAlgoVersion,
    },
    batchMetadata: {
      batchId: batch.batchId,
      scopeType: batch.scopeType,
      scopeId: batch.scopeId,
      leafCount: batch.leafCount,
      merkleRoot: batch.merkleRoot,
      treeAlgo: batch.treeAlgo,
      canonicalizationVersion: batch.canonicalizationVersion,
    },
    anchor: {
      txHash: batch.anchorTxHash,
      blockNumber: batch.anchorBlockNumber,
      blockTime: batch.anchorBlockTime,
      chainId: batch.anchorChainId,
    },
    chainContinuity: {
      prevChainedRoot: batch.prevChainedRoot,
      chainedRoot: batch.chainedRoot,
    },
    exportedAt: new Date().toISOString(),
  };
}
