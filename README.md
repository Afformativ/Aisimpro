
# Gold Provenance & Chain‑of‑Custody Prototype


A small prototype for tracking mined gold through custody events and providing tamper‑evident proof via cryptographic hashing and on‑chain anchors.

## Live Demo

- **Frontend:** https://afformativ.github.io/Aisimpro 

## What this application does

- Records batches (lots) of material created at origin.
- Stores events that describe custody, shipment, receipt, inspection, assay, and disputes.
- Computes cryptographic hashes for batches, events and documents to provide an immutable fingerprint.
- Anchors selected hashes to an EVM chain (Polygon networks) as a public, tamper‑evident timestamp.
- Provides a UI for creating, browsing and verifying provenance, plus an API and CLI for automation.

## UI Pages (what you'll find in the frontend)

- **Dashboard** — Overview of recent activity and summary metrics.
- **Batches** — List of tracked batches; create and search batches.
- **Batch Detail** — Full chain‑of‑custody for a single batch, event timeline, documents and verification status.
- **Documents** — Register and view off‑chain supporting documents and their hashes.
- **Facilities** — Manage and view physical locations (mines, warehouses, ports).
- **Parties** — Manage participants (mine operator, transporter, buyer, auditor).
- **Audit** — Tools and views for auditors to verify timelines and hashes.
- **Network** — Configure which blockchain network to use for anchoring and view anchor status.
- **Verify** — Paste or upload a batch/package and run integrity checks against stored and on‑chain anchors.

These pages are implemented under ui/src/pages/ in the repository.

## Important concepts (glossary)

- Batch hash

	The batch hash is a cryptographic fingerprint (SHA‑256) computed over the canonical JSON representation of the batch record and its core metadata (e.g., reference, weight, origin, linked document hashes). The batch hash uniquely identifies the batch contents — if any field or document changes, the hash changes. Use the batch hash to verify that a downloaded or exported batch matches the stored record.

- Event hash

	Each custody or traceability action (create, ship, transfer, receive, inspect, assay, dispute) is recorded as an event. An event hash is computed from the event's canonical JSON (type, timestamp, actor, related party/facility IDs, and references to the affected batch/document hashes). Event hashes provide an immutable fingerprint for each step in the chain‑of‑custody and can be independently verified.

- Blockchain anchors

	Anchoring means publishing a compact reference (usually a hash) to a public blockchain transaction or logged event. This project uses an EventLogger smart contract to emit an on‑chain event containing the anchored hash (no raw data is stored on chain). Anchors provide a public timestamp and tamper‑evidence: because the anchor is included in a blockchain transaction, it becomes hard to repudiate or alter the fact that a particular hash existed at a given time. Anchors link off‑chain data (batch/event hashes) to an auditable on‑chain record.

## Where hashing and anchoring happen in the code

- Hashing and canonicalization are implemented in `src/services/hashing.js`.
- Anchoring and blockchain interactions are implemented in `src/services/anchoring.js` and by the `contracts/EventLogger.sol` smart contract.
- The provenance business logic that ties hashes, events and anchors together is in `src/services/provenance.js`.

## Quick start (local development)

```bash
# Install dependencies
npm install
cd ui && npm install && cd ..

# Start the API server (default: simulation/testnet mode)
npm run api

# In another terminal, start the UI
cd ui && npm run dev
```

## Example verification flow

1. Create a batch in the UI or via `POST /api/batches`.
2. Add events (ship, transfer, receive) to build the timeline.
3. The API computes and stores batch and event hashes (SHA‑256).
4. Optionally call the anchoring endpoint to publish a hash to the configured blockchain; the contract emits an event containing the anchor.
5. Use the `Verify` page or `GET /api/batches/:id/verify` to compare local hashes with stored values and (if anchored) confirm the on‑chain anchor exists.

## API & CLI highlights

The repository exposes a REST API (`src/api.js`) and a CLI (`src/cli.js`). Important endpoints include:

- `POST /api/batches` — create a batch
- `GET /api/batches/:id/chain-of-custody` — get full timeline and hashes
- `POST /api/batches/:id/ship` / `transfer` / `receive` — record events
- `POST /api/documents` — register document and compute its hash

CLI: helpful scripts for demo, batch creation and verification are available via `node src/cli.js` (see `README` sections and `src/cli.js` for commands).

## Where to look next in the code

- API server: `src/api.js`
- Hashing: `src/services/hashing.js`
- Anchoring: `src/services/anchoring.js`
- Smart contract: `contracts/EventLogger.sol`
- Frontend pages: `ui/src/pages/`

## Notes and limitations

- Documents and full payloads are kept off‑chain; only hashes are anchored on‑chain.
- This prototype assumes batches are treated as atomic units (no split/merge flows).
- Anchoring produces a public transaction (testnet/mainnet costs apply).
