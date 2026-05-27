/**
 * UNTP Routes
 *
 * Implements the UNTP Discover-Resolve-Verify (D-R-V) workflow:
 *
 *   Discovery  — RFC 9264 Linksets
 *     GET /api/resolve/:type/:id
 *
 *   Credentials  — W3C VC JSON-LD
 *     GET /api/credentials/dte/ore/:id
 *     GET /api/credentials/dte/bar/:id
 *     GET /api/credentials/dpp/product/:id
 *     GET /api/credentials/dcc/product/:id
 *     GET /api/credentials/dfr/facility/:id
 *     GET /api/credentials/status/bitstring-status-list/:statusPurpose
 *
 *   DID Documents
 *     GET /.well-known/did.json            (server-level, mounted by api.js)
 *     GET /api/parties/:partyId/did.json   (party-level)
 *
  *   On-chain UNTP writes (require auth)
  *     POST /api/untp/party-did
  *     POST /api/untp/conformity-credential
 *     POST /api/untp/credential-status
 */

import { Router } from 'express';
import {
  buildDTE_OreExtraction,
  buildDTE_BarRefinement,
  buildDPP_Product,
  buildDCC_Assay,
  buildDFR_Facility,
  buildDIDDocument,
  buildStatusListCredential,
} from '../services/untp-credentials.js';
import traceabilityContract from '../services/traceability-contract.js';
import provenanceService from '../services/provenance.js';
import { requireAuth, requireAnyRole } from '../auth/guards.js';
import { setCredentialRevocation, getCredentialStatusEntry } from '../services/untp-status-list.js';

const router = Router();

// ── Shared helpers ────────────────────────────────────────────────────────────

function base() {
  return (process.env.UNTP_BASE_URI || 'http://localhost:3000').replace(/\/$/, '');
}

function serverDID() {
  return process.env.UNTP_DID || 'did:web:localhost';
}

/** RFC 9264 linkset entry helper. */
function link(href, rel, type = 'application/vc+ld+json') {
  return { href, rel, type };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity URI resolution — GET /ore/:id, /bar/:id, /product/:id, /facility/:id
//
// These are the URLs embedded as credentialSubject.id in every credential.
// When a verifier follows the link they get the RFC 9264 linkset so they can
// then choose which credential type to fetch (DTE, DPP, DCC, DFR).
// ─────────────────────────────────────────────────────────────────────────────

router.get('/ore/:id',      (req, res) => res.redirect(302, `/api/resolve/ore/${req.params.id}`));
router.get('/bar/:id',      (req, res) => res.redirect(302, `/api/resolve/bar/${req.params.id}`));
router.get('/product/:id',  (req, res) => res.redirect(302, `/api/resolve/product/${req.params.id}`));
router.get('/facility/:id', (req, res) => res.redirect(302, `/api/resolve/facility/${req.params.id}`));

// ─────────────────────────────────────────────────────────────────────────────
// Identity Resolver — RFC 9264 Linksets
// GET /api/resolve/:type/:id
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/resolve/ore/:id
 * Returns an RFC 9264 linkset with links to the DTE and (if product exists) DPP.
 */
router.get('/resolve/ore/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const anchor = `${base()}/api/resolve/ore/${id}`;

    const linkset = [{
      anchor,
      // DTE — extraction event
      'https://vocabulary.uncefact.org/DigitalTraceabilityEvent': [
        link(`${base()}/api/credentials/dte/ore/${id}`, 'dte'),
      ],
    }];

    res.set('Content-Type', 'application/linkset+json');
    res.json({ linkset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/resolve/bar/:id
 * Returns linkset with DTE (refinement transformation) link.
 */
router.get('/resolve/bar/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const anchor = `${base()}/api/resolve/bar/${id}`;

    const linkset = [{
      anchor,
      'https://vocabulary.uncefact.org/DigitalTraceabilityEvent': [
        link(`${base()}/api/credentials/dte/bar/${id}`, 'dte'),
      ],
    }];

    res.set('Content-Type', 'application/linkset+json');
    res.json({ linkset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/resolve/product/:id
 * Returns linkset with DPP and DCC links.
 */
router.get('/resolve/product/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const anchor = `${base()}/api/resolve/product/${id}`;

    const linkset = [{
      anchor,
      'https://vocabulary.uncefact.org/DigitalProductPassport': [
        link(`${base()}/api/credentials/dpp/product/${id}`, 'dpp'),
      ],
      'https://vocabulary.uncefact.org/DigitalConformityCredential': [
        link(`${base()}/api/credentials/dcc/product/${id}`, 'dcc'),
      ],
    }];

    res.set('Content-Type', 'application/linkset+json');
    res.json({ linkset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/resolve/facility/:id
 * Returns linkset with DFR link.
 */
router.get('/resolve/facility/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const anchor = `${base()}/api/resolve/facility/${id}`;

    const linkset = [{
      anchor,
      'https://vocabulary.uncefact.org/DigitalFacilityRecord': [
        link(`${base()}/api/credentials/dfr/facility/${id}`, 'dfr'),
      ],
    }];

    res.set('Content-Type', 'application/linkset+json');
    res.json({ linkset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Credential endpoints — W3C VC JSON-LD
// ─────────────────────────────────────────────────────────────────────────────

const VC_CONTENT_TYPE = 'application/vc+ld+json';

/** GET /api/credentials/dte/ore/:id */
router.get('/credentials/dte/ore/:id', async (req, res) => {
  try {
    const vc = await buildDTE_OreExtraction(req.params.id);
    res.set('Content-Type', VC_CONTENT_TYPE);
    res.json(vc);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** GET /api/credentials/dte/bar/:id */
router.get('/credentials/dte/bar/:id', async (req, res) => {
  try {
    const vc = await buildDTE_BarRefinement(req.params.id);
    res.set('Content-Type', VC_CONTENT_TYPE);
    res.json(vc);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** GET /api/credentials/dpp/product/:id */
router.get('/credentials/dpp/product/:id', async (req, res) => {
  try {
    const vc = await buildDPP_Product(req.params.id);
    res.set('Content-Type', VC_CONTENT_TYPE);
    res.json(vc);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** GET /api/credentials/dcc/product/:id */
router.get('/credentials/dcc/product/:id', async (req, res) => {
  try {
    const vc = await buildDCC_Assay(req.params.id);
    res.set('Content-Type', VC_CONTENT_TYPE);
    res.json(vc);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** GET /api/credentials/dfr/facility/:id */
router.get('/credentials/dfr/facility/:id', async (req, res) => {
  try {
    const facility = await provenanceService.getFacility(req.params.id);
    if (!facility) return res.status(404).json({ error: 'Facility not found' });

    // Enrich with owner party name if available
    if (facility.ownerPartyId) {
      const party = await provenanceService.getParty(facility.ownerPartyId);
      if (party) facility.ownerPartyName = party.legalName;
    }

    const vc = buildDFR_Facility(facility);
    res.set('Content-Type', VC_CONTENT_TYPE);
    res.json(vc);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: err.message });
  }
});

/** GET /api/credentials/status/bitstring-status-list/:statusPurpose */
router.get('/credentials/status/bitstring-status-list/:statusPurpose', async (req, res) => {
  try {
    const vc = buildStatusListCredential(req.params.statusPurpose || 'revocation');
    res.set('Content-Type', VC_CONTENT_TYPE);
    res.json(vc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DID Documents — party-level
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/parties/:partyId/did.json */
router.get('/parties/:partyId/did.json', async (req, res) => {
  try {
    const party = await provenanceService.getParty(req.params.partyId);
    if (!party) return res.status(404).json({ error: 'Party not found' });

    const did = `${serverDID()}:parties:${req.params.partyId}`;
    const doc = buildDIDDocument(did, { name: party.legalName });

    res.set('Content-Type', 'application/did+ld+json');
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// On-chain UNTP writes (authenticated)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/untp/party-did
 * Register the calling wallet's did:web identity on-chain.
 * Body: { did: "did:web:example.com:parties:miner-1" }
 */
router.post('/untp/party-did', requireAuth, requireAnyRole('MINER', 'REFINER', 'ASSAYER', 'DEALER', 'ADMIN'), async (req, res) => {
  try {
    const { did } = req.body;
    if (!did || !did.startsWith('did:')) {
      return res.status(400).json({ error: 'did must be a valid W3C DID string (e.g. did:web:...)' });
    }
    const result = await traceabilityContract.registerPartyDID(did);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/untp/conformity-credential
 * Record the URI of a signed DCC on a CertifiedProduct.
 * Body: { productId: "0x...", uri: "https://..." }
 */
router.post('/untp/conformity-credential', requireAuth, requireAnyRole('ASSAYER', 'ADMIN'), async (req, res) => {
  try {
    const { productId, uri } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!uri)       return res.status(400).json({ error: 'uri is required' });
    const result = await traceabilityContract.setConformityCredential(productId, uri);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/untp/base-uri
 * Set the on-chain base URI for UNTP entity resolution.
 * Body: { uri: "https://goldprovenance.example.com/" }
 */
router.post('/untp/base-uri', requireAuth, requireAnyRole('ADMIN'), async (req, res) => {
  try {
    const { uri } = req.body;
    if (!uri) return res.status(400).json({ error: 'uri is required' });
    const result = await traceabilityContract.setBaseURI(uri);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/untp/credential-status
 * Toggle revocation state for a previously issued credential.
 * Body: { credentialId: "https://...", revoked: true|false }
 */
router.post('/untp/credential-status', requireAuth, requireAnyRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const { credentialId, revoked = true } = req.body;
    if (!credentialId) return res.status(400).json({ error: 'credentialId is required' });
    const result = setCredentialRevocation(credentialId, Boolean(revoked));
    res.status(200).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/untp/credential-status
 * Query the current revocation record for a credential.
 * Query: ?credentialId=https://...
 */
router.get('/untp/credential-status', requireAuth, requireAnyRole('ADMIN', 'SUPERADMIN'), async (req, res) => {
  try {
    const { credentialId } = req.query;
    if (!credentialId) return res.status(400).json({ error: 'credentialId is required' });
    const status = getCredentialStatusEntry(String(credentialId));
    if (!status) return res.status(404).json({ error: 'Credential status not found' });
    res.json(status);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
