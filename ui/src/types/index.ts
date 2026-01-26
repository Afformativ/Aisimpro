// Gold Provenance Type Definitions

export interface Party {
  partyId: string;
  legalName: string;
  partyType: PartyType;
  registrationId?: string | null;
  country: string;
  contact?: {
    name?: string | null;
    email?: string | null;
  };
  createdAt: string;
}

export interface Facility {
  facilityId: string;
  facilityName: string;
  facilityType: FacilityType;
  operatorPartyId?: string;
  location: {
    country: string;
    region?: string | null;
    gps?: {
      lat: number;
      lng: number;
    } | null;
  };
  identifiers?: {
    permitIds?: string[];
  };
  createdAt: string;
}

export interface Document {
  documentId: string;
  documentType: DocumentType;
  fileName: string;
  storageUri?: string;
  sha256Hash: string;
  issuerPartyId?: string | null;
  issuedDate?: string | null;
  relatedBatchId?: string | null;
  relatedEventId?: string | null;
  confidentialityLevel: ConfidentialityLevel;
  createdAt: string;
}

export interface Batch {
  batchId: string;
  externalReferenceNumber?: string;
  referenceNumber?: string;
  commodityType?: string;
  commodity?: string;
  status: BatchStatus;
  originFacilityId: string;
  ownerPartyId?: string;
  originPartyId?: string;
  currentCustodianId?: string;
  currentLocationId?: string;
  quantity?: {
    weight?: number;
    unit: string;
  };
  weightKg?: number;
  purityPercent?: number;
  declaredAssay?: { value: number; unit: string } | null;
  documentIds: string[];
  eventIds?: string[];
  parentBatchIds?: string[];
  notes?: string | null;
  createdAt?: string;
  creationTimestamp?: string;
  updatedAt?: string;
}

export interface TraceEvent {
  eventId: string;
  eventType: EventType;
  batchId: string;
  timestamp: string;
  actorPartyId: string;
  facilityId?: string;
  details: Record<string, unknown>;
  documentIds: string[];
  previousEventId?: string;
  dataHash: string;
  blockchainAnchor?: {
    transactionHash: string;
    blockNumber: number;
    network: string;
    timestamp: string;
  };
}

export interface TimelineEvent {
  eventId: string;
  eventType: EventType;
  timestamp: string;
  from: {
    party: { id: string; name: string } | null;
    facility: { id: string; name: string } | null;
  };
  to: {
    party: { id: string; name: string } | null;
    facility: { id: string; name: string } | null;
  };
  quantity?: number | null;
  notes?: string;
  documents: string[];
  payloadHash: string;
  txHash?: string;
  explorerUrl?: string;
}

export interface ChainOfCustody {
  batch: {
    batchId: string;
    quantity?: { weight?: number; unit: string };
    declaredAssay?: { value: number; unit: string } | null;
    status: BatchStatus;
    createdAt: string;
  };
  originFacility: {
    id: string;
    name: string;
    type: string;
    location: { country: string; region?: string | null; gps?: unknown };
  };
  currentCustodian: { id: string; name: string } | null;
  timeline: TimelineEvent[];
  documentCount: number;
  allDocuments: Document[];
  credentials: unknown[];
  verificationStatus: {
    status: string;
    message: string;
  };
}

export interface VerificationResult {
  batchId: string;
  overallValid: boolean;
  batchHashValid: boolean;
  events: {
    eventId: string;
    eventType: string;
    storedHash: string;
    computedHash: string;
    hashMatch: boolean;
    anchorValid: boolean;
  }[];
  anchorVerifications: {
    eventId: string;
    txHash: string;
    verified: boolean;
  }[];
}

export interface AuditLogEntry {
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
}

// Enums
export type PartyType = 'MineOperator' | 'Transporter' | 'Buyer' | 'Refinery' | 'Auditor' | 'Other';
export type FacilityType = 'Mine' | 'Warehouse' | 'Refinery' | 'Port' | 'Other';
export type BatchStatus = 'Created' | 'InTransit' | 'Received' | 'Closed' | 'Dispute';
export type EventType = 'Create' | 'Transfer' | 'Ship' | 'Receive' | 'InspectTest' | 'AssayFinalized' | 'Dispute' | 'Resolve';
export type DocumentType = 'Permit' | 'CertificateOfOrigin' | 'PackingList' | 'WaybillAirwayBill' | 'ProFormaInvoice' | 'AssayReport' | 'Other';
export type ConfidentialityLevel = 'Public' | 'Restricted' | 'Confidential';

export const PARTY_TYPES: PartyType[] = ['MineOperator', 'Transporter', 'Buyer', 'Refinery', 'Auditor', 'Other'];
export const FACILITY_TYPES: FacilityType[] = ['Mine', 'Warehouse', 'Refinery', 'Port', 'Other'];
export const DOCUMENT_TYPES: DocumentType[] = ['Permit', 'CertificateOfOrigin', 'PackingList', 'WaybillAirwayBill', 'ProFormaInvoice', 'AssayReport', 'Other'];
