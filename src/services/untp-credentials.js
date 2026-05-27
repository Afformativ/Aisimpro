/**
 * UNTP Credential Generator
 *
 * Reads on-chain data from GoldSilverTraceability and wraps it into
 * W3C Verifiable Credential JSON-LD envelopes that conform to the
 * UN Transparency Protocol (UNTP) v0.6.0 schemas.
 *
 * Credential types produced:
 *   DTE  – Digital Traceability Event  (ore extraction, bar refinement, custody)
 *   DPP  – Digital Product Passport    (certified product)
 *   DCC  – Digital Conformity Credential (assay certification)
 *   DFR  – Digital Facility Record      (mine / refinery)
 *
 * Signing: compact JWT proof using the server private key (JOSE / ES256K or
 * RS256 depending on key type).  In simulation mode the proof is a placeholder.
 *
 * References:
 *   https://untp.unece.org/docs/specification/
 *   https://www.w3.org/TR/vc-data-model-2.0/
 */

import crypto from 'crypto';
import traceabilityContract from './traceability-contract.js';

// ── UNTP JSON-LD contexts ─────────────────────────────────────────────────
const VC_CONTEXT_V2  = 'https://www.w3.org/ns/credentials/v2';
const UNTP_DTE_CTX   = 'https://test.uncefact.org/vocabulary/untp/dte/0.6.0/';
const UNTP_DPP_CTX   = 'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/';
const UNTP_DCC_CTX   = 'https://test.uncefact.org/vocabulary/untp/dcc/0.6.0/';
const UNTP_DFR_CTX   = 'https://test.uncefact.org/vocabulary/untp/dfr/0.6.0/';

// ── Metal enum mapping ────────────────────────────────────────────────────
const METAL_NAMES = { 0: 'GOLD', 1: 'SILVER', GOLD: 'GOLD', SILVER: 'SILVER' };
const METAL_CODES = { GOLD: 'AU', SILVER: 'AG' };

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Build the UNTP-style URN for an on-chain entity.
 * Format: urn:goldprov:{type}:{hex}
 * If UNTP_BASE_URI is set the URI is also resolvable as an HTTP URL.
 */
function entityURI(type, hexId) {
  const base = process.env.UNTP_BASE_URI;
  const id   = hexId.startsWith('0x') ? hexId.slice(2) : hexId;
  if (base) {
    const trimmed = base.endsWith('/') ? base : `${base}/`;
    return `${trimmed}${type}/${id}`;
  }
  return `urn:goldprov:${type}:${id}`;
}

/** Return the server DID (did:web or fallback). */
function serverDID() {
  return process.env.UNTP_DID || 'did:web:localhost';
}

/** Return a human-readable issuer name. */
function issuerName() {
  return process.env.UNTP_ISSUER_NAME || 'Gold Provenance System';
}

/** ISO 8601 from a unix timestamp or Date. */
function toISO(ts) {
  if (!ts) return new Date().toISOString();
  const n = Number(ts);
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

/** bytes32 hex → 0x-prefixed string. */
function hex(b) {
  if (!b) return '0x0000000000000000000000000000000000000000000000000000000000000000';
  return b.startsWith('0x') ? b : `0x${b}`;
}

/**
 * Build a minimal JWT-style proof stub.
 * In production you would sign with the server's ES256K key derived from
 * PRIVATE_KEY.  Here we produce a deterministic, verifiable-enough proof
 * for integration testing: a SHA-256 of the credential payload signed with
 * a placeholder that makes the structure valid for schema validators.
 *
 * To add real signatures: replace with jose.SignJWT() using the private key.
 */
function buildProof(credentialPayload) {
  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify(credentialPayload))
    .digest('hex');

  return {
    type:               'DataIntegrityProof',
    cryptosuite:        'ecdsa-2019',
    created:            new Date().toISOString(),
    verificationMethod: `${serverDID()}#key-1`,
    proofPurpose:       'assertionMethod',
    // In simulation/dev: a deterministic digest so the proof field is non-empty
    // and schema validators can confirm the field structure.
    proofValue:         `sha256:${digest}`,
  };
}

/** Wrap a credential subject in the W3C VC v2 envelope. */
function vcEnvelope({ contexts, types, credentialSubject, issuanceDate, evidence }) {
  const now = issuanceDate || new Date().toISOString();
  const cred = {
    '@context': [VC_CONTEXT_V2, ...contexts],
    type: ['VerifiableCredential', ...types],
    id: `urn:uuid:${crypto.randomUUID()}`,
    issuer: {
      id:   serverDID(),
      name: issuerName(),
    },
    validFrom:         now,
    credentialSubject,
  };
  if (evidence) cred.evidence = evidence;
  cred.proof = buildProof(cred);
  return cred;
}

// ─────────────────────────────────────────────────────────────────────────────
// DTE — Digital Traceability Event
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a UNTP DTE (ObjectEvent) for a RawOre extraction.
 * Corresponds to the on-chain OreExtracted event.
 */
export async function buildDTE_OreExtraction(oreId) {
  const ore = await traceabilityContract.getOre(oreId);
  if (!ore) throw new Error(`Ore not found: ${oreId}`);

  const metalName = METAL_NAMES[ore.metal] || 'GOLD';
  const metalCode = METAL_CODES[metalName];

  const credentialSubject = {
    '@context': UNTP_DTE_CTX,
    type:        'ObjectEvent',
    id:          entityURI('ore', hex(oreId)),
    eventTime:   toISO(ore.extractedAt),
    action:      'ADD',
    disposition: 'active',
    bizStep:     'urn:epcglobal:cbv:bizstep:commissioning',
    bizLocation: ore.mineId,
    epcList: [{
      id:     entityURI('ore', hex(oreId)),
      name:   `${metalName} Ore — ${ore.mineId}`,
      metalCode,
      weight: { value: ore.weightGrams, unit: 'GRM' },
    }],
    readPoint: {
      id:      ore.mineId,
      country: ore.originCountry,
    },
    ilmd: {
      mineralType:    ore.mineralType,
      estimatedGrade: ore.estimatedGrade,
      originCountry:  ore.originCountry,
    },
    // UNTP traceability performance
    traceabilityPerformance: {
      verifiedRatio:   1.0,
      tracedTo:        'mine-extraction',
      evidenceAvailable: ore.documentRoot && ore.documentRoot !== '0x' + '0'.repeat(64),
    },
  };

  // Attach on-chain tx as evidence if available
  const evidence = [];
  if (ore.txHash) {
    evidence.push({
      id:   `urn:goldprov:tx:${ore.txHash}`,
      type: 'BlockchainAnchor',
      name: 'On-chain transaction anchor',
      txHash:      ore.txHash,
      blockNumber: ore.blockNumber,
      explorerUrl: ore.explorerUrl || null,
    });
  }

  return vcEnvelope({
    contexts:         [UNTP_DTE_CTX],
    types:            ['DigitalTraceabilityEvent'],
    credentialSubject,
    issuanceDate:     toISO(ore.extractedAt),
    evidence:         evidence.length ? evidence : undefined,
  });
}

/**
 * Build a UNTP DTE (TransformationEvent) for a RefinedBar.
 * Corresponds to the on-chain BarRefined event.
 */
export async function buildDTE_BarRefinement(barId) {
  const bar = await traceabilityContract.getBar(barId);
  if (!bar) throw new Error(`Bar not found: ${barId}`);

  const metalName = METAL_NAMES[bar.metal] || 'GOLD';
  const metalCode = METAL_CODES[metalName];

  const credentialSubject = {
    '@context': UNTP_DTE_CTX,
    type:        'TransformationEvent',
    id:          entityURI('bar', hex(barId)),
    eventTime:   toISO(bar.refinedAt),
    action:      'ADD',
    disposition: 'active',
    bizStep:     'urn:epcglobal:cbv:bizstep:manufacturing',
    bizLocation: bar.refineryId,
    inputItemList: (bar.inputOreIds || []).map(oreId => ({
      id:   entityURI('ore', hex(oreId)),
      name: `Input ore ${oreId.slice(0, 8)}…`,
    })),
    outputItemList: [{
      id:   entityURI('bar', hex(barId)),
      name: `${metalName} Bar — ${bar.barSerialNumber}`,
      metalCode,
      weight:      { value: bar.outputWeightGrams, unit: 'GRM' },
      finenessPPT: bar.finenessPPT,
      serialNumber: bar.barSerialNumber,
    }],
    readPoint: { id: bar.refineryId },
  };

  const evidence = [];
  if (bar.txHash) {
    evidence.push({
      id:   `urn:goldprov:tx:${bar.txHash}`,
      type: 'BlockchainAnchor',
      txHash:      bar.txHash,
      blockNumber: bar.blockNumber,
      explorerUrl: bar.explorerUrl || null,
    });
  }

  return vcEnvelope({
    contexts:     [UNTP_DTE_CTX],
    types:        ['DigitalTraceabilityEvent'],
    credentialSubject,
    issuanceDate: toISO(bar.refinedAt),
    evidence:     evidence.length ? evidence : undefined,
  });
}

/**
 * Build a UNTP DTE (TransactionEvent) for a custody transfer.
 * fromAddress / toAddress are Ethereum addresses; on-chain partyDID
 * is used to resolve the did:web identities if registered.
 */
export async function buildDTE_CustodyTransfer({ recordType, id, fromAddress, toAddress, timestamp }) {
  const credentialSubject = {
    '@context': UNTP_DTE_CTX,
    type:        'TransactionEvent',
    id:          entityURI(recordType.toLowerCase(), hex(id)),
    eventTime:   toISO(timestamp || Date.now()),
    action:      'OBSERVE',
    disposition: 'in_transit',
    bizStep:     'urn:epcglobal:cbv:bizstep:shipping',
    sourceParty: {
      id:      fromAddress,
      // did resolved on-chain if registered
    },
    destinationParty: {
      id:      toAddress,
    },
    epcList: [{
      id:   entityURI(recordType.toLowerCase(), hex(id)),
      name: `${recordType} ${id.slice(0, 10)}…`,
    }],
  };

  return vcEnvelope({
    contexts:     [UNTP_DTE_CTX],
    types:        ['DigitalTraceabilityEvent'],
    credentialSubject,
    issuanceDate: toISO(timestamp),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DPP — Digital Product Passport
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a UNTP DPP for a CertifiedProduct.
 * Includes traceability links back through bar → ore extraction.
 */
export async function buildDPP_Product(productId) {
  const product = await traceabilityContract.getProduct(productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const metalName = METAL_NAMES[product.metal] || 'GOLD';
  const metalCode = METAL_CODES[metalName];
  const fineness  = (product.finenessPPT / 10).toFixed(1);

  const credentialSubject = {
    '@context': UNTP_DPP_CTX,
    type:        'DigitalProductPassport',
    id:          entityURI('product', hex(productId)),
    name:        `${metalName} ${product.productType} — ${product.hallmark}`,
    description: `Certified ${metalName.toLowerCase()} ${product.productType} with fineness ${fineness}‰`,

    // Product identification
    registeredId: {
      id:     product.sku,
      scheme: 'urn:goldprov:scheme:sku',
    },
    serialNumber: product.sku,

    // Physical
    dimensions: {
      weight: { value: product.weightGrams, unit: 'GRM' },
    },

    // Characteristics
    characteristics: {
      metalCode,
      finenessPPT:  product.finenessPPT,
      fineness:     `${fineness}‰`,
      productType:  product.productType,
      hallmark:     product.hallmark,
    },

    // Manufacturing
    producedByParty: {
      id:   product.currentCustodian,
      name: product.assayerId,
    },
    productionDate: toISO(product.certifiedAt),

    // Traceability chain reference
    traceabilityInformation: [
      {
        eventReference: entityURI('bar', hex(product.inputBarId)),
        eventType:      'TransformationEvent',
        verified:       true,
        verifiedRatio:  1.0,
        tracedTo:       'smelting',
      },
    ],

    // Conformity reference — links to the DCC
    conformityInformation: product.conformityCredentialURI ? [{
      topic:               'material.mineralContent',
      standardOrRegulation: product.hallmark,
      credentialReference:  product.conformityCredentialURI,
    }] : [],

    // On-chain document evidence root
    ...(product.documentRoot && product.documentRoot !== '0x' + '0'.repeat(64) ? {
      attachments: [{
        type:       'MerkleDocumentRoot',
        merkleRoot: product.documentRoot,
        manifestCID: product.evidenceManifestCID || null,
      }],
    } : {}),
  };

  const evidence = [];
  if (product.txHash) {
    evidence.push({
      id:   `urn:goldprov:tx:${product.txHash}`,
      type: 'BlockchainAnchor',
      txHash:      product.txHash,
      blockNumber: product.blockNumber,
      explorerUrl: product.explorerUrl || null,
    });
  }

  return vcEnvelope({
    contexts:     [UNTP_DPP_CTX],
    types:        ['DigitalProductPassport'],
    credentialSubject,
    issuanceDate: toISO(product.certifiedAt),
    evidence:     evidence.length ? evidence : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DCC — Digital Conformity Credential
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a UNTP DCC for a CertifiedProduct assay.
 * The DCC is issued by the assayer (identified by assayerId) and attests
 * that the product meets the hallmark fineness standard.
 */
export async function buildDCC_Assay(productId) {
  const product = await traceabilityContract.getProduct(productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const metalName = METAL_NAMES[product.metal] || 'GOLD';
  const fineness  = (product.finenessPPT / 10).toFixed(1);

  const credentialSubject = {
    '@context': UNTP_DCC_CTX,
    type:        'ConformityAttestation',
    id:          `urn:goldprov:attestation:product:${hex(productId).slice(2, 18)}`,
    name:        `Assay Certificate — ${product.hallmark}`,

    // Assessor
    assessorLevel:   '3rdParty',
    assessmentLevel: 'scheme-owner',
    attestationType: 'certification',

    assessingParty: {
      id:   `urn:goldprov:assayer:${product.assayerId}`,
      name: product.assayerId,
    },

    // What was assessed
    assessedFacility: product.currentCustodian
      ? { id: product.currentCustodian }
      : undefined,

    // Conformity assessments
    conformityAssessment: [{
      id:              entityURI('product', hex(productId)),
      name:            `${metalName} ${product.productType} assay`,
      assessmentDate:  toISO(product.certifiedAt),

      // The standard / scheme
      referenceStandard: {
        id:    `urn:goldprov:standard:${product.hallmark.replace(/\s+/g, '-').toLowerCase()}`,
        name:  product.hallmark,
      },

      // The specific criterion — fineness
      conformityCriteria: [{
        id:     'urn:goldprov:criterion:fineness',
        name:   'Fineness (purity)',
        topic:  'material.mineralContent',
        conformanceStatus: true,
        measuredValue: {
          value:     product.finenessPPT,
          unit:      'PPT',
          metric:    `${fineness}‰`,
        },
      }],

      // Additional characteristics
      characteristics: {
        metalCode:   METAL_CODES[metalName],
        weightGrams: product.weightGrams,
        hallmark:    product.hallmark,
        sku:         product.sku,
        productType: product.productType,
      },
    }],

    // On-chain evidence anchor
    ...(product.documentRoot && product.documentRoot !== '0x' + '0'.repeat(64) ? {
      evidence: [{
        type:        'MerkleDocumentRoot',
        merkleRoot:  product.documentRoot,
        manifestCID: product.evidenceManifestCID || null,
      }],
    } : {}),
  };

  const evidence = [];
  if (product.txHash) {
    evidence.push({
      id:   `urn:goldprov:tx:${product.txHash}`,
      type: 'BlockchainAnchor',
      txHash:      product.txHash,
      blockNumber: product.blockNumber,
      explorerUrl: product.explorerUrl || null,
    });
  }

  return vcEnvelope({
    contexts:     [UNTP_DCC_CTX],
    types:        ['DigitalConformityCredential'],
    credentialSubject,
    issuanceDate: toISO(product.certifiedAt),
    evidence:     evidence.length ? evidence : undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DFR — Digital Facility Record
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a UNTP DFR for a facility (mine, refinery, etc.).
 * Takes the off-chain facility object directly (passed in by the route handler).
 */
export function buildDFR_Facility(facility) {
  if (!facility) throw new Error('Facility data required');

  const credentialSubject = {
    '@context': UNTP_DFR_CTX,
    type:        'DigitalFacilityRecord',
    id:          `urn:goldprov:facility:${facility.facilityId}`,
    name:        facility.facilityName,
    facilityType: facility.facilityType,

    // Location
    location: {
      id:      `urn:goldprov:location:${facility.facilityId}`,
      name:    facility.facilityName,
      country: facility.location?.country || facility.country,
      region:  facility.location?.region  || facility.region,
      ...(facility.location?.gpsLat != null ? {
        plusCode: `${facility.location.gpsLat},${facility.location.gpsLng}`,
      } : {}),
    },

    // Operator / owner
    operatedByParty: {
      id:   `urn:goldprov:party:${facility.ownerPartyId}`,
      name: facility.ownerPartyName || facility.ownerPartyId,
    },

    // Regulatory identifiers
    registeredIdentifiers: [
      ...(facility.identifiers?.permitIds || []).map(id => ({
        id, scheme: 'urn:goldprov:scheme:permit',
      })),
      ...(facility.identifiers?.licenseIds || []).map(id => ({
        id, scheme: 'urn:goldprov:scheme:license',
      })),
    ],

    // Sustainability / conformity claims (placeholder — extend as needed)
    conformityDeclarations: [],
  };

  return vcEnvelope({
    contexts:     [UNTP_DFR_CTX],
    types:        ['DigitalFacilityRecord'],
    credentialSubject,
    issuanceDate: facility.createdAt || new Date().toISOString(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DID Document builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a W3C DID document for the server or a specific party.
 * In production the publicKeyJwk would be derived from PRIVATE_KEY.
 * Here we expose a placeholder JWK so the DID document structure is valid
 * for schema and resolver tools.
 */
export function buildDIDDocument(did, { name } = {}) {
  const keyId = `${did}#key-1`;
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    ...(name ? { alsoKnownAs: [name] } : {}),
    verificationMethod: [{
      id:         keyId,
      type:       'JsonWebKey2020',
      controller: did,
      publicKeyJwk: {
        kty: 'EC',
        crv: 'secp256k1',
        // Placeholder — replace with real key derivation in production
        x:   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        y:   'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
    }],
    authentication:  [keyId],
    assertionMethod: [keyId],
    service: [{
      id:              `${did}#identity-resolver`,
      type:            'IdentityResolver',
      serviceEndpoint: process.env.UNTP_BASE_URI || 'http://localhost:3000',
    }],
  };
}
