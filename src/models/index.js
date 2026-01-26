/**
 * Gold Provenance Prototype - Data Models
 * Based on UNTP-aligned event/credential pattern
 */

import { v4 as uuidv4 } from 'uuid';

// ============ ENUMS ============

export const PartyType = {
  MINE_OPERATOR: 'MineOperator',
  TRANSPORTER: 'Transporter',
  BUYER: 'Buyer',
  REFINERY: 'Refinery',
  AUDITOR: 'Auditor',
  OTHER: 'Other'
};

export const FacilityType = {
  MINE: 'Mine',
  WAREHOUSE: 'Warehouse',
  REFINERY: 'Refinery',
  PORT: 'Port',
  OTHER: 'Other'
};

export const BatchStatus = {
  CREATED: 'Created',
  IN_TRANSIT: 'InTransit',
  RECEIVED: 'Received',
  CLOSED: 'Closed',
  DISPUTE: 'Dispute'
};

export const EventType = {
  CREATE: 'Create',
  TRANSFER: 'Transfer',
  SHIP: 'Ship',
  RECEIVE: 'Receive',
  INSPECT_TEST: 'InspectTest',
  ASSAY_FINALIZED: 'AssayFinalized',
  DISPUTE: 'Dispute',
  RESOLVE: 'Resolve'
};

export const DocumentType = {
  PERMIT: 'Permit',
  CERTIFICATE_OF_ORIGIN: 'CertificateOfOrigin',
  PACKING_LIST: 'PackingList',
  WAYBILL: 'WaybillAirwayBill',
  PRO_FORMA_INVOICE: 'ProFormaInvoice',
  ASSAY_REPORT: 'AssayReport',
  OTHER: 'Other'
};

export const ConfidentialityLevel = {
  PUBLIC: 'Public',
  RESTRICTED: 'Restricted',
  CONFIDENTIAL: 'Confidential'
};

export const CredentialType = {
  ORIGIN_PROOF: 'OriginProof',
  COMPLIANCE_ATTESTATION: 'ComplianceAttestation',
  ASSAY_ATTESTATION: 'AssayAttestation'
};

export const UserRole = {
  ADMIN: 'Admin',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
  AUDITOR: 'Auditor'
};

// ============ MODEL FACTORIES ============

/**
 * Create a new Party
 */
export function createParty({
  legalName,
  partyType,
  registrationId = null,
  country,
  contactName = null,
  contactEmail = null
}) {
  return {
    partyId: uuidv4(),
    legalName,
    partyType,
    registrationId,
    country,
    contact: { name: contactName, email: contactEmail },
    createdAt: new Date().toISOString()
  };
}

/**
 * Create a new Facility
 */
export function createFacility({
  facilityName,
  facilityType,
  ownerPartyId,
  country,
  region = null,
  gpsCoordinates = null,
  permitIds = []
}) {
  return {
    facilityId: uuidv4(),
    facilityName,
    facilityType,
    ownerPartyId,
    location: { country, region, gps: gpsCoordinates },
    identifiers: { permitIds },
    createdAt: new Date().toISOString()
  };
}

/**
 * Create a new Batch/Lot
 */
export function createBatch({
  externalReferenceNumber,
  commodityType,
  originFacilityId,
  ownerPartyId,
  weight,
  weightUnit = 'kg',
  declaredAssayValue = null,
  declaredAssayUnit = null,
  notes = null
}) {
  return {
    batchId: uuidv4(),
    externalReferenceNumber,
    commodityType,
    originFacilityId,
    ownerPartyId,
    creationTimestamp: new Date().toISOString(),
    quantity: { weight, unit: weightUnit },
    declaredAssay: declaredAssayValue ? { value: declaredAssayValue, unit: declaredAssayUnit } : null,
    status: BatchStatus.CREATED,
    parentBatchIds: [], // For future splitting/aggregation
    notes,
    documentIds: [],
    eventIds: []
  };
}

/**
 * Create a new Traceability Event
 */
export function createEvent({
  eventType,
  batchId,
  fromPartyId = null,
  toPartyId = null,
  fromFacilityId = null,
  toFacilityId = null,
  weight = null,
  weightUnit = 'kg',
  documentIds = [],
  notes = null
}) {
  return {
    eventId: uuidv4(),
    eventType,
    eventTimestamp: new Date().toISOString(),
    batchId,
    fromPartyId,
    toPartyId,
    fromFacilityId,
    toFacilityId,
    quantity: weight ? { weight, unit: weightUnit } : null,
    references: documentIds,
    notes,
    eventPayloadHash: null, // Computed after creation
    onChainTxHash: null     // Set after blockchain anchoring
  };
}

/**
 * Create a new Document reference
 */
export function createDocument({
  documentType,
  fileName,
  storageUri,
  sha256Hash,
  issuerPartyId,
  issuedDate = null,
  relatedBatchId = null,
  relatedEventId = null,
  confidentialityLevel = ConfidentialityLevel.RESTRICTED
}) {
  return {
    documentId: uuidv4(),
    documentType,
    fileName,
    storageUri,
    sha256Hash,
    issuerPartyId,
    issuedDate,
    relatedBatchId,
    relatedEventId,
    confidentialityLevel,
    createdAt: new Date().toISOString()
  };
}

/**
 * Create a lightweight Credential/Attestation
 */
export function createCredential({
  credentialType,
  issuerPartyId,
  subjectBatchId = null,
  subjectFacilityId = null,
  claimsSummary,
  supportingDocumentIds = []
}) {
  return {
    credentialId: uuidv4(),
    credentialType,
    issuerPartyId,
    subjectBatchId,
    subjectFacilityId,
    claimsSummary,
    supportingDocumentIds,
    signaturePlaceholder: `Asserted by ${issuerPartyId}`, // Later becomes VC signature
    issuedAt: new Date().toISOString()
  };
}

/**
 * Create a User/Access record
 */
export function createUser({
  partyId,
  username,
  role,
  allowedBatchIds = []
}) {
  return {
    userId: uuidv4(),
    partyId,
    username,
    role,
    allowedBatchIds,
    createdAt: new Date().toISOString()
  };
}
