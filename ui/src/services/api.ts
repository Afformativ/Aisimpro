// Gold Provenance API Client

import type {
  Party,
  Facility,
  Document,
  Batch,
  ChainOfCustody,
  VerificationResult,
  AuditLogEntry,
  TraceabilityStatus,
  GasInfo,
  GasStatus,
  OnChainOre,
  OnChainBar,
  OnChainProduct,
  OnChainEvent,
} from '../types';

// API URL: use environment variable or default to localhost for development
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('gp_access_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    ...options,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

// Health
export const getHealth = () => fetchAPI<{ status: string; timestamp: string; simulationMode: boolean }>('/health');

// Parties
export const getParties = () => fetchAPI<Party[]>('/parties');
export const getParty = (id: string) => fetchAPI<Party>(`/parties/${id}`);
export const createParty = (data: {
  legalName: string;
  partyType: string;
  country: string;
  registrationId?: string;
  contactName?: string;
  contactEmail?: string;
}) => fetchAPI<Party>('/parties', {
  method: 'POST',
  body: JSON.stringify(data),
});

// Facilities
export const getFacilities = () => fetchAPI<Facility[]>('/facilities');
export const getFacility = (id: string) => fetchAPI<Facility>(`/facilities/${id}`);
export const createFacility = (data: {
  facilityName: string;
  facilityType: string;
  operatorPartyId: string;
  country: string;
  address?: string;
  gpsLat?: number;
  gpsLng?: number;
}) => fetchAPI<Facility>('/facilities', {
  method: 'POST',
  body: JSON.stringify(data),
});

// Documents
export const getDocuments = () => fetchAPI<Document[]>('/documents');
export const getDocument = (id: string) => fetchAPI<Document>(`/documents/${id}`);
export const createDocument = (data: {
  documentType: string;
  description: string;
  content: string;
  issuedBy?: string;
  issuedAt?: string;
  confidentiality?: string;
}) => fetchAPI<Document>('/documents', {
  method: 'POST',
  body: JSON.stringify({
    documentType: data.documentType,
    fileName: data.description,
    content: data.content,
    issuerPartyId: data.issuedBy || null,
    issuedDate: data.issuedAt || null,
    confidentialityLevel: data.confidentiality || 'Restricted',
  }),
});

// Batches
export const getBatches = () => fetchAPI<Batch[]>('/batches');
export const getBatch = (id: string) => fetchAPI<Batch>(`/batches/${id}`);
export const createBatch = (data: {
  referenceNumber: string;
  commodity: string;
  originFacilityId: string;
  originPartyId: string;
  weightKg: number;
  purityPercent?: number;
  documentIds?: string[];
}) => fetchAPI<{ batch: Batch; event: unknown }>('/batches', {
  method: 'POST',
  body: JSON.stringify({
    externalReferenceNumber: data.referenceNumber,
    commodityType: data.commodity,
    originFacilityId: data.originFacilityId,
    ownerPartyId: data.originPartyId,
    weight: data.weightKg,
    weightUnit: 'kg',
    declaredAssayValue: data.purityPercent || null,
    documentIds: data.documentIds || [],
  }),
});

// Events
export const shipBatch = (batchId: string, data: {
  toPartyId: string;
  toFacilityId: string;
  transporterId?: string;
  documentIds?: string[];
  notes?: string;
}) => fetchAPI<{ batch: Batch; event: unknown }>(`/batches/${batchId}/ship`, {
  method: 'POST',
  body: JSON.stringify(data),
});

export const transferBatch = (batchId: string, data: {
  toPartyId: string;
  toFacilityId: string;
  documentIds?: string[];
  notes?: string;
}) => fetchAPI<{ batch: Batch; event: unknown }>(`/batches/${batchId}/transfer`, {
  method: 'POST',
  body: JSON.stringify(data),
});

export const receiveBatch = (batchId: string, data: {
  receiverPartyId: string;
  facilityId: string;
  documentIds?: string[];
  notes?: string;
}) => fetchAPI<{ batch: Batch; event: unknown }>(`/batches/${batchId}/receive`, {
  method: 'POST',
  body: JSON.stringify(data),
});

export const disputeBatch = (batchId: string, data: {
  raisedByPartyId: string;
  reason: string;
  documentIds?: string[];
}) => fetchAPI<{ batch: Batch; event: unknown }>(`/batches/${batchId}/dispute`, {
  method: 'POST',
  body: JSON.stringify(data),
});

// Verification
export const getChainOfCustody = (batchId: string) => 
  fetchAPI<ChainOfCustody>(`/batches/${batchId}/chain-of-custody`);

export const verifyBatch = (batchId: string) => 
  fetchAPI<VerificationResult>(`/batches/${batchId}/verify`);

export const exportBatch = (batchId: string) => 
  fetchAPI<unknown>(`/batches/${batchId}/export`);

// Audit
export const getAuditLog = (entityId?: string) => 
  fetchAPI<AuditLogEntry[]>(`/audit${entityId ? `?entityId=${entityId}` : ''}`);

// Enums
export const getEnums = () => fetchAPI<{
  partyTypes: string[];
  facilityTypes: string[];
  documentTypes: string[];
}>('/enums');

// ── On-Chain Traceability (GoldSilverTraceability contract) ──

export const getTraceabilityStatus = () =>
  fetchAPI<TraceabilityStatus>('/traceability/status');

export const getGasInfo = () =>
  fetchAPI<GasStatus>('/traceability/gas');

export const getOres = () => fetchAPI<OnChainOre[]>('/traceability/ores');
export const getBars = () => fetchAPI<OnChainBar[]>('/traceability/bars');
export const getProducts = () => fetchAPI<OnChainProduct[]>('/traceability/products');
export const getTraceabilityEvents = () => fetchAPI<OnChainEvent[]>('/traceability/events');

export const getOre = (id: string) => fetchAPI<OnChainOre>(`/traceability/ore/${id}`);
export const getBar = (id: string) => fetchAPI<OnChainBar>(`/traceability/bar/${id}`);
export const getProduct = (id: string) => fetchAPI<OnChainProduct>(`/traceability/product/${id}`);

export const registerOre = (data: {
  metal: string;
  mineId: string;
  originCountry: string;
  mineralType: string;
  weightGrams: number;
  estimatedGrade: string;
}) => fetchAPI<OnChainOre>('/traceability/ore', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const refineOre = (data: {
  oreIds: string[];
  metal: string;
  refineryId: string;
  outputWeightGrams: number;
  finenessPPT: number;
  barSerialNumber: string;
}) => fetchAPI<OnChainBar>('/traceability/refine', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const certifyBar = (data: {
  inputBarId: string;
  metal: string;
  assayerId: string;
  weightGrams: number;
  finenessPPT: number;
  hallmark: string;
  sku: string;
  productType: string;
}) => fetchAPI<OnChainProduct>('/traceability/certify', {
  method: 'POST',
  body: JSON.stringify(data),
});

export const transferTraceabilityCustody = (data: {
  recordType: 'ore' | 'bar' | 'product';
  id: string;
  to: string;
}) => fetchAPI<{
  recordType: string;
  id: string;
  from: string;
  to: string;
  timestamp: number;
  txHash: string | null;
  explorerUrl: string | null;
  gasInfo?: GasInfo;
}>('/traceability/transfer-custody', {
  method: 'POST',
  body: JSON.stringify(data),
});

// ── Document Root (on-chain Merkle anchoring) ──

export const setDocumentRoot = (recordType: string, recordId: string, data: {
  root: string;
  manifestCID?: string;
}) => fetchAPI<{ recordType: string; recordId: string; root: string; manifestCID: string; txHash: string; explorerUrl: string | null }>(
  `/traceability/${recordType}/${recordId}/document-root`,
  { method: 'POST', body: JSON.stringify(data) },
);

export const getDocumentRoot = (recordType: string, recordId: string) =>
  fetchAPI<{ root: string | null; manifestCID: string | null }>(
    `/traceability/${recordType}/${recordId}/document-root`,
  );

export const verifyDocumentProof = (recordType: string, recordId: string, data: {
  proof: string[];
  leaf: string;
}) => fetchAPI<{ valid: boolean; recordType: string; recordId: string; leaf: string }>(
  `/traceability/${recordType}/${recordId}/verify-document`,
  { method: 'POST', body: JSON.stringify(data) },
);
