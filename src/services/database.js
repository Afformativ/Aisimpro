/**
 * In-Memory Database Store
 * Simple storage layer for the prototype (can be swapped for SQLite/PostgreSQL later)
 */

class Database {
  constructor() {
    this.parties = new Map();
    this.facilities = new Map();
    this.batches = new Map();
    this.events = new Map();
    this.documents = new Map();
    this.credentials = new Map();
    this.users = new Map();
    this.auditLog = []; // Append-only audit trail
  }

  // ============ AUDIT LOG ============
  
  logAction(action, entityType, entityId, data, userId = 'system') {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      action,
      entityType,
      entityId,
      userId,
      dataSummary: JSON.stringify(data).substring(0, 500)
    });
  }

  getAuditLog(entityId = null) {
    if (entityId) {
      return this.auditLog.filter(entry => entry.entityId === entityId);
    }
    return [...this.auditLog];
  }

  // ============ PARTIES ============
  
  saveParty(party) {
    this.parties.set(party.partyId, party);
    this.logAction('CREATE', 'Party', party.partyId, party);
    return party;
  }

  getParty(partyId) {
    return this.parties.get(partyId) || null;
  }

  getAllParties() {
    return Array.from(this.parties.values());
  }

  getPartiesByType(partyType) {
    return this.getAllParties().filter(p => p.partyType === partyType);
  }

  // ============ FACILITIES ============
  
  saveFacility(facility) {
    this.facilities.set(facility.facilityId, facility);
    this.logAction('CREATE', 'Facility', facility.facilityId, facility);
    return facility;
  }

  getFacility(facilityId) {
    return this.facilities.get(facilityId) || null;
  }

  getAllFacilities() {
    return Array.from(this.facilities.values());
  }

  getFacilitiesByOwner(ownerPartyId) {
    return this.getAllFacilities().filter(f => f.ownerPartyId === ownerPartyId);
  }

  // ============ BATCHES ============
  
  saveBatch(batch) {
    this.batches.set(batch.batchId, batch);
    this.logAction('CREATE', 'Batch', batch.batchId, batch);
    return batch;
  }

  updateBatch(batch) {
    this.batches.set(batch.batchId, batch);
    this.logAction('UPDATE', 'Batch', batch.batchId, batch);
    return batch;
  }

  getBatch(batchId) {
    return this.batches.get(batchId) || null;
  }

  getBatchByReference(externalReferenceNumber) {
    return this.getAllBatches().find(b => b.externalReferenceNumber === externalReferenceNumber) || null;
  }

  getAllBatches() {
    return Array.from(this.batches.values());
  }

  getBatchesByOwner(ownerPartyId) {
    return this.getAllBatches().filter(b => b.ownerPartyId === ownerPartyId);
  }

  getBatchesByFacility(facilityId) {
    return this.getAllBatches().filter(b => b.originFacilityId === facilityId);
  }

  // ============ EVENTS ============
  
  saveEvent(event) {
    this.events.set(event.eventId, event);
    this.logAction('CREATE', 'Event', event.eventId, event);
    return event;
  }

  updateEvent(event) {
    this.events.set(event.eventId, event);
    this.logAction('UPDATE', 'Event', event.eventId, event);
    return event;
  }

  getEvent(eventId) {
    return this.events.get(eventId) || null;
  }

  getAllEvents() {
    return Array.from(this.events.values());
  }

  getEventsByBatch(batchId) {
    return this.getAllEvents()
      .filter(e => e.batchId === batchId)
      .sort((a, b) => new Date(a.eventTimestamp) - new Date(b.eventTimestamp));
  }

  // ============ DOCUMENTS ============
  
  saveDocument(document) {
    this.documents.set(document.documentId, document);
    this.logAction('CREATE', 'Document', document.documentId, document);
    return document;
  }

  getDocument(documentId) {
    return this.documents.get(documentId) || null;
  }

  getAllDocuments() {
    return Array.from(this.documents.values());
  }

  getDocumentsByBatch(batchId) {
    return this.getAllDocuments().filter(d => d.relatedBatchId === batchId);
  }

  getDocumentsByEvent(eventId) {
    return this.getAllDocuments().filter(d => d.relatedEventId === eventId);
  }

  // ============ CREDENTIALS ============
  
  saveCredential(credential) {
    this.credentials.set(credential.credentialId, credential);
    this.logAction('CREATE', 'Credential', credential.credentialId, credential);
    return credential;
  }

  getCredential(credentialId) {
    return this.credentials.get(credentialId) || null;
  }

  getCredentialsByBatch(batchId) {
    return Array.from(this.credentials.values()).filter(c => c.subjectBatchId === batchId);
  }

  // ============ USERS ============
  
  saveUser(user) {
    this.users.set(user.userId, user);
    this.logAction('CREATE', 'User', user.userId, { ...user, password: '[REDACTED]' });
    return user;
  }

  getUser(userId) {
    return this.users.get(userId) || null;
  }

  getUserByUsername(username) {
    return Array.from(this.users.values()).find(u => u.username === username) || null;
  }

  // ============ EXPORT ============
  
  exportBatchPackage(batchId) {
    const batch = this.getBatch(batchId);
    if (!batch) return null;

    return {
      exportedAt: new Date().toISOString(),
      batch,
      events: this.getEventsByBatch(batchId),
      documents: this.getDocumentsByBatch(batchId),
      credentials: this.getCredentialsByBatch(batchId),
      originFacility: this.getFacility(batch.originFacilityId),
      currentOwner: this.getParty(batch.ownerPartyId)
    };
  }

  // ============ IMPORT (Simulation) ============
  
  importFromJSON(jsonData) {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    const results = { parties: 0, facilities: 0, batches: 0, events: 0, documents: 0 };

    if (data.parties) {
      data.parties.forEach(p => { this.saveParty(p); results.parties++; });
    }
    if (data.facilities) {
      data.facilities.forEach(f => { this.saveFacility(f); results.facilities++; });
    }
    if (data.batches) {
      data.batches.forEach(b => { this.saveBatch(b); results.batches++; });
    }
    if (data.events) {
      data.events.forEach(e => { this.saveEvent(e); results.events++; });
    }
    if (data.documents) {
      data.documents.forEach(d => { this.saveDocument(d); results.documents++; });
    }

    return results;
  }
}

// Singleton instance
const db = new Database();
export default db;
