/**
 * Hashing Service
 * Provides cryptographic hashing for documents and event payloads
 * Uses RFC 8785 (Canonical JSON) for consistent hash computation
 */

import { createHash } from 'crypto';

/**
 * Canonicalize JSON per RFC 8785
 * - Sort object keys alphabetically
 * - Remove insignificant whitespace
 * - Handle special number cases
 */
export function canonicalizeJSON(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  
  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalizeJSON(item)).join(',') + ']';
  }
  
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys
    .filter(key => obj[key] !== undefined)
    .map(key => JSON.stringify(key) + ':' + canonicalizeJSON(obj[key]));
  
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute SHA-256 hash of any data
 */
export function sha256(data) {
  const hash = createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else {
    hash.update(canonicalizeJSON(data), 'utf8');
  }
  return hash.digest('hex');
}

/**
 * Compute Keccak-256 hash (used for Ethereum compatibility)
 * Falls back to SHA-256 in this prototype; use ethers.keccak256 for production
 */
export function keccak256(data) {
  // For prototype simplicity, we use SHA-256
  // In production, use ethers.keccak256 for EVM compatibility
  return sha256(data);
}

/**
 * Hash a document file (simulated with content string for prototype)
 */
export function hashDocument(content) {
  return sha256(content);
}

/**
 * Compute hash of an event payload for blockchain anchoring
 */
export function computeEventHash(event) {
  // Create a deterministic payload for hashing
  // Normalize Date objects to ISO strings for consistency
  const payload = {
    eventId: event.eventId,
    eventType: event.eventType,
    eventTimestamp: event.eventTimestamp instanceof Date 
      ? event.eventTimestamp.toISOString() 
      : event.eventTimestamp,
    batchId: event.batchId,
    fromPartyId: event.fromPartyId || null,
    toPartyId: event.toPartyId || null,
    fromFacilityId: event.fromFacilityId || null,
    toFacilityId: event.toFacilityId || null,
    quantity: event.quantity || null,
    references: event.references || []
  };
  
  return sha256(payload);
}

/**
 * Compute hash of a batch for blockchain anchoring
 */
export function computeBatchHash(batch) {
  // Normalize Date objects to ISO strings for consistency
  const payload = {
    batchId: batch.batchId,
    externalReferenceNumber: batch.externalReferenceNumber,
    commodityType: batch.commodityType,
    originFacilityId: batch.originFacilityId,
    ownerPartyId: batch.ownerPartyId,
    creationTimestamp: batch.creationTimestamp instanceof Date
      ? batch.creationTimestamp.toISOString()
      : batch.creationTimestamp,
    quantity: batch.quantity,
    declaredAssay: batch.declaredAssay || null
  };
  
  return sha256(payload);
}

/**
 * Verify a document hash matches the stored hash
 */
export function verifyDocumentHash(content, storedHash) {
  const computedHash = hashDocument(content);
  return {
    isValid: computedHash === storedHash,
    computedHash,
    storedHash
  };
}

/**
 * Create a hash anchor record for blockchain
 */
export function createAnchorRecord(id, hash, type = 'event') {
  return {
    id,
    hash,
    type,
    timestamp: new Date().toISOString()
  };
}
