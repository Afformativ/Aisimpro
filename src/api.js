/**
 * Gold Provenance API Server
 * REST API for the traceability prototype
 */

import 'dotenv/config';
import express from 'express';
import provenanceService from './services/provenance.js';
import anchoringService from './services/anchoring.js';
import { PartyType, FacilityType, DocumentType } from './models/index.js';

const app = express();
app.use(express.json());

// CORS middleware for UI
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    simulationMode: anchoringService.isSimulated()
  });
});

// ============ PARTIES ============

app.post('/api/parties', (req, res) => {
  try {
    const party = provenanceService.registerParty(req.body);
    res.status(201).json(party);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/parties', (req, res) => {
  const parties = provenanceService.getAllParties();
  res.json(parties);
});

app.get('/api/parties/:partyId', (req, res) => {
  const party = provenanceService.getParty(req.params.partyId);
  if (!party) {
    return res.status(404).json({ error: 'Party not found' });
  }
  res.json(party);
});

// ============ FACILITIES ============

app.post('/api/facilities', (req, res) => {
  try {
    const facility = provenanceService.registerFacility(req.body);
    res.status(201).json(facility);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/facilities', (req, res) => {
  const facilities = provenanceService.getAllFacilities();
  res.json(facilities);
});

app.get('/api/facilities/:facilityId', (req, res) => {
  const facility = provenanceService.getFacility(req.params.facilityId);
  if (!facility) {
    return res.status(404).json({ error: 'Facility not found' });
  }
  res.json(facility);
});

// ============ DOCUMENTS ============

app.post('/api/documents', (req, res) => {
  try {
    const document = provenanceService.registerDocument(req.body);
    res.status(201).json(document);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/documents/:documentId', (req, res) => {
  const document = provenanceService.getDocument(req.params.documentId);
  if (!document) {
    return res.status(404).json({ error: 'Document not found' });
  }
  res.json(document);
});

app.post('/api/documents/:documentId/verify', (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Content required for verification' });
  }
  const result = provenanceService.verifyDocument(req.params.documentId, content);
  res.json(result);
});

// ============ BATCHES ============

app.post('/api/batches', async (req, res) => {
  try {
    const { documentIds = [], ...batchData } = req.body;
    const result = await provenanceService.createBatchAtMine(batchData, documentIds);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/batches', (req, res) => {
  const batches = provenanceService.getAllBatches();
  res.json(batches);
});

app.get('/api/batches/:batchId', (req, res) => {
  const batch = provenanceService.getBatch(req.params.batchId);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  res.json(batch);
});

app.get('/api/batches/reference/:refNumber', (req, res) => {
  const batch = provenanceService.getBatchByReference(req.params.refNumber);
  if (!batch) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  res.json(batch);
});

// ============ EVENTS ============

app.post('/api/batches/:batchId/ship', async (req, res) => {
  try {
    const result = await provenanceService.recordShipment(req.params.batchId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/batches/:batchId/transfer', async (req, res) => {
  try {
    const result = await provenanceService.recordTransfer(req.params.batchId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/batches/:batchId/receive', async (req, res) => {
  try {
    const result = await provenanceService.recordReceipt(req.params.batchId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/batches/:batchId/inspect', async (req, res) => {
  try {
    const result = await provenanceService.recordInspection(req.params.batchId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/batches/:batchId/assay', async (req, res) => {
  try {
    const result = await provenanceService.recordAssayFinalized(req.params.batchId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/batches/:batchId/dispute', async (req, res) => {
  try {
    const result = await provenanceService.recordDispute(req.params.batchId, req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ VERIFICATION ============

app.get('/api/batches/:batchId/chain-of-custody', (req, res) => {
  const chain = provenanceService.getChainOfCustody(req.params.batchId);
  if (!chain) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  res.json(chain);
});

app.get('/api/batches/:batchId/verify', async (req, res) => {
  try {
    const result = await provenanceService.verifyBatchIntegrity(req.params.batchId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ EXPORT ============

app.get('/api/batches/:batchId/export', (req, res) => {
  const pkg = provenanceService.exportBatchPackage(req.params.batchId);
  if (!pkg) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  res.json(pkg);
});

// ============ AUDIT LOG ============

app.get('/api/audit', (req, res) => {
  const entityId = req.query.entityId || null;
  const log = provenanceService.getAuditLog(entityId);
  res.json(log);
});

// ============ IMPORT (Simulation) ============

app.post('/api/import', (req, res) => {
  try {
    const result = provenanceService.importData(req.body);
    res.json({ success: true, imported: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ ENUMS (for UI reference) ============

app.get('/api/enums', (req, res) => {
  res.json({
    partyTypes: Object.values(PartyType),
    facilityTypes: Object.values(FacilityType),
    documentTypes: Object.values(DocumentType)
  });
});

// ============ SEED DATA ============

function seedTestData() {
  // Check if data already exists
  if (provenanceService.getAllParties().length > 0) {
    console.log(' Database already has data, skipping seed');
    return;
  }

  console.log(' Seeding test data...');

  // Create Parties
  const parties = [
    {
      legalName: 'Golden Peak Mining Corp',
      partyType: 'MineOperator',
      country: 'Peru',
      registrationId: 'PE-MIN-2026-001',
      contactName: 'Carlos Mendoza',
      contactEmail: 'carlos@goldenpeak.pe'
    },
    {
      legalName: 'SecureGold Logistics Ltd',
      partyType: 'Transporter',
      country: 'Switzerland',
      registrationId: 'CH-LOG-2026-042',
      contactName: 'Hans Mueller',
      contactEmail: 'hans@securegold.ch'
    },
    {
      legalName: 'Swiss Precious Metals AG',
      partyType: 'Buyer',
      country: 'Switzerland',
      registrationId: 'CH-BUY-2026-099',
      contactName: 'Anna Schmidt',
      contactEmail: 'anna@swissmetals.ch'
    },
    {
      legalName: 'Valcambi Refinery SA',
      partyType: 'Refinery',
      country: 'Switzerland',
      registrationId: 'CH-REF-2026-007',
      contactName: 'Marco Rossi',
      contactEmail: 'marco@valcambi.ch'
    },
    {
      legalName: 'Bureau Veritas Auditing',
      partyType: 'Auditor',
      country: 'France',
      registrationId: 'FR-AUD-2026-123',
      contactName: 'Marie Dupont',
      contactEmail: 'marie@bvauditing.fr'
    },
    {
      legalName: 'Andean Gold Miners Co-op',
      partyType: 'MineOperator',
      country: 'Colombia',
      registrationId: 'CO-MIN-2026-015',
      contactName: 'Miguel Santos',
      contactEmail: 'miguel@andeangold.co'
    }
  ];

  const createdParties = {};
  parties.forEach(p => {
    const party = provenanceService.registerParty(p);
    createdParties[p.partyType + '_' + p.country] = party;
    console.log(`  Party: ${party.legalName}`);
  });

  // Create Facilities
  const facilities = [
    {
      facilityName: 'Cerro Rico Mine Site',
      facilityType: 'Mine',
      ownerPartyId: createdParties['MineOperator_Peru'].partyId,
      country: 'Peru',
      region: 'Puno',
      gpsLat: -15.8402,
      gpsLng: -70.0219
    },
    {
      facilityName: 'Lima Secure Warehouse',
      facilityType: 'Warehouse',
      ownerPartyId: createdParties['Transporter_Switzerland'].partyId,
      country: 'Peru',
      region: 'Lima',
      gpsLat: -12.0464,
      gpsLng: -77.0428
    },
    {
      facilityName: 'Callao Export Port',
      facilityType: 'Port',
      ownerPartyId: createdParties['Transporter_Switzerland'].partyId,
      country: 'Peru',
      region: 'Callao',
      gpsLat: -12.0432,
      gpsLng: -77.1278
    },
    {
      facilityName: 'Zurich Airport Cargo',
      facilityType: 'Warehouse',
      ownerPartyId: createdParties['Transporter_Switzerland'].partyId,
      country: 'Switzerland',
      region: 'Zurich',
      gpsLat: 47.4647,
      gpsLng: 8.5492
    },
    {
      facilityName: 'Valcambi Processing Plant',
      facilityType: 'Refinery',
      ownerPartyId: createdParties['Refinery_Switzerland'].partyId,
      country: 'Switzerland',
      region: 'Ticino',
      gpsLat: 45.8706,
      gpsLng: 8.9711
    },
    {
      facilityName: 'Antioquia Mine Complex',
      facilityType: 'Mine',
      ownerPartyId: createdParties['MineOperator_Colombia'].partyId,
      country: 'Colombia',
      region: 'Antioquia',
      gpsLat: 6.2442,
      gpsLng: -75.5812
    }
  ];

  facilities.forEach(f => {
    const facility = provenanceService.registerFacility(f);
    console.log(`  Facility: ${facility.facilityName}`);
  });

  console.log('Test data seeded successfully!');
}

// ============ START SERVER ============

const PORT = process.env.PORT || 3000;

export async function startServer() {
  // Connect to MongoDB if using MongoDB
  if (process.env.DB_TYPE === 'mongodb') {
    console.log('Connecting to MongoDB...');
    const mongoDb = (await import('./services/mongodb-database.js')).default;
    const result = await mongoDb.connect(process.env.MONGODB_URI);
    if (result.success) {
      console.log('MongoDB connected successfully');
      const stats = await mongoDb.getStats();
      console.log('Database stats:', stats);
    } else {
      console.error('MongoDB connection failed:', result.error);
      console.log('Falling back to file-based database');
      process.env.DB_TYPE = 'file';
    }
  }

  // Auto-connect to blockchain if private key is available
  if (process.env.PRIVATE_KEY) {
    console.log('Connecting to blockchain...');
    const result = await anchoringService.connect(process.env.PRIVATE_KEY);
    if (result.success) {
      console.log(`Connected with wallet: ${result.address}`);
    } else {
      console.log(`Blockchain connection failed: ${result.error}`);
    }
  }

  // Seed test data
  seedTestData();
  
  app.listen(PORT, () => {
    console.log(`Gold Provenance API running on http://localhost:${PORT}`);
    console.log(`Mode: ${anchoringService.isSimulated() ? 'SIMULATION' : 'LIVE BLOCKCHAIN'}`);
    console.log(`Database: ${process.env.DB_TYPE || 'file'}`);
  });
}

// Auto-start when run directly
startServer();

export default app;
