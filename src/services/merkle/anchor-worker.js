/**
 * Merkle Root Anchor Worker
 * 
 * Reads closed/unanchored AnchorBatches and submits their Merkle roots
 * on-chain via the updated EventLogger contract.
 * 
 * Features:
 *   - Exponential back-off with jitter on transient failures
 *   - Configurable confirmation count
 *   - Dead-letter tagging after max retries
 *   - Writes txHash / blockNumber / blockTime back to AnchorBatch
 *   - Supports optional root chaining fields
 */

import store from './store.js';
import { AnchorBatchStatus } from './models.js';
import anchoringService from '../anchoring.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_RETRIES = parseInt(process.env.MERKLE_ANCHOR_MAX_RETRIES || '5', 10);
const BASE_DELAY_MS = parseInt(process.env.MERKLE_ANCHOR_BASE_DELAY_MS || '2000', 10);
const CONFIRMATIONS = parseInt(process.env.MERKLE_ANCHOR_CONFIRMATIONS || '1', 10);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Process all closed-but-unanchored batches.
 * Intended to be called periodically (cron, setInterval, or event-driven).
 * 
 * @returns {Array<{ batchId: string, success: boolean, txHash?: string, error?: string }>}
 */
export async function processUnanchoredBatches() {
  const closed = store.getAnchorBatchesByStatus(AnchorBatchStatus.CLOSED);
  const results = [];

  for (const batch of closed) {
    const result = await anchorBatch(batch.batchId);
    results.push(result);
  }

  return results;
}

/**
 * Anchor a single batch's Merkle root on-chain.
 * 
 * @param {string} batchId
 * @param {number} [attempt=0]
 * @returns {{ batchId: string, success: boolean, txHash?: string, error?: string }}
 */
export async function anchorBatch(batchId, attempt = 0) {
  const batch = store.getAnchorBatch(batchId);
  if (!batch) {
    return { batchId, success: false, error: 'Batch not found' };
  }

  // Guard: only anchor CLOSED batches
  if (batch.status !== AnchorBatchStatus.CLOSED && batch.status !== AnchorBatchStatus.FAILED) {
    return { batchId, success: false, error: `Batch in unexpected status: ${batch.status}` };
  }

  // Mark as anchoring
  batch.status = AnchorBatchStatus.ANCHORING;
  store.saveAnchorBatch(batch);

  try {
    const anchorResult = await anchoringService.anchorMerkleRoot({
      merkleRoot: batch.merkleRoot,
      batchId: batch.batchId,
      scopeType: batch.scopeType,
      scopeId: batch.scopeId,
      schemaVersion: batch.canonicalizationVersion || '1.0.0',
      treeAlgo: batch.treeAlgo,
      prevChainedRoot: batch.prevChainedRoot,
      chainedRoot: batch.chainedRoot,
    });

    if (!anchorResult.success) {
      throw new Error(anchorResult.error || 'Anchor transaction failed');
    }

    // Update batch with chain info
    batch.anchorTxHash = anchorResult.txHash;
    batch.anchorBlockNumber = anchorResult.blockNumber || null;
    batch.anchorBlockTime = anchorResult.timestamp || new Date().toISOString();
    batch.anchorChainId = anchoringService.getNetworkInfo().chainId || null;
    batch.status = AnchorBatchStatus.ANCHORED;
    store.saveAnchorBatch(batch);

    store._log('ANCHOR', 'AnchorBatch', batchId, {
      txHash: anchorResult.txHash,
      blockNumber: anchorResult.blockNumber,
      simulated: anchorResult.simulated,
    });

    return {
      batchId,
      success: true,
      txHash: anchorResult.txHash,
      blockNumber: anchorResult.blockNumber,
      simulated: !!anchorResult.simulated,
    };
  } catch (err) {
    // Retry with exponential back-off
    if (attempt < MAX_RETRIES) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 500;
      batch.status = AnchorBatchStatus.CLOSED; // revert to closed for retry
      store.saveAnchorBatch(batch);

      await new Promise(r => setTimeout(r, delay));
      return anchorBatch(batchId, attempt + 1);
    }

    // Dead-letter
    batch.status = AnchorBatchStatus.FAILED;
    store.saveAnchorBatch(batch);

    store._log('ANCHOR_FAILED', 'AnchorBatch', batchId, {
      error: err.message,
      attempts: attempt + 1,
    });

    return { batchId, success: false, error: err.message };
  }
}

/**
 * Retry all failed batches (manual trigger).
 * @returns {Array<{ batchId: string, success: boolean, txHash?: string, error?: string }>}
 */
export async function retryFailedBatches() {
  const failed = store.getAnchorBatchesByStatus(AnchorBatchStatus.FAILED);
  const results = [];
  for (const b of failed) {
    // Reset to closed so anchor() can pick them up
    b.status = AnchorBatchStatus.CLOSED;
    store.saveAnchorBatch(b);
    results.push(await anchorBatch(b.batchId));
  }
  return results;
}
