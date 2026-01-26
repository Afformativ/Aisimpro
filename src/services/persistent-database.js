/**
 * File-Based Persistent Database Store
 * Stores data in JSON files for persistence across restarts
 * All users share the same data - batches are visible to everyone
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data directory - use environment variable or default to ./data
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');

class PersistentDatabase {
  constructor() {
    this.parties = new Map();
    this.facilities = new Map();
    this.batches = new Map();
    this.events = new Map();
    this.documents = new Map();
    this.credentials = new Map();
    this.users = new Map();
    this.auditLog = [];
    
    // Ensure data directory exists
    this.ensureDataDir();
    
    // Load existing data from files
    this.loadAll();
  }

  ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`Created data directory: ${DATA_DIR}`);
    }
  }

  getFilePath(collection) {
    return path.join(DATA_DIR, `${collection}.json`);
  }

  loadCollection(collection) {
    const filePath = this.getFilePath(collection);
    try {
      if (fs.existsSync(filePath)) {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        return new Map(Object.entries(data));
      }
    } catch (error) {
      console.warn(`Warning: Could not load ${collection}.json:`, error.message);
    }
    return new Map();
  }

  loadArray(collection) {
    const filePath = this.getFilePath(collection);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch (error) {
      console.warn(`Warning: Could not load ${collection}.json:`, error.message);
    }
    return [];
  }

  saveCollection(collection, map) {
    const filePath = this.getFilePath(collection);
    const data = Object.fromEntries(map);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  saveArray(collection, array) {
    const filePath = this.getFilePath(collection);
    fs.writeFileSync(filePath, JSON.stringify(array, null, 2));
  }

  loadAll() {
    console.log('Loading data from disk...');
    this.parties = this.loadCollection('parties');
    this.facilities = this.loadCollection('facilities');
    this.batches = this.loadCollection('batches');
    this.events = this.loadCollection('events');
    this.documents = this.loadCollection('documents');
    this.credentials = this.loadCollection('credentials');
    this.users = this.loadCollection('users');
    this.auditLog = this.loadArray('auditLog');
    
    console.log(`Loaded: ${this.parties.size} parties, ${this.facilities.size} facilities, ${this.batches.size} batches, ${this.events.size} events`);
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
    this.saveArray('auditLog', this.auditLog);
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
    this.saveCollection('parties', this.parties);
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
    this.saveCollection('facilities', this.facilities);
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
    this.saveCollection('batches', this.batches);
    this.logAction('CREATE', 'Batch', batch.batchId, batch);
    return batch;
  }

  updateBatch(batch) {
    this.batches.set(batch.batchId, batch);
    this.saveCollection('batches', this.batches);
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

  getBatchesByStatus(status) {
    return this.getAllBatches().filter(b => b.status === status);
  }

  getBatchesByOwner(ownerPartyId) {
    return this.getAllBatches().filter(b => b.ownerPartyId === ownerPartyId);
  }

  // ============ EVENTS ============
  
  saveEvent(event) {
    this.events.set(event.eventId, event);
    this.saveCollection('events', this.events);
    this.logAction('CREATE', 'Event', event.eventId, event);
    return event;
  }

  getEvent(eventId) {
    return this.events.get(eventId) || null;
  }

  getEventsForBatch(batchId) {
    return Array.from(this.events.values())
      .filter(e => e.batchId === batchId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  // Compatibility: in-memory DB uses `getEventsByBatch` name
  getEventsByBatch(batchId) {
    return this.getEventsForBatch(batchId);
  }

  getAllEvents() {
    return Array.from(this.events.values());
  }

  // ============ DOCUMENTS ============
  
  saveDocument(document) {
    this.documents.set(document.documentId, document);
    this.saveCollection('documents', this.documents);
    this.logAction('CREATE', 'Document', document.documentId, document);
    return document;
  }

  getDocument(documentId) {
    return this.documents.get(documentId) || null;
  }

  getDocumentsByBatch(batchId) {
    return Array.from(this.documents.values())
      .filter(d => d.relatedBatchId === batchId);
  }

  // Compatibility: in-memory DB uses `getCredentialsByBatch(batchId)`
  getCredentialsByBatch(batchId) {
    return Array.from(this.credentials.values()).filter(c => c.subjectBatchId === batchId);
  }

  getAllDocuments() {
    return Array.from(this.documents.values());
  }

  // ============ CREDENTIALS ============
  
  saveCredential(credential) {
    this.credentials.set(credential.credentialId, credential);
    this.saveCollection('credentials', this.credentials);
    this.logAction('CREATE', 'Credential', credential.credentialId, credential);
    return credential;
  }

  getCredential(credentialId) {
    return this.credentials.get(credentialId) || null;
  }

  getCredentialsForParty(holderPartyId) {
    return Array.from(this.credentials.values())
      .filter(c => c.holderPartyId === holderPartyId);
  }

  getAllCredentials() {
    return Array.from(this.credentials.values());
  }

  // ============ USERS ============
  
  saveUser(user) {
    this.users.set(user.username, user);
    this.saveCollection('users', this.users);
    return user;
  }

  getUser(username) {
    return this.users.get(username) || null;
  }

  // ============ UTILITY ============
  
  clearAll() {
    this.parties.clear();
    this.facilities.clear();
    this.batches.clear();
    this.events.clear();
    this.documents.clear();
    this.credentials.clear();
    this.users.clear();
    this.auditLog = [];
    
    // Delete all JSON files
    const collections = ['parties', 'facilities', 'batches', 'events', 'documents', 'credentials', 'users', 'auditLog'];
    collections.forEach(col => {
      const filePath = this.getFilePath(col);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
    
    console.log('Database cleared');
  }

  getStats() {
    return {
      parties: this.parties.size,
      facilities: this.facilities.size,
      batches: this.batches.size,
      events: this.events.size,
      documents: this.documents.size,
      auditLogEntries: this.auditLog.length,
      dataDirectory: DATA_DIR
    };
  }
}

// Export singleton instance
const db = new PersistentDatabase();
export default db;
