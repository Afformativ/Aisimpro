# Gold Provenance & Chain-of-Custody Prototype

A minimal viable prototype for tracking mined gold from origin to downstream buyers with **Polygon Amoy** blockchain-anchored tamper-evident records.

## Live Demo

- **Frontend:** [https://your-username.github.io/gold-provenance](https://your-username.github.io/gold-provenance)
- **API:** [https://gold-provenance-api.onrender.com](https://gold-provenance-api.onrender.com)

## Overview

This prototype implements a traceability system that can:

1. **Create batch records** at the mine origin
2. **Record custody/transfer events** through the supply chain
3. **Verify provenance** with tamper-evident hash anchors on Polygon Amoy
4. **Export data** for auditing and integration

All batches are **shared and visible to everyone** - create a batch and others can see it!

```
Physical Flow:
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│   Mine   │ →  │  Ship/   │ →  │  Buyer   │ →  │  Verify  │
│  Create  │    │ Transfer │    │ Receive  │    │  Chain   │
└──────────┘    └──────────┘    └──────────┘    └──────────┘

Digital Flow (per step):
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Enter   │ →  │  Hash &  │ →  │  Anchor  │ →  │  Save TX │
│  Data    │    │  Store   │    │  on L2   │    │  Hash    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

## Quick Start (Local Development)

```bash
# Install dependencies
npm install
cd ui && npm install && cd ..

# Start the API server
npm run api

# In another terminal, start the UI
cd ui && npm run dev
```

### Connect to Polygon Amoy (Live Mode)

```bash
# Set your private key in .env
PRIVATE_KEY=0x...
CONTRACT_ADDRESS=0xEAFdbD04C0Cecf8310ae68A26b479fE4d286db19
POLYGON_RPC=https://rpc-amoy.polygon.technology

# Start the API - it will auto-connect to blockchain
npm run api
```

**Testnet Faucet:** Get test MATIC on Amoy at https://faucet.polygon.technology/

## Deployment

### Deploy Backend to Render.com

1. Fork this repository
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repository
4. Render will automatically use the `render.yaml` configuration
5. Set the `PRIVATE_KEY` environment variable in Render dashboard

### Deploy Frontend to GitHub Pages

1. Enable GitHub Pages in repository settings
2. Set source to "GitHub Actions"
3. Add repository variable `API_URL` pointing to your Render backend
4. Push to `main` branch - GitHub Actions will deploy automatically

## Architecture

### Data Models

- **Party** - Supply chain participants (mine, transporter, buyer, auditor)
- **Facility** - Physical locations (mine site, warehouse, vault)
- **Batch/Lot** - Unit of tracked material with unique reference
- **Event** - Traceability events (create, ship, transfer, receive)
- **Document** - Off-chain documents with on-chain hash references
- **Credential** - Attestations and claims (future VC support)

### Services

- **PersistentDatabase** - File-based JSON storage (shared across all users)
- **Hashing** - SHA-256 with RFC 8785 canonical JSON
- **Anchoring** - EVM blockchain anchoring on Polygon Amoy
- **Provenance** - Core business logic for the traceability flow

### Smart Contract

The `EventLogger.sol` contract is deployed on **Polygon Amoy**:
- **Address:** `0xEAFdbD04C0Cecf8310ae68A26b479fE4d286db19`
- Stateless design (no on-chain storage)
- Event emission for immutable timestamps
- Indexed fields for efficient querying
- ~90% gas savings vs storage-based approaches
- zkEVM compatibility for enhanced security and lower costs

### Supported Networks

| Network | Chain ID | Use Case |
|---------|----------|----------|
| Polygon zkEVM Mainnet | 1101 | Production |
| Polygon zkEVM Cardona | 2442 | Testing (default) |
| Polygon Amoy | 80002 | Legacy testing |

## API Endpoints

### Parties
- `POST /api/parties` - Register a party
- `GET /api/parties` - List all parties
- `GET /api/parties/:id` - Get party details

### Facilities
- `POST /api/facilities` - Register a facility
- `GET /api/facilities` - List all facilities

### Documents
- `POST /api/documents` - Register a document
- `POST /api/documents/:id/verify` - Verify document hash

### Batches
- `POST /api/batches` - Create batch at mine
- `GET /api/batches` - List all batches
- `GET /api/batches/:id` - Get batch details
- `GET /api/batches/:id/chain-of-custody` - Full provenance view
- `GET /api/batches/:id/verify` - Verify all hashes
- `GET /api/batches/:id/export` - Export as JSON

### Events
- `POST /api/batches/:id/ship` - Record shipment
- `POST /api/batches/:id/transfer` - Record custody transfer
- `POST /api/batches/:id/receive` - Record receipt
- `POST /api/batches/:id/inspect` - Record inspection
- `POST /api/batches/:id/assay` - Record assay finalization
- `POST /api/batches/:id/dispute` - Flag dispute

## CLI Commands

```bash
# Network management (Polygon zkEVM)
node src/cli.js network:info           # Show current network
node src/cli.js network:list           # List available networks
node src/cli.js network:switch zkevm-mainnet  # Switch to mainnet
node src/cli.js network:connect        # Connect wallet (requires PRIVATE_KEY)

# Party management
node src/cli.js party:create -n "Company Name" -t MineOperator -c Peru
node src/cli.js party:list

# Facility management
node src/cli.js facility:create -n "Mine Site" -t Mine -o <partyId> -c Peru
node src/cli.js facility:list

# Batch creation
node src/cli.js batch:create -r "REF-001" -c "Gold Doré" -f <facilityId> -o <partyId> -w 25.5
node src/cli.js batch:list

# Events
node src/cli.js ship <batchId> -t <toPartyId> -f <toFacilityId>
node src/cli.js receive <batchId> -r <receiverPartyId> -f <facilityId>

# Verification
node src/cli.js verify <batchId>

# Export
node src/cli.js export <batchId>
```

## Demo Flow

Run `npm run demo` to see:

1. **Registration** - Create parties and facilities
2. **Documents** - Register and hash supporting documents
3. **Batch Creation** - Create a batch at the mine with provenance docs
4. **Shipment** - Record shipment with waybill
5. **Transfer** - Hand off custody to buyer
6. **Receipt** - Buyer acknowledges receipt
7. **Verification** - Full chain of custody verification
8. **Export** - JSON export of complete batch package

## Pilot Assumptions

- Single mine, single commodity (gold doré/concentrate)
- No batch splitting/merging (treated as atomic unit)
- Documents stored off-chain (hashes on-chain)
- Simulation mode for blockchain (testnet ready)
- Application-level permissioning (roles/allowlists)

## Future-Proofing

- UNTP-aligned event/credential patterns
- Verifiable Credential placeholder for attestations
- Hybrid architecture (permissioned ledger compatible)
- Extensible data model for splitting/aggregation

## Project Structure

```
gold-provenance/
├── contracts/
│   └── EventLogger.sol      # Solidity smart contract
├── src/
│   ├── models/
│   │   └── index.js         # Data models and enums
│   ├── services/
│   │   ├── database.js      # In-memory database
│   │   ├── hashing.js       # Cryptographic hashing
│   │   ├── anchoring.js     # Blockchain anchoring
│   │   └── provenance.js    # Core business logic
│   ├── api.js               # REST API server
│   ├── cli.js               # Command-line interface
│   ├── demo.js              # Interactive demonstration
│   └── index.js             # Entry point
└── package.json
```

## Success Criteria

✅ Create a batch with provenance documents  
✅ Log at least two custody events  
✅ Verify timeline and document integrity  
✅ Complete flow in under 2 minutes  
✅ Export batch package as JSON  

## License

MIT
