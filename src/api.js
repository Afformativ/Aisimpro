/**
 * Gold Provenance API Server
 * REST API for the traceability prototype
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import provenanceService from './services/provenance.js';
import anchoringService from './services/anchoring.js';
import traceabilityContract from './services/traceability-contract.js';
import { PartyType, FacilityType, DocumentType } from './models/index.js';
import untpRoutes from './routes/untp.js';
import { buildDIDDocument } from './services/untp-credentials.js';
import { getActiveUntpBaseUri, getActiveUntpDid } from './services/untp-public-url.js';

// Auth imports
import authRoutes from './auth/routes.js';
import adminRoutes from './auth/admin-routes.js';
import { bootstrap } from './auth/bootstrap.js';
import { requireAuth, requireAnyRole, enforcePasswordChange } from './auth/guards.js';

const app = express();
app.set('trust proxy', true);

// ============ SECURITY MIDDLEWARE ============

// Helmet — security headers
app.use(helmet({ contentSecurityPolicy: false })); // CSP off for dev simplicity

// CORS — configurable origins
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const AUTH_RATE_LIMIT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
]);

// Global rate limiter (2500 req / 15 min per IP by default)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '2500', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => AUTH_RATE_LIMIT_PATHS.has((req.originalUrl || '').split('?')[0]),
});
app.use('/api/', globalLimiter);

// Auth rate limiter (50 attempts / 15 min per IP by default)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '50', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ============ HEALTH CHECK ============

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    simulationMode: anchoringService.isSimulated(),
    merkleAnchoringEnabled: process.env.MERKLE_ANCHORING_ENABLED === 'true',
    authEnabled: process.env.AUTH_ENABLED !== 'false',
  });
});

// ============ UNTP — DID document (server-level, public) ============
// Served at /.well-known/did.json so that did:web:yourdomain.com resolves.
// No auth required — DID documents are public by spec.

app.get('/.well-known/did.json', (req, res) => {
  const did = getActiveUntpDid(req);
  const doc = buildDIDDocument(did, {
    name: process.env.UNTP_ISSUER_NAME,
    baseUri: getActiveUntpBaseUri(req),
  });
  res.set('Content-Type', 'application/did+ld+json');
  res.json(doc);
});

// ============ AUTH & ADMIN ROUTES (public + protected inside) ============

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// ============ UNTP — public read-only endpoints (no auth required) ============
// Credential and resolve endpoints are public by design — anyone can verify a VC.
// Entity URI routes (/ore/:id, /bar/:id etc.) mounted at root so the base URI
// links resolve directly (e.g. http://localhost:3000/ore/0x1234...).
// Write endpoints (/api/untp/*) are protected by the auth guard below.
app.use('/', untpRoutes);
app.use('/api', untpRoutes);

// ============ PROTECTED API ROUTES ============
// All routes below require valid JWT (unless AUTH_ENABLED=false)
app.use('/api', requireAuth, enforcePasswordChange);

// ============ PARTIES ============

app.post('/api/parties', (req, res) => {
  try {
    const party = provenanceService.registerParty(req.body);
    res.status(201).json(party);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/parties', async (req, res) => {
  const parties = await provenanceService.getAllParties();
  res.json(parties);
});

app.get('/api/parties/:partyId', async (req, res) => {
  const party = await provenanceService.getParty(req.params.partyId);
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

app.get('/api/facilities', async (req, res) => {
  const facilities = await provenanceService.getAllFacilities();
  res.json(facilities);
});

app.get('/api/facilities/:facilityId', async (req, res) => {
  const facility = await provenanceService.getFacility(req.params.facilityId);
  if (!facility) {
    return res.status(404).json({ error: 'Facility not found' });
  }
  res.json(facility);
});

// ============ DOCUMENTS ============

app.get('/api/documents', async (req, res) => {
  const documents = await provenanceService.getAllDocuments();
  res.json(documents);
});

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

app.get('/api/batches', async (req, res) => {
  const batches = await provenanceService.getAllBatches();
  res.json(batches);
});

app.get('/api/batches/:batchId', async (req, res) => {
  const batch = await provenanceService.getBatch(req.params.batchId);
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

app.get('/api/batches/:batchId/chain-of-custody', async (req, res) => {
  const chain = await provenanceService.getChainOfCustody(req.params.batchId);
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

app.get('/api/batches/:batchId/export', async (req, res) => {
  const pkg = await provenanceService.exportBatchPackage(req.params.batchId);
  if (!pkg) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  res.json(pkg);
});

// ============ AUDIT LOG ============

app.get('/api/audit', async (req, res) => {
  const entityId = req.query.entityId || null;
  const log = await provenanceService.getAuditLog(entityId);
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

// ============ MERKLE ANCHORING ENDPOINTS ============
// All guarded by MERKLE_ANCHORING_ENABLED feature flag.

/**
 * GET /api/certificates/:id/proof
 * Returns the full verification package for a certificate (event).
 */
app.get('/api/certificates/:id/proof', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  try {
    const pkg = await provenanceService.exportMerkleProof(req.params.id);
    if (!pkg) {
      return res.status(404).json({ error: 'Certificate or proof not found' });
    }
    res.json(pkg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/verify
 * Standalone verification – accepts a certificate payload + proof object.
 */
app.post('/api/verify', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  try {
    const {
      certificateId,
      certificatePayload,
      docHashList,
      schemaVersion,
      issuerKeyId,
      proof,
      merkleRoot,
    } = req.body;

    // If proof + merkleRoot supplied, use standalone (no DB required)
    if (proof && merkleRoot) {
      const merkle = await import('./services/merkle/index.js');
      const result = merkle.verifyStandalone({
        certificatePayload,
        certificateId,
        docHashList,
        schemaVersion,
        issuerKeyId,
        proof,
        merkleRoot,
      });
      return res.json(result);
    }

    // Otherwise do full DB-backed verification
    const result = await provenanceService.verifyMerkleCertificate({
      certificateId,
      certificatePayload,
      docHashList,
      schemaVersion,
      issuerKeyId,
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/merkle/batches/:batchId/close
 * Close a Merkle anchor batch (compute root + generate proofs).
 */
app.post('/api/merkle/batches/:batchId/close', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  try {
    const result = await provenanceService.closeMerkleBatch(req.params.batchId, req.body.userId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/merkle/batches/close-by-scope
 * Close all open batches for a given scope.
 */
app.post('/api/merkle/batches/close-by-scope', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  try {
    const { scopeId, userId } = req.body;
    if (!scopeId) return res.status(400).json({ error: 'scopeId required' });
    const results = await provenanceService.closeMerkleBatchesByScope(scopeId, userId);
    res.json(results);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/merkle/anchor
 * Trigger anchoring of all closed-but-unanchored batches.
 */
app.post('/api/merkle/anchor', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  try {
    const results = await provenanceService.anchorMerkleBatches();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/merkle/batches
 * List all Merkle anchor batches.
 */
app.get('/api/merkle/batches', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  const batches = await provenanceService.getMerkleAnchorBatches();
  res.json(batches);
});

/**
 * GET /api/merkle/metrics
 * Observability metrics for Merkle anchoring.
 */
app.get('/api/merkle/metrics', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  const metrics = await provenanceService.getMerkleMetrics();
  res.json(metrics);
});

/**
 * GET /api/merkle/audit
 * Merkle-specific audit log.
 */
app.get('/api/merkle/audit', async (req, res) => {
  if (process.env.MERKLE_ANCHORING_ENABLED !== 'true') {
    return res.status(404).json({ error: 'Merkle anchoring not enabled' });
  }
  const entityId = req.query.entityId || null;
  const log = await provenanceService.getMerkleAuditLog(entityId);
  res.json(log);
});

// ============ ON-CHAIN TRACEABILITY (GoldSilverTraceability.sol) ============

/**
 * GET /api/traceability/status
 * Contract connection status + counts.
 */
app.get('/api/traceability/status', (req, res) => {
  res.json(traceabilityContract.status());
});

/**
 * GET /api/traceability/gas
 * Real-time gas price, wallet balance, and safety caps.
 */
app.get('/api/traceability/gas', async (req, res) => {
  try {
    res.json(await traceabilityContract.getGasInfo());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/traceability/ore
 * Register raw ore extracted at the mine.
 * Requires: MINER or ADMIN role
 */
app.post('/api/traceability/ore', requireAuth, requireAnyRole('MINER', 'ADMIN'), async (req, res) => {
  try {
    const result = await traceabilityContract.registerOre(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/traceability/refine
 * Smelt one or more ores into a refined bar.
 * Requires: REFINER or ADMIN role
 */
app.post('/api/traceability/refine', requireAuth, requireAnyRole('REFINER', 'ADMIN'), async (req, res) => {
  try {
    const result = await traceabilityContract.refine(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/traceability/certify
 * Certify a refined bar into a market-ready product.
 * Requires: ASSAYER or ADMIN role
 */
app.post('/api/traceability/certify', requireAuth, requireAnyRole('ASSAYER', 'ADMIN'), async (req, res) => {
  try {
    const result = await traceabilityContract.certify(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/traceability/transfer-custody
 * Transfer custody of an ore, bar, or product to another wallet.
 * Requires: DEALER or ADMIN role
 */
app.post('/api/traceability/transfer-custody', requireAuth, requireAnyRole('DEALER', 'ADMIN'), async (req, res) => {
  try {
    const { recordType, id, to } = req.body;
    if (!recordType || !id || !to) {
      return res.status(400).json({ error: 'recordType, id, and to are required' });
    }
    const result = await traceabilityContract.transferCustody(recordType, id, to);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/traceability/ore/:id
 */
app.get('/api/traceability/ore/:id', async (req, res) => {
  try {
    const ore = await traceabilityContract.getOre(req.params.id);
    res.json(ore);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/traceability/bar/:id
 */
app.get('/api/traceability/bar/:id', async (req, res) => {
  try {
    const bar = await traceabilityContract.getBar(req.params.id);
    res.json(bar);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/traceability/product/:id
 */
app.get('/api/traceability/product/:id', async (req, res) => {
  try {
    const product = await traceabilityContract.getProduct(req.params.id);
    res.json(product);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * GET /api/traceability/ores   – list all ores (simulation)
 * GET /api/traceability/bars   – list all bars (simulation)
 * GET /api/traceability/products – list all products (simulation)
 * GET /api/traceability/events – chronological event list
 */
app.get('/api/traceability/ores', (req, res) => res.json(traceabilityContract.listOres()));
app.get('/api/traceability/bars', (req, res) => res.json(traceabilityContract.listBars()));
app.get('/api/traceability/products', (req, res) => res.json(traceabilityContract.listProducts()));
app.get('/api/traceability/events', (req, res) => res.json(traceabilityContract.listEvents()));

// ============ DOCUMENT ROOTS (on-chain Merkle anchoring) ============

/**
 * POST /api/traceability/:recordType/:id/document-root
 * Set the Merkle document root for an ore/bar/product.
 * Body: { root: bytes32, manifestCID?: string }
 */
app.post('/api/traceability/:recordType/:id/document-root', requireAnyRole('MINER', 'REFINER', 'ASSAYER', 'ADMIN'), async (req, res) => {
  try {
    const { recordType, id } = req.params;
    const { root, manifestCID } = req.body;
    if (!root) return res.status(400).json({ error: 'root is required (bytes32 Merkle root)' });
    const result = await traceabilityContract.setDocumentRoot(recordType, id, root, manifestCID || '');
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/traceability/:recordType/:id/document-root
 * Get the stored document root + manifest CID.
 */
app.get('/api/traceability/:recordType/:id/document-root', async (req, res) => {
  try {
    const { recordType, id } = req.params;
    const result = await traceabilityContract.getDocumentRoot(recordType, id);
    res.json(result);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

/**
 * POST /api/traceability/:recordType/:id/verify-document
 * Verify a document Merkle proof on-chain.
 * Body: { proof: bytes32[], leaf: bytes32 }
 */
app.post('/api/traceability/:recordType/:id/verify-document', async (req, res) => {
  try {
    const { recordType, id } = req.params;
    const { proof, leaf } = req.body;
    if (!proof || !leaf) return res.status(400).json({ error: 'proof and leaf are required' });
    const valid = await traceabilityContract.verifyDocument(recordType, id, proof, leaf);
    res.json({ valid, recordType, recordId: id, leaf });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ============ SEED DATA ============

async function seedTestData() {
  // Check if data already exists
  const existingParties = await provenanceService.getAllParties();
  if (existingParties.length > 0) {
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
  for (const p of parties) {
    const party = await provenanceService.registerParty(p);
    createdParties[p.partyType + '_' + p.country] = party;
    console.log(`  Party: ${party.legalName}`);
  }

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

  for (const f of facilities) {
    const facility = await provenanceService.registerFacility(f);
    console.log(`  Facility: ${facility.facilityName}`);
  }

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

  // Connect traceability smart contract
  await traceabilityContract.connect();

  // Seed test data
  await seedTestData();

  // Auth bootstrap — seed roles & create superadmin if configured
  if (process.env.AUTH_ENABLED !== 'false') {
    try {
      await bootstrap();
      console.log('Auth system bootstrapped');
    } catch (err) {
      console.error('Auth bootstrap error:', err.message);
    }
  }
  
  app.listen(PORT, () => {
    console.log(`Gold Provenance API running on http://localhost:${PORT}`);
    console.log(`Mode: ${anchoringService.isSimulated() ? 'SIMULATION' : 'LIVE BLOCKCHAIN'}`);
    console.log(`Database: ${process.env.DB_TYPE || 'file'}`);
    console.log(`Auth: ${process.env.AUTH_ENABLED !== 'false' ? 'ENABLED' : 'DISABLED'}`);
  });
}

// Auto-start when run directly
startServer();

export default app;
