// Gold Provenance API Client

import type {
  Party,
  Facility,
  Document,
  Batch,
  ChainOfCustody,
  VerificationResult,
  AuditLogEntry,
} from '../types';

// API URL: use environment variable or default to localhost for development
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
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
