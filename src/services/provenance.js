/**
 * Provenance Service
 * Core business logic for batch creation, events, and verification
 * Implements the flow: Create Batch → Record Events → Anchor Hashes → Verify
 */

// Use persistent database for production (shared data)
// Fall back to in-memory for local dev if needed
const usePersistent = process.env.USE_PERSISTENT_DB !== 'false';
const db = usePersistent 
  ? (await import('./persistent-database.js')).default
  : (await import('./database.js')).default;

import { computeEventHash, computeBatchHash, hashDocument, verifyDocumentHash } from './hashing.js';
import anchoringService from './anchoring.js';
import {
  createParty,
  createFacility,
  createBatch,
  createEvent,
  createDocument,
  createCredential,
  EventType,
  BatchStatus
} from '../models/index.js';

class ProvenanceService {
  
  // ============ PARTY MANAGEMENT ============
  
  registerParty(partyData) {
    const party = createParty(partyData);
    return db.saveParty(party);
  }

  getParty(partyId) {
    return db.getParty(partyId);
  }

  getAllParties() {
    return db.getAllParties();
  }

  // ============ FACILITY MANAGEMENT ============
  
  registerFacility(facilityData) {
    const facility = createFacility(facilityData);
    return db.saveFacility(facility);
  }

  getFacility(facilityId) {
    return db.getFacility(facilityId);
  }

  getAllFacilities() {
    return db.getAllFacilities();
  }

  // ============ DOCUMENT MANAGEMENT ============
  
  /**
   * Register a document with its hash
   */
  registerDocument(documentData) {
    // If content provided, compute hash
    if (documentData.content && !documentData.sha256Hash) {
      documentData.sha256Hash = hashDocument(documentData.content);
      delete documentData.content; // Don't store content
    }
    
    const document = createDocument(documentData);
    return db.saveDocument(document);
  }

  getDocument(documentId) {
    return db.getDocument(documentId);
  }

  getDocumentsForBatch(batchId) {
    return db.getDocumentsByBatch(batchId);
  }

  /**
   * Verify a document's integrity
   */
  verifyDocument(documentId, content) {
    const doc = db.getDocument(documentId);
    if (!doc) {
      return { valid: false, error: 'Document not found' };
    }
    
    const result = verifyDocumentHash(content, doc.sha256Hash);
    return {
      valid: result.isValid,
      documentId,
      fileName: doc.fileName,
      computedHash: result.computedHash,
      storedHash: result.storedHash
    };
  }

  // ============ BATCH MANAGEMENT ============
  
  /**
   * Create a new batch at the mine (FR 3.1.3)
   * This is the "Create/Declare" event
   */
  async createBatchAtMine(batchData, documentIds = []) {
    // Create the batch
    const batch = createBatch(batchData);
    batch.documentIds = documentIds;
    
    // Create the initial "Create" event
    const createEventData = {
      eventType: EventType.CREATE,
      batchId: batch.batchId,
      fromPartyId: null,
      toPartyId: batch.ownerPartyId,
      fromFacilityId: null,
      toFacilityId: batch.originFacilityId,
      weight: batch.quantity.weight,
      weightUnit: batch.quantity.unit,
      documentIds,
      notes: 'Batch created at origin facility'
    };
    
    const event = createEvent(createEventData);
    
    // Compute hashes
    event.eventPayloadHash = computeEventHash(event);
    const batchHash = computeBatchHash(batch);
    
    // Anchor to blockchain
    const batchAnchor = await anchoringService.anchorBatch(batch.batchId, batchHash);
    const eventAnchor = await anchoringService.anchorEvent(event.eventId, event.eventPayloadHash);
    
    event.onChainTxHash = eventAnchor.txHash;
    batch.eventIds.push(event.eventId);
    
    // Save to database
    db.saveBatch(batch);
    db.saveEvent(event);
    
    // Link documents to batch
    documentIds.forEach(docId => {
      const doc = db.getDocument(docId);
      if (doc) {
        doc.relatedBatchId = batch.batchId;
        doc.relatedEventId = event.eventId;
      }
    });
    
    return {
      batch,
      event,
      batchAnchor,
      eventAnchor
    };
  }

  /**
   * Get a batch by ID
   */
  getBatch(batchId) {
    return db.getBatch(batchId);
  }

  /**
   * Get a batch by external reference number
   */
  getBatchByReference(referenceNumber) {
    return db.getBatchByReference(referenceNumber);
  }

  getAllBatches() {
    return db.getAllBatches();
  }

  // ============ EVENT RECORDING ============
  
  /**
   * Record a Ship/Transfer custody event (FR 3.1.5)
   */
  async recordShipment(batchId, shipmentData) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const event = createEvent({
      eventType: EventType.SHIP,
      batchId,
      fromPartyId: batch.ownerPartyId,
      toPartyId: shipmentData.toPartyId,
      fromFacilityId: shipmentData.fromFacilityId || batch.originFacilityId,
      toFacilityId: shipmentData.toFacilityId,
      weight: batch.quantity.weight,
      weightUnit: batch.quantity.unit,
      documentIds: shipmentData.documentIds || [],
      notes: shipmentData.notes || 'Shipment dispatched'
    });

    event.eventPayloadHash = computeEventHash(event);
    const anchor = await anchoringService.anchorEvent(event.eventId, event.eventPayloadHash);
    event.onChainTxHash = anchor.txHash;

    // Update batch status
    batch.status = BatchStatus.IN_TRANSIT;
    batch.eventIds.push(event.eventId);
    
    db.updateBatch(batch);
    db.saveEvent(event);

    return { event, anchor, batch };
  }

  /**
   * Record a Transfer custody event (change of ownership during transit)
   */
  async recordTransfer(batchId, transferData) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const event = createEvent({
      eventType: EventType.TRANSFER,
      batchId,
      fromPartyId: batch.ownerPartyId,
      toPartyId: transferData.toPartyId,
      fromFacilityId: transferData.fromFacilityId,
      toFacilityId: transferData.toFacilityId,
      weight: batch.quantity.weight,
      weightUnit: batch.quantity.unit,
      documentIds: transferData.documentIds || [],
      notes: transferData.notes || 'Custody transferred'
    });

    event.eventPayloadHash = computeEventHash(event);
    const anchor = await anchoringService.anchorEvent(event.eventId, event.eventPayloadHash);
    event.onChainTxHash = anchor.txHash;

    // Update batch ownership
    batch.ownerPartyId = transferData.toPartyId;
    batch.eventIds.push(event.eventId);
    
    db.updateBatch(batch);
    db.saveEvent(event);

    return { event, anchor, batch };
  }

  /**
   * Record a Receive/Accept event (FR 3.1.5)
   */
  async recordReceipt(batchId, receiptData) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const event = createEvent({
      eventType: EventType.RECEIVE,
      batchId,
      fromPartyId: batch.ownerPartyId,
      toPartyId: receiptData.receiverPartyId,
      fromFacilityId: null,
      toFacilityId: receiptData.facilityId,
      weight: receiptData.receivedWeight || batch.quantity.weight,
      weightUnit: batch.quantity.unit,
      documentIds: receiptData.documentIds || [],
      notes: receiptData.notes || 'Shipment received and acknowledged'
    });

    event.eventPayloadHash = computeEventHash(event);
    const anchor = await anchoringService.anchorEvent(event.eventId, event.eventPayloadHash);
    event.onChainTxHash = anchor.txHash;

    // Update batch
    batch.status = BatchStatus.RECEIVED;
    batch.ownerPartyId = receiptData.receiverPartyId;
    batch.eventIds.push(event.eventId);
    
    db.updateBatch(batch);
    db.saveEvent(event);

    return { event, anchor, batch };
  }

  /**
   * Record an Inspect/Test event (optional)
   */
  async recordInspection(batchId, inspectionData) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const event = createEvent({
      eventType: EventType.INSPECT_TEST,
      batchId,
      fromPartyId: inspectionData.inspectorPartyId,
      toPartyId: null,
      fromFacilityId: inspectionData.facilityId,
      toFacilityId: null,
      weight: batch.quantity.weight,
      weightUnit: batch.quantity.unit,
      documentIds: inspectionData.documentIds || [],
      notes: inspectionData.notes || 'Inspection/testing completed'
    });

    event.eventPayloadHash = computeEventHash(event);
    const anchor = await anchoringService.anchorEvent(event.eventId, event.eventPayloadHash);
    event.onChainTxHash = anchor.txHash;

    batch.eventIds.push(event.eventId);
    db.updateBatch(batch);
    db.saveEvent(event);

    return { event, anchor, batch };
  }

  /**
   * Record Assay Finalized event (for refinery flow)
   */
  async recordAssayFinalized(batchId, assayData) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const event = createEvent({
      eventType: EventType.ASSAY_FINALIZED,
      batchId,
      fromPartyId: assayData.assayerPartyId,
      toPartyId: null,
      fromFacilityId: assayData.facilityId,
      toFacilityId: null,
      weight: batch.quantity.weight,
      weightUnit: batch.quantity.unit,
      documentIds: assayData.documentIds || [],
      notes: `Assay finalized: ${assayData.assayValue} ${assayData.assayUnit || 'g/t'}`
    });

    event.eventPayloadHash = computeEventHash(event);
    const anchor = await anchoringService.anchorEvent(event.eventId, event.eventPayloadHash);
    event.onChainTxHash = anchor.txHash;

    // Update batch with final assay
    batch.declaredAssay = { value: assayData.assayValue, unit: assayData.assayUnit || 'g/t' };
    batch.eventIds.push(event.eventId);
    
    db.updateBatch(batch);
    db.saveEvent(event);

    return { event, anchor, batch };
  }

  /**
   * Flag a dispute on a batch
   */
  async recordDispute(batchId, disputeData) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      throw new Error(`Batch ${batchId} not found`);
    }

    const event = createEvent({
      eventType: EventType.DISPUTE,
      batchId,
      fromPartyId: disputeData.raisedByPartyId,
      toPartyId: null,
      fromFacilityId: null,
      toFacilityId: null,
      documentIds: disputeData.documentIds || [],
      notes: disputeData.reason || 'Dispute raised'
    });

    event.eventPayloadHash = computeEventHash(event);
    const anchor = await anchoringService.anchorEvent(event.eventId, event.eventPayloadHash);
    event.onChainTxHash = anchor.txHash;

    batch.status = BatchStatus.DISPUTE;
    batch.eventIds.push(event.eventId);
    
    db.updateBatch(batch);
    db.saveEvent(event);

    return { event, anchor, batch };
  }

  // ============ VERIFICATION ============
  
  /**
   * Get complete chain of custody for a batch (FR 3.1.6)
   */
  getChainOfCustody(batchId) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      return null;
    }

    const events = db.getEventsByBatch(batchId);
    const documents = db.getDocumentsByBatch(batchId);
    const credentials = db.getCredentialsByBatch(batchId);
    const originFacility = db.getFacility(batch.originFacilityId);
    const currentOwner = db.getParty(batch.ownerPartyId);

    // Build timeline with enriched data
    const timeline = events.map(event => {
      const fromParty = event.fromPartyId ? db.getParty(event.fromPartyId) : null;
      const toParty = event.toPartyId ? db.getParty(event.toPartyId) : null;
      const fromFacility = event.fromFacilityId ? db.getFacility(event.fromFacilityId) : null;
      const toFacility = event.toFacilityId ? db.getFacility(event.toFacilityId) : null;
      const eventDocs = event.references.map(docId => db.getDocument(docId)).filter(Boolean);

      return {
        eventId: event.eventId,
        eventType: event.eventType,
        timestamp: event.eventTimestamp,
        from: {
          party: fromParty ? { id: fromParty.partyId, name: fromParty.legalName } : null,
          facility: fromFacility ? { id: fromFacility.facilityId, name: fromFacility.facilityName } : null
        },
        to: {
          party: toParty ? { id: toParty.partyId, name: toParty.legalName } : null,
          facility: toFacility ? { id: toFacility.facilityId, name: toFacility.facilityName } : null
        },
        quantity: event.quantity,
        notes: event.notes,
        documents: eventDocs.map(d => ({
          id: d.documentId,
          type: d.documentType,
          fileName: d.fileName,
          hash: d.sha256Hash
        })),
        payloadHash: event.eventPayloadHash,
        txHash: event.onChainTxHash,
        explorerUrl: event.onChainTxHash ? 
          anchoringService.getExplorerUrl(event.onChainTxHash) : null
      };
    });

    return {
      batch: {
        batchId: batch.batchId,
        referenceNumber: batch.externalReferenceNumber,
        commodityType: batch.commodityType,
        quantity: batch.quantity,
        declaredAssay: batch.declaredAssay,
        status: batch.status,
        createdAt: batch.creationTimestamp
      },
      originFacility: originFacility ? {
        id: originFacility.facilityId,
        name: originFacility.facilityName,
        type: originFacility.facilityType,
        location: originFacility.location
      } : null,
      currentCustodian: currentOwner ? {
        id: currentOwner.partyId,
        name: currentOwner.legalName,
        type: currentOwner.partyType
      } : null,
      timeline,
      documentCount: documents.length,
      allDocuments: documents.map(d => ({
        id: d.documentId,
        type: d.documentType,
        fileName: d.fileName,
        hash: d.sha256Hash,
        confidentiality: d.confidentialityLevel
      })),
      credentials: credentials.map(c => ({
        id: c.credentialId,
        type: c.credentialType,
        issuer: db.getParty(c.issuerPartyId)?.legalName,
        claims: c.claimsSummary
      })),
      verificationStatus: this._computeVerificationStatus(batch, events, documents)
    };
  }

  /**
   * Verify integrity of all hashes for a batch
   */
  async verifyBatchIntegrity(batchId) {
    const batch = db.getBatch(batchId);
    if (!batch) {
      return { valid: false, error: 'Batch not found' };
    }

    const events = db.getEventsByBatch(batchId);
    const verificationResults = {
      batchId,
      overallValid: true,
      batchHashValid: true,
      events: [],
      anchorVerifications: []
    };

    // Verify batch hash
    const computedBatchHash = computeBatchHash(batch);
    
    // Verify each event
    for (const event of events) {
      const computedHash = computeEventHash(event);
      const hashMatch = computedHash === event.eventPayloadHash;
      
      let anchorValid = null;
      if (event.onChainTxHash) {
        const anchorCheck = await anchoringService.verifyAnchor(event.onChainTxHash);
        anchorValid = anchorCheck.verified;
        verificationResults.anchorVerifications.push({
          eventId: event.eventId,
          txHash: event.onChainTxHash,
          verified: anchorValid
        });
      }

      verificationResults.events.push({
        eventId: event.eventId,
        eventType: event.eventType,
        storedHash: event.eventPayloadHash,
        computedHash,
        hashMatch,
        anchorValid
      });

      if (!hashMatch) {
        verificationResults.overallValid = false;
      }
    }

    return verificationResults;
  }

  /**
   * Compute verification status for display
   */
  _computeVerificationStatus(batch, events, documents) {
    const hasCreateEvent = events.some(e => e.eventType === EventType.CREATE);
    const hasDocuments = documents.length > 0;
    const allEventsAnchored = events.every(e => e.onChainTxHash);
    
    if (batch.status === BatchStatus.DISPUTE) {
      return { status: 'DISPUTED', message: 'Batch has an active dispute' };
    }
    
    if (!hasCreateEvent) {
      return { status: 'INCOMPLETE', message: 'Missing creation event' };
    }
    
    if (!hasDocuments) {
      return { status: 'INCOMPLETE', message: 'No supporting documents attached' };
    }
    
    if (!allEventsAnchored) {
      return { status: 'PARTIAL', message: 'Some events not yet anchored on blockchain' };
    }
    
    return { status: 'VERIFIED', message: 'All events recorded and anchored' };
  }

  // ============ CREDENTIALS ============
  
  issueCredential(credentialData) {
    const credential = createCredential(credentialData);
    return db.saveCredential(credential);
  }

  // ============ EXPORT ============
  
  exportBatchPackage(batchId) {
    return db.exportBatchPackage(batchId);
  }

  getAuditLog(entityId = null) {
    return db.getAuditLog(entityId);
  }

  // ============ IMPORT (Simulation) ============
  
  importData(jsonData) {
    return db.importFromJSON(jsonData);
  }
}

// Export singleton
const provenanceService = new ProvenanceService();
export default provenanceService;
export { ProvenanceService };
