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
    referenceNumber?: string;
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

// ── On-Chain Traceability Types (GoldSilverTraceability.sol) ──

export type MetalType = 'GOLD' | 'SILVER';
export type SupplyChainStage = 'RAW_ORE' | 'REFINED_BAR' | 'CERTIFIED_PRODUCT';

export interface GasInfo {
  gasUsed: number;
  gasPriceGwei: number;
  txCostPOL: number;
}

export interface GasStatus {
  baseFeeGwei: number;
  priorityFeeGwei: number;
  gasPriceGwei: number;       // baseFee + tip (real effective price)
  maxGasPriceGwei: number;
  maxTxCostPOL: number;
  walletBalancePOL: number;
  estimatedTxCostPOL: number;
  estimatedTxsRemaining: number;
  gasPriceStatus: 'normal' | 'elevated' | 'high';
  simulation?: boolean;
  error?: string;
}

export interface TraceabilityStatus {
  live: boolean;
  contractAddress: string | null;
  wallet: string | null;
  simulation: boolean;
  network: string | null;
  explorerUrl: string | null;
  oreCount: number;
  barCount: number;
  productCount: number;
  eventCount: number;
  gasConfig: {
    priorityFeeGwei: number;
    maxGasPriceGwei: number;
    maxTxCostPOL: number;
  } | null;
}

export interface OnChainOre {
  id: string;
  stage: 'RAW_ORE';
  metal: MetalType;
  mineId: string;
  originCountry: string;
  mineralType: string;
  extractedAt: number;
  weightGrams: number;
  estimatedGrade: string;
  currentCustodian: string;
  txHash: string | null;
  explorerUrl: string | null;
  gasInfo?: GasInfo;
  documentRoot?: string | null;
  evidenceManifestCID?: string | null;
}

export interface OnChainBar {
  id: string;
  stage: 'REFINED_BAR';
  inputOreIds: string[];
  metal: MetalType;
  refineryId: string;
  refinedAt: number;
  outputWeightGrams: number;
  finenessPPT: number;
  barSerialNumber: string;
  currentCustodian: string;
  txHash: string | null;
  explorerUrl: string | null;
  gasInfo?: GasInfo;
  documentRoot?: string | null;
  evidenceManifestCID?: string | null;
}

export interface OnChainProduct {
  id: string;
  stage: 'CERTIFIED_PRODUCT';
  inputBarId: string;
  metal: MetalType;
  assayerId: string;
  certifiedAt: number;
  weightGrams: number;
  finenessPPT: number;
  hallmark: string;
  sku: string;
  productType: string;
  currentCustodian: string;
  txHash: string | null;
  explorerUrl: string | null;
  gasInfo?: GasInfo;
  documentRoot?: string | null;
  evidenceManifestCID?: string | null;
}

export type OnChainEntity = OnChainOre | OnChainBar | OnChainProduct;

export interface OnChainEvent {
  type: string;
  id: string;
  timestamp: number;
  data: Record<string, unknown>;
  txHash?: string | null;
  explorerUrl?: string | null;
}
