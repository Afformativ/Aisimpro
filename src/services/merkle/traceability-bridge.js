/**
 * Gold & Silver Traceability ↔ Merkle Bridge
 *
 * Connects on-chain GoldSilverTraceability events to the existing
 * Merkle anchoring pipeline so that every supply-chain state change
 * (ore extraction, bar refining, product certification, custody transfer)
 * is hashed into a Merkle leaf, batched, tree-built, and root-anchored
 * for gas-efficient, verifiable audit trails.
 *
 * Integration points:
 *   - Listens to decoded contract events (push model) or accepts
 *     manual ingest calls (pull model).
 *   - Uses canonicalization.js for deterministic leaf hashing.
 *   - Feeds leaves into batching.js for tree construction + anchoring.
 *   - Produces inclusion proofs retrievable via the standard merkle API.
 *
 * Event-to-leaf mapping:
 *   OreExtracted       → { type, id, metal, mineId, country, … }
 *   BarRefined         → { type, barId, oreIds, metal, refinery, … }
 *   ProductCertified   → { type, productId, barId, metal, hallmark, … }
 *   CustodyTransferred → { type, recordType, id, from, to }
 */

import { sha256Hex } from './tree.js';
import { canonicalize } from './canonicalization.js';
import { ingestCertificate } from './batching.js';
import { v4 as uuidv4 } from 'uuid';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TRACEABILITY_SCHEMA_VERSION = 'goldsilver-trace-v1';

const METAL_NAMES = ['GOLD', 'SILVER'];
const RECORD_TYPE_NAMES = ['RAW_ORE', 'REFINED_BAR', 'CERTIFIED_PRODUCT'];

// ---------------------------------------------------------------------------
// Event → canonical leaf payload builders
// ---------------------------------------------------------------------------

/**
 * Build a canonical JSON string from an OreExtracted event.
 */
export function buildOreExtractedLeaf(event) {
  return canonicalize({
    _schemaVersion: TRACEABILITY_SCHEMA_VERSION,
    _type: 'OreExtracted',
    id: event.id,
    metal: METAL_NAMES[Number(event.metal)] ?? String(event.metal),
    mineId: event.mineId,
    originCountry: event.originCountry,
    mineralType: event.mineralType,
    extractedAt: Number(event.extractedAt),
    weightGrams: Number(event.weightGrams),
    estimatedGrade: event.estimatedGrade,
    custodian: event.custodian?.toLowerCase?.() ?? event.custodian,
  });
}

/**
 * Build a canonical JSON string from a BarRefined event.
 */
export function buildBarRefinedLeaf(event) {
  return canonicalize({
    _schemaVersion: TRACEABILITY_SCHEMA_VERSION,
    _type: 'BarRefined',
    barId: event.barId,
    oreIds: Array.isArray(event.oreIds)
      ? event.oreIds.map(String)
      : [String(event.oreIds)],
    metal: METAL_NAMES[Number(event.metal)] ?? String(event.metal),
    refineryId: event.refineryId,
    refinedAt: Number(event.refinedAt),
    outputWeightGrams: Number(event.outputWeightGrams),
    finenessPPT: Number(event.finenessPPT),
    barSerialNumber: event.barSerialNumber,
    custodian: event.custodian?.toLowerCase?.() ?? event.custodian,
  });
}

/**
 * Build a canonical JSON string from a ProductCertified event.
 */
export function buildProductCertifiedLeaf(event) {
  return canonicalize({
    _schemaVersion: TRACEABILITY_SCHEMA_VERSION,
    _type: 'ProductCertified',
    productId: event.productId,
    barId: event.barId,
    metal: METAL_NAMES[Number(event.metal)] ?? String(event.metal),
    assayerId: event.assayerId,
    certifiedAt: Number(event.certifiedAt),
    weightGrams: Number(event.weightGrams),
    finenessPPT: Number(event.finenessPPT),
    hallmark: event.hallmark,
    sku: event.sku,
    productType: event.productType,
    custodian: event.custodian?.toLowerCase?.() ?? event.custodian,
  });
}

/**
 * Build a canonical JSON string from a CustodyTransferred event.
 */
export function buildCustodyTransferredLeaf(event) {
  return canonicalize({
    _schemaVersion: TRACEABILITY_SCHEMA_VERSION,
    _type: 'CustodyTransferred',
    recordType: RECORD_TYPE_NAMES[Number(event.recordType)] ?? String(event.recordType),
    id: event.id,
    from: event.from?.toLowerCase?.() ?? event.from,
    to: event.to?.toLowerCase?.() ?? event.to,
  });
}

// ---------------------------------------------------------------------------
// Ingest wrappers – feed Merkle batching pipeline
// ---------------------------------------------------------------------------

const DEFAULT_SCOPE_TYPE = 'day';
const DEFAULT_ISSUER_KEY = 'goldsilver-traceability-bridge';

/**
 * Ingest a supply-chain event into the Merkle anchoring pipeline.
 *
 * @param {'OreExtracted'|'BarRefined'|'ProductCertified'|'CustodyTransferred'} eventType
 * @param {object}  eventData   – decoded event fields
 * @param {string}  [scopeId]   – optional scope override (default: today's date)
 * @returns {{ certificatePackage, anchorBatch }}
 */
export function ingestTraceabilityEvent(eventType, eventData, scopeId = null) {
  let canonical;
  switch (eventType) {
    case 'OreExtracted':
      canonical = buildOreExtractedLeaf(eventData);
      break;
    case 'BarRefined':
      canonical = buildBarRefinedLeaf(eventData);
      break;
    case 'ProductCertified':
      canonical = buildProductCertifiedLeaf(eventData);
      break;
    case 'CustodyTransferred':
      canonical = buildCustodyTransferredLeaf(eventData);
      break;
    default:
      throw new Error(`Unknown traceability event type: ${eventType}`);
  }

  const contentHash = sha256Hex(canonical);
  const entityId = eventData.id || eventData.barId || eventData.productId;
  const certificateId = `trace:${eventType}:${entityId}:${uuidv4().slice(0, 8)}`;

  return ingestCertificate({
    certificateId,
    certificateJson: JSON.parse(canonical),
    docHashList: [],
    shipmentId: scopeId || new Date().toISOString().slice(0, 10),
    issuerKeyId: DEFAULT_ISSUER_KEY,
    schemaVersion: TRACEABILITY_SCHEMA_VERSION,
    scopeType: DEFAULT_SCOPE_TYPE,
    userId: 'traceability-bridge',
  });
}

// ---------------------------------------------------------------------------
// Ethers.js contract listener (optional – call from app bootstrap)
// ---------------------------------------------------------------------------

/**
 * Attach event listeners to a GoldSilverTraceability ethers.Contract
 * instance and automatically feed events into the Merkle pipeline.
 *
 * @param {import('ethers').Contract} contract – connected GoldSilverTraceability
 */
export function attachContractListeners(contract) {
  contract.on('OreExtracted', (id, metal, custodian, mineId, originCountry, mineralType, extractedAt, weightGrams, estimatedGrade) => {
    ingestTraceabilityEvent('OreExtracted', {
      id, metal, custodian, mineId, originCountry, mineralType,
      extractedAt, weightGrams, estimatedGrade,
    });
  });

  contract.on('BarRefined', (barId, oreIds, metal, custodian, refineryId, refinedAt, outputWeightGrams, finenessPPT, barSerialNumber) => {
    ingestTraceabilityEvent('BarRefined', {
      barId, oreIds, metal, custodian, refineryId, refinedAt,
      outputWeightGrams, finenessPPT, barSerialNumber,
    });
  });

  contract.on('ProductCertified', (productId, barId, metal, custodian, assayerId, certifiedAt, weightGrams, finenessPPT, hallmark, sku, productType) => {
    ingestTraceabilityEvent('ProductCertified', {
      productId, barId, metal, custodian, assayerId, certifiedAt,
      weightGrams, finenessPPT, hallmark, sku, productType,
    });
  });

  contract.on('CustodyTransferred', (recordType, id, from, to) => {
    ingestTraceabilityEvent('CustodyTransferred', {
      recordType, id, from, to,
    });
  });

  console.log('[traceability-bridge] GoldSilverTraceability event listeners attached');
}
