/**
 * MongoDB Database Implementation
 * Implements the Sprint 1 schema with full persistence
 */

import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

// ============ SCHEMAS ============

const PartySchema = new mongoose.Schema({
  partyId: { type: String, required: true, unique: true, default: () => uuidv4() },
  legalName: { type: String, required: true },
  partyType: { 
    type: String, 
    required: true,
    enum: ['MineOperator', 'Transporter', 'Buyer', 'Refinery', 'Auditor', 'Other']
  },
  registrationId: { type: String },
  country: { type: String, required: true },
  jurisdiction: { type: String },
  contact: {
    name: { type: String },
    email: { type: String }
  },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const FacilitySchema = new mongoose.Schema({
  facilityId: { type: String, required: true, unique: true, default: () => uuidv4() },
  facilityName: { type: String, required: true },
  facilityType: { 
    type: String, 
    required: true,
    enum: ['Mine', 'Warehouse', 'Refinery', 'Port', 'Other']
  },
  ownerPartyId: { type: String, required: true, ref: 'Party' },
  location: {
    country: { type: String, required: true },
    region: { type: String },
    gpsLat: { type: Number },
    gpsLng: { type: Number }
  },
  identifiers: {
    permitIds: [{ type: String }],
    licenseIds: [{ type: String }]
  },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const BatchSchema = new mongoose.Schema({
  batchId: { type: String, required: true, unique: true, default: () => uuidv4() },
  externalReferenceNumber: { type: String, required: true, unique: true },
  commodityType: { type: String, required: true },
  originFacilityId: { type: String, required: true, ref: 'Facility' },
  ownerPartyId: { type: String, required: true, ref: 'Party' },
  creationTimestamp: { type: Date, default: Date.now },
  quantity: {
    weight: { type: Number, required: true },
    unit: { type: String, required: true, default: 'kg' }
  },
  declaredAssay: {
    value: { type: Number },
    unit: { type: String }
  },
  status: { 
    type: String, 
    required: true,
    enum: ['Created', 'InTransit', 'Received', 'Closed', 'Dispute'],
    default: 'Created'
  },
  parentBatchIds: [{ type: String, ref: 'Batch' }],
  notes: { type: String },
  batchHash: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const EventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, default: () => uuidv4() },
  eventType: { 
    type: String, 
    required: true,
    enum: ['Create', 'Transfer', 'Ship', 'Receive', 'InspectTest', 'AssayFinalized', 'Dispute', 'Resolve']
  },
  eventTimestamp: { type: Date, default: Date.now },
  batchId: { type: String, required: true, ref: 'Batch' },
  fromPartyId: { type: String, ref: 'Party' },
  toPartyId: { type: String, ref: 'Party' },
  fromFacilityId: { type: String, ref: 'Facility' },
  toFacilityId: { type: String, ref: 'Facility' },
  quantity: {
    weight: { type: Number },
    unit: { type: String }
  },
  references: [{ type: String, ref: 'Document' }],
  eventPayloadHash: { type: String },
  onChainTxHash: { type: String },
  blockNumber: { type: Number },
  chainId: { type: Number },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const DocumentSchema = new mongoose.Schema({
  documentId: { type: String, required: true, unique: true, default: () => uuidv4() },
  documentType: { 
    type: String, 
    required: true,
    enum: ['Permit', 'CertificateOfOrigin', 'PackingList', 'WaybillAirwayBill', 'ProFormaInvoice', 'AssayReport', 'Other']
  },
  fileName: { type: String, required: true },
  storageUri: { type: String },
  sha256Hash: { type: String, required: true },
  issuerPartyId: { type: String, required: true, ref: 'Party' },
  issuedDate: { type: Date },
  relatedBatchId: { type: String, ref: 'Batch' },
  relatedEventId: { type: String, ref: 'Event' },
  confidentialityLevel: { 
    type: String, 
    enum: ['Public', 'Restricted', 'Confidential'],
    default: 'Public'
  },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const CredentialSchema = new mongoose.Schema({
  credentialId: { type: String, required: true, unique: true, default: () => uuidv4() },
  credentialType: { 
    type: String, 
    required: true,
    enum: ['OriginProof', 'ComplianceAttestation', 'AssayAttestation']
  },
  issuerPartyId: { type: String, required: true, ref: 'Party' },
  subjectBatchId: { type: String, ref: 'Batch' },
  subjectFacilityId: { type: String, ref: 'Facility' },
  claimsSummary: { type: String },
  supportingDocumentIds: [{ type: String, ref: 'Document' }],
  signaturePlaceholder: { type: String, default: 'issuer asserted' },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, default: () => uuidv4() },
  partyId: { type: String, ref: 'Party' },
  role: { type: String, required: true },
  allowedBatchIds: [{ type: String, ref: 'Batch' }],
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const AuditLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  action: { type: String, required: true },
  entityType: { type: String, required: true },
  entityId: { type: String, required: true },
  userId: { type: String, default: 'system' },
  dataSummary: { type: String }
}, { timestamps: false });

// ============ MODELS ============

const Party = mongoose.model('Party', PartySchema);
const Facility = mongoose.model('Facility', FacilitySchema);
const Batch = mongoose.model('Batch', BatchSchema);
const Event = mongoose.model('Event', EventSchema);
const Document = mongoose.model('Document', DocumentSchema);
const Credential = mongoose.model('Credential', CredentialSchema);
const User = mongoose.model('User', UserSchema);
const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// ============ DATABASE CLASS ============

class MongoDatabase {
  constructor() {
    this.connected = false;
  }

  async connect(mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/gold-provenance') {
    try {
      await mongoose.connect(mongoUri);
      this.connected = true;
      console.log('Connected to MongoDB:', mongoUri);
      return { success: true };
    } catch (error) {
      console.error('MongoDB connection error:', error.message);
      return { success: false, error: error.message };
    }
  }

  async disconnect() {
    if (this.connected) {
      await mongoose.disconnect();
      this.connected = false;
      console.log('Disconnected from MongoDB');
    }
  }

  // ============ AUDIT LOG ============
  
  async logAction(action, entityType, entityId, data, userId = 'system') {
    try {
      await AuditLog.create({
        action,
        entityType,
        entityId,
        userId,
        dataSummary: JSON.stringify(data).substring(0, 500)
      });
    } catch (error) {
      console.warn('Audit log error:', error.message);
    }
  }

  async getAuditLog(entityId = null) {
    if (entityId) {
      return await AuditLog.find({ entityId }).sort({ timestamp: -1 }).lean();
    }
    return await AuditLog.find().sort({ timestamp: -1 }).limit(1000).lean();
  }

  // ============ PARTIES ============
  
  async saveParty(partyData) {
    const party = await Party.create(partyData);
    await this.logAction('CREATE', 'Party', party.partyId, party);
    return party.toObject();
  }

  async getParty(partyId) {
    const party = await Party.findOne({ partyId }).lean();
    return party;
  }

  async getAllParties() {
    return await Party.find().lean();
  }

  async getPartiesByType(partyType) {
    return await Party.find({ partyType }).lean();
  }

  // ============ FACILITIES ============
  
  async saveFacility(facilityData) {
    const facility = await Facility.create(facilityData);
    await this.logAction('CREATE', 'Facility', facility.facilityId, facility);
    return facility.toObject();
  }

  async getFacility(facilityId) {
    return await Facility.findOne({ facilityId }).lean();
  }

  async getAllFacilities() {
    return await Facility.find().lean();
  }

  async getFacilitiesByOwner(ownerPartyId) {
    return await Facility.find({ ownerPartyId }).lean();
  }

  // ============ BATCHES ============
  
  async saveBatch(batchData) {
    const batch = await Batch.create(batchData);
    await this.logAction('CREATE', 'Batch', batch.batchId, batch);
    return batch.toObject();
  }

  async updateBatch(batchData) {
    const batch = await Batch.findOneAndUpdate(
      { batchId: batchData.batchId },
      batchData,
      { new: true }
    ).lean();
    await this.logAction('UPDATE', 'Batch', batch.batchId, batch);
    return batch;
  }

  async getBatch(batchId) {
    return await Batch.findOne({ batchId }).lean();
  }

  async getBatchByReference(externalReferenceNumber) {
    return await Batch.findOne({ externalReferenceNumber }).lean();
  }

  async getAllBatches() {
    return await Batch.find().sort({ creationTimestamp: -1 }).lean();
  }

  async getBatchesByStatus(status) {
    return await Batch.find({ status }).lean();
  }

  async getBatchesByOwner(ownerPartyId) {
    return await Batch.find({ ownerPartyId }).lean();
  }

  // ============ EVENTS ============
  
  async saveEvent(eventData) {
    const event = await Event.create(eventData);
    await this.logAction('CREATE', 'Event', event.eventId, event);
    return event.toObject();
  }

  async getEvent(eventId) {
    return await Event.findOne({ eventId }).lean();
  }

  async getEventsByBatch(batchId) {
    return await Event.find({ batchId }).sort({ eventTimestamp: 1 }).lean();
  }

  async getAllEvents() {
    return await Event.find().sort({ eventTimestamp: -1 }).lean();
  }

  // ============ DOCUMENTS ============
  
  async saveDocument(documentData) {
    const document = await Document.create(documentData);
    await this.logAction('CREATE', 'Document', document.documentId, document);
    return document.toObject();
  }

  async getDocument(documentId) {
    return await Document.findOne({ documentId }).lean();
  }

  async getAllDocuments() {
    return await Document.find().lean();
  }

  async getDocumentsByBatch(batchId) {
    return await Document.find({ relatedBatchId: batchId }).lean();
  }

  // ============ CREDENTIALS ============
  
  async saveCredential(credentialData) {
    const credential = await Credential.create(credentialData);
    await this.logAction('CREATE', 'Credential', credential.credentialId, credential);
    return credential.toObject();
  }

  async getCredential(credentialId) {
    return await Credential.findOne({ credentialId }).lean();
  }

  async getAllCredentials() {
    return await Credential.find().lean();
  }

  async getCredentialsByBatch(batchId) {
    return await Credential.find({ subjectBatchId: batchId }).lean();
  }

  // ============ USERS ============
  
  async saveUser(userData) {
    const user = await User.create(userData);
    await this.logAction('CREATE', 'User', user.userId, user);
    return user.toObject();
  }

  async getUser(userId) {
    return await User.findOne({ userId }).lean();
  }

  async getAllUsers() {
    return await User.find().lean();
  }

  async getUsersByParty(partyId) {
    return await User.find({ partyId }).lean();
  }

  // ============ UTILITY ============
  
  async clearAll() {
    await Party.deleteMany({});
    await Facility.deleteMany({});
    await Batch.deleteMany({});
    await Event.deleteMany({});
    await Document.deleteMany({});
    await Credential.deleteMany({});
    await User.deleteMany({});
    await AuditLog.deleteMany({});
    console.log('All collections cleared');
  }

  async getStats() {
    return {
      parties: await Party.countDocuments(),
      facilities: await Facility.countDocuments(),
      batches: await Batch.countDocuments(),
      events: await Event.countDocuments(),
      documents: await Document.countDocuments(),
      credentials: await Credential.countDocuments(),
      users: await User.countDocuments(),
      auditLogs: await AuditLog.countDocuments()
    };
  }
}

// ============ EXPORT ============

const mongoDb = new MongoDatabase();
export default mongoDb;
