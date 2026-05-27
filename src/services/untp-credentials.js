/**
 * UNTP Credential Generator
 *
 * Produces UNTP-aligned Verifiable Credentials as JOSE-enveloped VC-JWTs.
 * The returned document is an EnvelopedVerifiableCredential whose `id` is
 * a `data:application/vc+jwt,...` URL. The JWT payload carries the decoded
 * VC claims, including `credentialStatus` for W3C Bitstring Status Lists.
 */

import crypto from 'crypto';
import traceabilityContract from './traceability-contract.js';
import {
  getUntpPrivateKey,
  getUntpPublicJwk,
  getUntpKeyId,
} from './untp-keys.js';
import {
  ensureCredentialStatus,
  getStatusListCredentialMetadata,
} from './untp-status-list.js';
import { didFromBase, getConfiguredUntpBaseUri } from './untp-public-url.js';

const VC_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2';
const STATUS_CONTEXT_V1 = 'https://www.w3.org/ns/credentials/status/v1';
const UNTP_DTE_CTX = 'https://test.uncefact.org/vocabulary/untp/dte/0.6.0/';
const UNTP_DPP_CTX = 'https://test.uncefact.org/vocabulary/untp/dpp/0.6.0/';
const UNTP_DCC_CTX = 'https://test.uncefact.org/vocabulary/untp/dcc/0.6.0/';
const UNTP_DFR_CTX = 'https://test.uncefact.org/vocabulary/untp/dfr/0.6.0/';

const METAL_NAMES = { 0: 'GOLD', 1: 'SILVER', GOLD: 'GOLD', SILVER: 'SILVER' };
const METAL_CODES = { GOLD: 'AU', SILVER: 'AG' };

function baseUri(options = {}) {
  return (options.baseUri || getConfiguredUntpBaseUri()).replace(/\/$/, '');
}

function deriveDidFromBaseUri(baseUriValue) {
  return didFromBase(baseUriValue);
}

function serverDID(options = {}) {
  return options.did || process.env.UNTP_DID || deriveDidFromBaseUri(baseUri(options));
}

function issuerName() {
  return process.env.UNTP_ISSUER_NAME || 'Gold Provenance System';
}

function credentialIssuer(options = {}) {
  return {
    type: ['CredentialIssuer'],
    id: serverDID(options),
    name: issuerName(),
  };
}

function toISO(ts) {
  if (!ts) return new Date().toISOString();
  const n = Number(ts);
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
}

function hex(b) {
  if (!b) return '0x0000000000000000000000000000000000000000000000000000000000000000';
  return b.startsWith('0x') ? b : `0x${b}`;
}

function entityURI(type, hexId, options = {}) {
  const trimmedId = (hexId.startsWith('0x') ? hexId.slice(2) : hexId);
  return `${baseUri(options)}/${type}/${trimmedId}`;
}

function credentialURL(pathname, options = {}) {
  return `${baseUri(options)}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

function maybeValidUntil(validFrom) {
  const days = parseInt(process.env.UNTP_CREDENTIAL_VALID_DAYS || '', 10);
  if (!Number.isFinite(days) || days <= 0) return undefined;
  const until = new Date(validFrom);
  until.setUTCDate(until.getUTCDate() + days);
  return until.toISOString();
}

function maybeRenderMethod(renderPath, options = {}) {
  const renderBase = options.renderBaseUri || process.env.UNTP_RENDER_BASE_URI;
  if (!renderBase || !renderPath) return undefined;

  const trimmed = renderBase.replace(/\/$/, '');
  return [{
    type: 'WebRenderingTemplate2022',
    name: 'Human-readable credential view',
    url: `${trimmed}${renderPath}`,
    mediaType: 'text/html',
  }];
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signVcJwt(payload, options = {}) {
  const protectedHeader = {
    alg: 'EdDSA',
    kid: getUntpKeyId(serverDID(options)),
    cty: 'vc',
    typ: 'vc+jwt',
  };

  const signingInput = `${base64urlJson(protectedHeader)}.${base64urlJson(payload)}`;
  const signature = crypto.sign(null, Buffer.from(signingInput), getUntpPrivateKey());
  return `${signingInput}.${signature.toString('base64url')}`;
}

function envelopJwt(jwt, contexts) {
  return {
    '@context': [VC_CONTEXT_V2, ...contexts],
    type: 'EnvelopedVerifiableCredential',
    id: `data:application/vc+jwt,${jwt}`,
  };
}

function buildEvidence(record) {
  if (!record?.txHash) return undefined;
  return [{
    id: `urn:goldprov:tx:${record.txHash}`,
    type: 'BlockchainAnchor',
    name: 'On-chain transaction anchor',
    txHash: record.txHash,
    blockNumber: record.blockNumber,
    explorerUrl: record.explorerUrl || null,
  }];
}

function buildCredential({
  contexts,
  types,
  id,
  credentialSubject,
  issuanceDate,
  evidence,
  renderPath,
  publicConfig = {},
}) {
  const validFrom = issuanceDate || new Date().toISOString();
  const credentialStatus = ensureCredentialStatus(id, 'revocation', { baseUri: publicConfig.baseUri });
  const claims = {
    '@context': [VC_CONTEXT_V2, ...contexts],
    type: [...types, 'VerifiableCredential'],
    id,
    issuer: credentialIssuer(publicConfig),
    validFrom,
    credentialSubject,
    credentialStatus,
    ...(evidence ? { evidence } : {}),
    ...(maybeValidUntil(validFrom) ? { validUntil: maybeValidUntil(validFrom) } : {}),
    ...(maybeRenderMethod(renderPath, publicConfig) ? { renderMethod: maybeRenderMethod(renderPath, publicConfig) } : {}),
  };

  return envelopJwt(signVcJwt(claims, publicConfig), contexts);
}

export function decodeEnvelopedCredential(envelopedCredential) {
  if (!envelopedCredential?.id?.startsWith('data:application/vc+jwt,')) {
    return envelopedCredential;
  }

  const jwt = envelopedCredential.id.slice('data:application/vc+jwt,'.length);
  const [, payload] = jwt.split('.');
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

export function buildStatusListCredential(statusPurpose = 'revocation', publicConfig = {}) {
  const metadata = getStatusListCredentialMetadata(statusPurpose, { baseUri: publicConfig.baseUri });
  const validFrom = new Date().toISOString();
  const claims = {
    '@context': [VC_CONTEXT_V2, STATUS_CONTEXT_V1],
    id: metadata.id,
    type: metadata.type,
    issuer: credentialIssuer(publicConfig),
    validFrom,
    credentialSubject: metadata.credentialSubject,
    ...(maybeValidUntil(validFrom) ? { validUntil: maybeValidUntil(validFrom) } : {}),
  };
  return envelopJwt(signVcJwt(claims, publicConfig), [STATUS_CONTEXT_V1]);
}

export async function buildDTE_OreExtraction(oreId, publicConfig = {}) {
  const ore = await traceabilityContract.getOre(oreId);
  if (!ore) throw new Error(`Ore not found: ${oreId}`);

  const metalName = METAL_NAMES[ore.metal] || 'GOLD';
  const metalCode = METAL_CODES[metalName];

  const credentialSubject = {
    '@context': UNTP_DTE_CTX,
    type: 'ObjectEvent',
    id: entityURI('ore', hex(oreId), publicConfig),
    eventTime: toISO(ore.extractedAt),
    action: 'ADD',
    disposition: 'active',
    bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
    bizLocation: ore.mineId,
    epcList: [{
      id: entityURI('ore', hex(oreId), publicConfig),
      name: `${metalName} Ore — ${ore.mineId}`,
      metalCode,
      weight: { value: ore.weightGrams, unit: 'GRM' },
    }],
    readPoint: {
      id: ore.mineId,
      country: ore.originCountry,
    },
    ilmd: {
      mineralType: ore.mineralType,
      estimatedGrade: ore.estimatedGrade,
      originCountry: ore.originCountry,
    },
    traceabilityPerformance: {
      verifiedRatio: 1.0,
      tracedTo: 'mine-extraction',
      evidenceAvailable: ore.documentRoot && ore.documentRoot !== `0x${'0'.repeat(64)}`,
    },
  };

  return buildCredential({
    contexts: [UNTP_DTE_CTX],
    types: ['DigitalTraceabilityEvent'],
    id: credentialURL(`/api/credentials/dte/ore/${oreId}`, publicConfig),
    credentialSubject,
    issuanceDate: toISO(ore.extractedAt),
    evidence: buildEvidence(ore),
    renderPath: `/#/vc/ore/${oreId}`,
    publicConfig,
  });
}

export async function buildDTE_BarRefinement(barId, publicConfig = {}) {
  const bar = await traceabilityContract.getBar(barId);
  if (!bar) throw new Error(`Bar not found: ${barId}`);

  const metalName = METAL_NAMES[bar.metal] || 'GOLD';
  const metalCode = METAL_CODES[metalName];

  const credentialSubject = {
    '@context': UNTP_DTE_CTX,
    type: 'TransformationEvent',
    id: entityURI('bar', hex(barId), publicConfig),
    eventTime: toISO(bar.refinedAt),
    action: 'ADD',
    disposition: 'active',
    bizStep: 'urn:epcglobal:cbv:bizstep:manufacturing',
    bizLocation: bar.refineryId,
    inputItemList: (bar.inputOreIds || []).map(oreId => ({
      id: entityURI('ore', hex(oreId), publicConfig),
      name: `Input ore ${oreId.slice(0, 8)}…`,
    })),
    outputItemList: [{
      id: entityURI('bar', hex(barId), publicConfig),
      name: `${metalName} Bar — ${bar.barSerialNumber}`,
      metalCode,
      weight: { value: bar.outputWeightGrams, unit: 'GRM' },
      finenessPPT: bar.finenessPPT,
      serialNumber: bar.barSerialNumber,
    }],
    readPoint: { id: bar.refineryId },
  };

  return buildCredential({
    contexts: [UNTP_DTE_CTX],
    types: ['DigitalTraceabilityEvent'],
    id: credentialURL(`/api/credentials/dte/bar/${barId}`, publicConfig),
    credentialSubject,
    issuanceDate: toISO(bar.refinedAt),
    evidence: buildEvidence(bar),
    publicConfig,
  });
}

export async function buildDTE_CustodyTransfer({ recordType, id, fromAddress, toAddress, timestamp }, publicConfig = {}) {
  const credentialSubject = {
    '@context': UNTP_DTE_CTX,
    type: 'TransactionEvent',
    id: entityURI(recordType.toLowerCase(), hex(id), publicConfig),
    eventTime: toISO(timestamp || Date.now()),
    action: 'OBSERVE',
    disposition: 'in_transit',
    bizStep: 'urn:epcglobal:cbv:bizstep:shipping',
    sourceParty: { id: fromAddress },
    destinationParty: { id: toAddress },
    epcList: [{
      id: entityURI(recordType.toLowerCase(), hex(id), publicConfig),
      name: `${recordType} ${id.slice(0, 10)}…`,
    }],
  };

  return buildCredential({
    contexts: [UNTP_DTE_CTX],
    types: ['DigitalTraceabilityEvent'],
    id: credentialURL(`/api/credentials/dte/${recordType.toLowerCase()}/${id}`, publicConfig),
    credentialSubject,
    issuanceDate: toISO(timestamp),
    publicConfig,
  });
}

export async function buildDPP_Product(productId, publicConfig = {}) {
  const product = await traceabilityContract.getProduct(productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const metalName = METAL_NAMES[product.metal] || 'GOLD';
  const metalCode = METAL_CODES[metalName];
  const fineness = (product.finenessPPT / 10).toFixed(1);

  const credentialSubject = {
    '@context': UNTP_DPP_CTX,
    type: 'DigitalProductPassport',
    id: entityURI('product', hex(productId), publicConfig),
    name: `${metalName} ${product.productType} — ${product.hallmark}`,
    description: `Certified ${metalName.toLowerCase()} ${product.productType} with fineness ${fineness}‰`,
    registeredId: {
      id: product.sku,
      scheme: 'urn:goldprov:scheme:sku',
    },
    serialNumber: product.sku,
    dimensions: {
      weight: { value: product.weightGrams, unit: 'GRM' },
    },
    characteristics: {
      metalCode,
      finenessPPT: product.finenessPPT,
      fineness: `${fineness}‰`,
      productType: product.productType,
      hallmark: product.hallmark,
    },
    producedByParty: {
      id: product.currentCustodian,
      name: product.assayerId,
    },
    productionDate: toISO(product.certifiedAt),
    traceabilityInformation: [{
      eventReference: entityURI('bar', hex(product.inputBarId), publicConfig),
      eventType: 'TransformationEvent',
      verified: true,
      verifiedRatio: 1.0,
      tracedTo: 'smelting',
    }],
    conformityInformation: product.conformityCredentialURI ? [{
      topic: 'material.mineralContent',
      standardOrRegulation: product.hallmark,
      credentialReference: product.conformityCredentialURI,
    }] : [],
    ...(product.documentRoot && product.documentRoot !== `0x${'0'.repeat(64)}` ? {
      attachments: [{
        type: 'MerkleDocumentRoot',
        merkleRoot: product.documentRoot,
        manifestCID: product.evidenceManifestCID || null,
      }],
    } : {}),
  };

  return buildCredential({
    contexts: [UNTP_DPP_CTX],
    types: ['DigitalProductPassport'],
    id: credentialURL(`/api/credentials/dpp/product/${productId}`, publicConfig),
    credentialSubject,
    issuanceDate: toISO(product.certifiedAt),
    evidence: buildEvidence(product),
    publicConfig,
  });
}

export async function buildDCC_Assay(productId, publicConfig = {}) {
  const product = await traceabilityContract.getProduct(productId);
  if (!product) throw new Error(`Product not found: ${productId}`);

  const metalName = METAL_NAMES[product.metal] || 'GOLD';
  const fineness = (product.finenessPPT / 10).toFixed(1);

  const credentialSubject = {
    '@context': UNTP_DCC_CTX,
    type: 'ConformityAttestation',
    id: `urn:goldprov:attestation:product:${hex(productId).slice(2, 18)}`,
    name: `Assay Certificate — ${product.hallmark}`,
    assessorLevel: '3rdParty',
    assessmentLevel: 'scheme-owner',
    attestationType: 'certification',
    assessingParty: {
      id: `urn:goldprov:assayer:${product.assayerId}`,
      name: product.assayerId,
    },
    assessedFacility: product.currentCustodian ? { id: product.currentCustodian } : undefined,
    conformityAssessment: [{
      id: entityURI('product', hex(productId), publicConfig),
      name: `${metalName} ${product.productType} assay`,
      assessmentDate: toISO(product.certifiedAt),
      referenceStandard: {
        id: `urn:goldprov:standard:${product.hallmark.replace(/\s+/g, '-').toLowerCase()}`,
        name: product.hallmark,
      },
      conformityCriteria: [{
        id: 'urn:goldprov:criterion:fineness',
        name: 'Fineness (purity)',
        topic: 'material.mineralContent',
        conformanceStatus: true,
        measuredValue: {
          value: product.finenessPPT,
          unit: 'PPT',
          metric: `${fineness}‰`,
        },
      }],
      characteristics: {
        metalCode: METAL_CODES[metalName],
        weightGrams: product.weightGrams,
        hallmark: product.hallmark,
        sku: product.sku,
        productType: product.productType,
      },
    }],
    ...(product.documentRoot && product.documentRoot !== `0x${'0'.repeat(64)}` ? {
      evidence: [{
        type: 'MerkleDocumentRoot',
        merkleRoot: product.documentRoot,
        manifestCID: product.evidenceManifestCID || null,
      }],
    } : {}),
  };

  return buildCredential({
    contexts: [UNTP_DCC_CTX],
    types: ['DigitalConformityCredential'],
    id: credentialURL(`/api/credentials/dcc/product/${productId}`, publicConfig),
    credentialSubject,
    issuanceDate: toISO(product.certifiedAt),
    evidence: buildEvidence(product),
    publicConfig,
  });
}

export function buildDFR_Facility(facility, publicConfig = {}) {
  if (!facility) throw new Error('Facility data required');

  const credentialSubject = {
    '@context': UNTP_DFR_CTX,
    type: 'DigitalFacilityRecord',
    id: `urn:goldprov:facility:${facility.facilityId}`,
    name: facility.facilityName,
    facilityType: facility.facilityType,
    location: {
      id: `urn:goldprov:location:${facility.facilityId}`,
      name: facility.facilityName,
      country: facility.location?.country || facility.country,
      region: facility.location?.region || facility.region,
      ...(facility.location?.gpsLat != null ? {
        plusCode: `${facility.location.gpsLat},${facility.location.gpsLng}`,
      } : {}),
    },
    operatedByParty: {
      id: `urn:goldprov:party:${facility.ownerPartyId}`,
      name: facility.ownerPartyName || facility.ownerPartyId,
    },
    registeredIdentifiers: [
      ...(facility.identifiers?.permitIds || []).map(id => ({
        id,
        scheme: 'urn:goldprov:scheme:permit',
      })),
      ...(facility.identifiers?.licenseIds || []).map(id => ({
        id,
        scheme: 'urn:goldprov:scheme:license',
      })),
    ],
    conformityDeclarations: [],
  };

  return buildCredential({
    contexts: [UNTP_DFR_CTX],
    types: ['DigitalFacilityRecord'],
    id: credentialURL(`/api/credentials/dfr/facility/${facility.facilityId}`, publicConfig),
    credentialSubject,
    issuanceDate: facility.createdAt || new Date().toISOString(),
    publicConfig,
  });
}

export function buildDIDDocument(did, { name, baseUri: baseUriOverride } = {}) {
  const keyId = getUntpKeyId(did);
  const serviceBase = baseUri({ baseUri: baseUriOverride });
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: did,
    ...(name ? { alsoKnownAs: [name] } : {}),
    verificationMethod: [{
      id: keyId,
      type: 'JsonWebKey2020',
      controller: did,
      publicKeyJwk: getUntpPublicJwk(),
    }],
    authentication: [keyId],
    assertionMethod: [keyId],
    service: [
      {
        id: `${did}#identity-resolver`,
        type: 'IdentityResolver',
        serviceEndpoint: `${serviceBase}/api/resolve`,
      },
      {
        id: `${did}#credential-service`,
        type: 'VerifiableCredentialService',
        serviceEndpoint: `${serviceBase}/api/credentials`,
      },
      {
        id: `${did}#credential-status-service`,
        type: 'CredentialStatusService',
        serviceEndpoint: `${serviceBase}/api/credentials/status/bitstring-status-list/revocation`,
      },
    ],
  };
}
