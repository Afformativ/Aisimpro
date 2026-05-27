# Gold & Silver Mining Provenance – On-Chain Traceability

> Deterministic on-chain hash IDs for mined gold & silver,
> off-chain IPFS certificate templates, Merkle-root batched anchoring.
> Inspired by Patel et al., *Scientific Reports* (2025).

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        ON-CHAIN (Solidity)                       │
│                                                                  │
│  GoldSilverTraceability.sol                                      │
│  ┌─────────┐   ┌────────────┐   ┌──────────────────┐           │
│  │  RawOre  │ → │ RefinedBar │ → │ CertifiedProduct │           │
│  │ (Au/Ag)  │   │ (bullion)  │   │ (hallmarked)     │           │
│  └─────────┘   └────────────┘   └──────────────────┘           │
│                                                                  │
│  • AccessControl roles (7 roles)                                 │
│  • Metal enum: GOLD / SILVER                                     │
│  • Deterministic keccak256 IDs                                   │
│  • Custody transfer with event logs                              │
│  • IPFS template CIDs per record type                            │
│                                                                  │
│  EventLogger.sol (existing)                                      │
│  • Merkle root anchoring for batched verification                │
│  • Root chaining for timeline integrity                          │
└──────────────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
┌─────────────────┐         ┌──────────────────────┐
│  Off-chain IPFS  │         │ Merkle Tree Service  │
│  Certificate     │         │ (src/services/merkle)│
│  Templates       │         │                      │
│  ─────────────── │         │ • Batch supply-chain │
│  Fetch by CID →  │         │   events into leaves │
│  populate with   │         │ • Build tree + proofs│
│  on-chain fields │         │ • Anchor root on-chain│
└─────────────────┘         └──────────────────────┘
```

---

## Supply-Chain Stages

| Stage | Entity | Who | What |
|---|---|---|---|
| **1. Extraction** | `RawOre` | Miner | Ore extracted at the mine (gold or silver, with mineral type, grade) |
| **2. Smelting / Refining** | `RefinedBar` | Refiner | One or more ore batches smelted into a bullion bar (with serial number, fineness) |
| **3. Assay & Certification** | `CertifiedProduct` | Assayer | Bar assayed, hallmarked, assigned a product type (bar / coin / ingot) |
| **4. Distribution** | Custody transfer | Dealer | Certified product transferred to dealer for market |

---

## How IDs Are Computed

Every record ID is a **deterministic `keccak256(abi.encode(…))`** computed on-chain.
The field ordering is explicit and fixed per entity type:

| Entity | `keccak256(abi.encode(…))` fields (in order) |
|---|---|
| **RawOre** | `metal`, `mineId`, `originCountry`, `mineralType`, `extractedAt`, `weightGrams`, `estimatedGrade`, `msg.sender` |
| **RefinedBar** | `oreIds[]`, `metal`, `refineryId`, `refinedAt`, `outputWeightGrams`, `finenessPPT`, `barSerialNumber`, `msg.sender` |
| **CertifiedProduct** | `inputBarId`, `metal`, `assayerId`, `certifiedAt`, `weightGrams`, `finenessPPT`, `hallmark`, `sku`, `productType`, `msg.sender` |

Including `msg.sender` makes hashes unique per creator even if all other fields match.
Any auditor can recompute the hash client-side and compare it to the on-chain record via
the `verify*()` view functions.

---

## On-Chain vs Off-Chain (IPFS)

| Data | Location | Rationale |
|---|---|---|
| Struct fields (IDs, metal type, weights, fineness, timestamps, custodian addresses) | **On-chain** | Immutable, auditable, hash-committed |
| Custody transfer history | **On-chain events** | Tamper-proof log |
| Merkle root of batched events | **On-chain** (`EventLogger.anchorRoot`) | Gas-efficient batched anchoring |
| Certificate **templates** (LBMA cert, assay report layout) | **IPFS** | Large files, content-addressed, immutable once pinned |
| Template CID per record type | **On-chain** (`templateCID` mapping) | Links on-chain record type to IPFS template |

### IPFS Flow

1. Design a certificate template (e.g., LBMA Good Delivery certificate HTML with
   `{{mineId}}`, `{{finenessPPT}}`, `{{hallmark}}` placeholders).
2. Upload to IPFS → receive CID (e.g., `QmRefinedBarCertTemplate_v1`).
3. Admin calls `setTemplateCID(RecordType.REFINED_BAR, "Qm…")`.
4. To render a certificate:
   - Read the record from chain: `getRefinedBar(id)`.
   - Fetch template from IPFS: `ipfs.cat(getTemplateCID(REFINED_BAR))`.
   - Populate placeholders with on-chain values → render PDF / print.

---

## QR Code Format

A scannable QR encodes a lookup string:

```
chainId:contractAddress:recordType:idHex
```

**Example (gold bar):**

```
80002:0xAbC123…DeF:REFINED_BAR:0x9f3a…c7e1
```

### Parsing

| Segment | Meaning |
|---|---|
| `chainId` | EVM chain (e.g., `80002` = Polygon Amoy, `31337` = Hardhat local) |
| `contractAddress` | Deployed `GoldSilverTraceability` address |
| `recordType` | `RAW_ORE`, `REFINED_BAR`, or `CERTIFIED_PRODUCT` |
| `idHex` | `bytes32` ID (the keccak256 hash) |

A verifier app scans the QR, connects to the correct RPC, calls the appropriate
`get*()` / `verify*()` method, and optionally renders a certificate from the IPFS template.

---

## Roles & Permissions

| Role | Can do |
|---|---|
| `SUPERADMIN` | Grant / revoke all roles |
| `ADMIN` | Set IPFS template CIDs; can also register ore, refine, certify |
| `MINER` | `registerOre()` — register extracted gold/silver ore |
| `REFINER` | `refine()` — smelt ore into bullion bars |
| `ASSAYER` | `certify()` — assay and hallmark refined bars |
| `DEALER` | Receive custody transfers of certified products |
| `AUDITOR` | Read-only (all `get*` / `verify*` are public `view`) |

Custody transfer is permissionless for the **current custodian**: only the address stored
in `currentCustodian` may call `transferCustody()`.

---

## Data Model

### RawOre
| Field | Type | Description |
|---|---|---|
| `id` | `bytes32` | Deterministic keccak256 hash |
| `metal` | `Metal` | GOLD or SILVER |
| `mineId` | `string` | Mine identifier (e.g., "MINE-ZA-DRIEFONTEIN") |
| `originCountry` | `string` | ISO country code |
| `mineralType` | `string` | "alluvial", "reef", "lode", etc. |
| `extractedAt` | `uint256` | Unix timestamp of extraction |
| `weightGrams` | `uint256` | Gross weight of ore in grams |
| `estimatedGrade` | `string` | Grade (e.g., "8 g/t" for gold grams per tonne) |
| `currentCustodian` | `address` | Current holder |

### RefinedBar
| Field | Type | Description |
|---|---|---|
| `id` | `bytes32` | Deterministic keccak256 hash |
| `inputOreIds` | `bytes32[]` | Source RawOre IDs consumed |
| `metal` | `Metal` | GOLD or SILVER |
| `refineryId` | `string` | Refinery identifier (e.g., "RAND-REFINERY-ZA") |
| `refinedAt` | `uint256` | Unix timestamp |
| `outputWeightGrams` | `uint256` | Net weight of refined bar |
| `finenessPPT` | `uint256` | Fineness in parts per thousand (9999 = 999.9‰) |
| `barSerialNumber` | `string` | Refinery serial number |
| `currentCustodian` | `address` | Current holder |

### CertifiedProduct
| Field | Type | Description |
|---|---|---|
| `id` | `bytes32` | Deterministic keccak256 hash |
| `inputBarId` | `bytes32` | Source RefinedBar |
| `metal` | `Metal` | GOLD or SILVER |
| `assayerId` | `string` | Assayer identifier |
| `certifiedAt` | `uint256` | Unix timestamp |
| `weightGrams` | `uint256` | Certified final weight |
| `finenessPPT` | `uint256` | Certified fineness |
| `hallmark` | `string` | "LBMA Good Delivery", "COMEX Approved", etc. |
| `sku` | `string` | Stock-keeping unit |
| `productType` | `string` | "bar", "coin", "ingot" |
| `currentCustodian` | `address` | Current holder |

---

## Merkle Tree Integration

The existing Merkle anchoring pipeline (`src/services/merkle/`) is extended with a
**traceability bridge** (`src/services/merkle/traceability-bridge.js`) that:

1. Listens for on-chain events (`OreExtracted`, `BarRefined`, `ProductCertified`,
   `CustodyTransferred`).
2. Canonicalises each event into a Merkle leaf.
3. Batches leaves by scope (day / shipment / lot).
4. When a batch closes, builds a Merkle tree, anchors the root via `EventLogger.anchorRoot()`.
5. Generates inclusion proofs for each leaf, enabling lightweight per-event verification
   without replaying the entire chain.

### Gas Savings

| Events | Legacy (1 tx each) | Merkle-batched | Savings |
|---|---|---|---|
| 10 | 10 txs | 1 tx | **90 %** |
| 100 | 100 txs | 1 tx | **99 %** |

---

## Quick Start

```bash
# Install dependencies (from repo root)
npm install

# Compile Solidity
npx hardhat compile

# Run the demo on local Hardhat node
npx hardhat node                                        # terminal 1
npx hardhat run scripts/demo.cjs --network localhost    # terminal 2

# Run Merkle tests
npm run test:merkle
```

---

## File Map

| File | Purpose |
|---|---|
| `contracts/GoldSilverTraceability.sol` | Main contract (roles, structs, CRUD, verify, IPFS CIDs) for gold & silver |
| `contracts/EventLogger.sol` | Stateless event logger + Merkle root anchoring |
| `scripts/demo.cjs` | Hardhat demo: gold flow + silver flow end-to-end |
| `src/services/merkle/tree.js` | SHA-256 Merkle tree engine (build, proof, verify) |
| `src/services/merkle/traceability-bridge.js` | Bridge: on-chain events → Merkle leaves → anchored roots |
| `src/services/merkle/models.js` | Domain models (CertificatePackage, AnchorBatch, InclusionProof) |
| `hardhat.config.cjs` | Hardhat configuration (Solidity 0.8.20, networks) |

---

## Security Notes

- **Duplicate prevention**: `require(!exists[id])` in every create function.
- **Input validation**: `refine()` checks all `oreIds` exist; `certify()` checks `barId` exists.
- **Array bounds**: `oreIds` capped at 100 for demo (production should paginate or use commit/reveal).
- **Custody**: Only the current custodian can transfer; prevents unauthorised re-assignment.
- **Role separation**: OpenZeppelin `AccessControl` with explicit role-admin hierarchy.
- **Metal tracking**: `Metal` enum propagated through every stage for gold/silver separation.
