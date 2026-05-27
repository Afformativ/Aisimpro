# UNTP Alignment — Gold Provenance

This document describes how the Gold Provenance application maps to the
[UN Transparency Protocol (UNTP)](https://untp.unece.org/) and what was
implemented to make it compliant.

---

## 1. What UNTP Is

UNTP is a UN-backed open protocol that allows any supply chain actor to issue,
discover, and verify **cryptographically signed credentials** about products,
facilities, conformity, and traceability events.  Its goals:

- Counter greenwashing by making sustainability claims independently verifiable
- Provide supply chain accountability without a central platform
- Enable interoperability between any technology stack

**Key design principle:** UNTP is a *protocol*, not a platform.  Blockchain is
not required by the spec but is a natural fit for tamper-evident anchoring.

### Core Standards Used

| Standard | Role |
|---|---|
| W3C Verifiable Credentials v2.0 | Credential envelope (JSON-LD, JOSE signed) |
| W3C DID Core (`did:web`) | Decentralised identifiers for issuers/subjects |
| IETF RFC 9264 Linksets | Discovery response format for Identity Resolver |
| W3C VC Bitstring Status List | Credential revocation |

---

## 2. UNTP Credential Types

UNTP defines five credential types.  All use W3C VC JSON-LD format.

| Credential | Abbreviation | Issuer | Purpose |
|---|---|---|---|
| Digital Product Passport | DPP | Manufacturer/shipper | Product identity, characteristics, sustainability |
| Digital Traceability Event | DTE | Any supply chain actor | Supply chain lifecycle steps |
| Digital Conformity Credential | DCC | Conformity Assessment Body | Independent verification of claims |
| Digital Facility Record | DFR | Facility owner/operator | Facility identity, location, performance |
| Digital Identity Anchor | DIA | Authoritative register | Binds a DID to a registered legal identity |

### Digital Traceability Event sub-types

| Event Type | Use Case |
|---|---|
| TransformationEvent | Inputs consumed to produce outputs (ore → bar, bar → product) |
| AssociationEvent | Relationship between independent items |
| AggregationEvent | Grouping for transport |
| TransactionEvent | Custody transfer between organisations |
| ObjectEvent | Action on a single item (extraction, inspection) |

---

## 3. How This Application Maps to UNTP

### Entity mapping

| This App | UNTP Credential | Notes |
|---|---|---|
| `Party` | Issuer in every credential + `DIA` subject | Needs `did:web` identity |
| `Facility` (mine, refinery) | `DFR` | Already has GPS, permits, owner |
| `RawOre` | `DTE` ObjectEvent (extraction) + `DPP` | First event in chain |
| `RefinedBar` | `DTE` TransformationEvent (ore → bar) + `DPP` | Multi-input transformation |
| `CertifiedProduct` | `DPP` (final product) + `DCC` (assayer cert) | Product passport + conformity credential |
| Batch events (ship/receive/transfer) | `DTE` TransactionEvent | Custody chain |
| `Document` (assay report, permit) | Evidence attachment inside `DCC` or `DTE` | Document root already on-chain |

### On-chain field → UNTP field mapping

#### RawOre → DTE ObjectEvent + DPP

| Contract Field | UNTP Field |
|---|---|
| `id` (bytes32 keccak256) | `credentialSubject.id` (as `urn:goldprov:ore:{hex}`) |
| `metal` | `credentialSubject.name` + `credentialSubject.description` |
| `mineId` | `credentialSubject.producedByParty.id` |
| `originCountry` | `credentialSubject.countryOfProduction` |
| `mineralType` | `credentialSubject.characteristics.mineralType` |
| `extractedAt` | `credentialSubject.issuanceDate` / event `eventTime` |
| `weightGrams` | `credentialSubject.dimensions.weight` |
| `estimatedGrade` | `credentialSubject.characteristics.estimatedGrade` |
| `currentCustodian` (address) | `credentialSubject.producedByParty.registeredId` |
| `documentRoot` | `credentialSubject.attachments[].merkleRoot` |

#### RefinedBar → DTE TransformationEvent + DPP

| Contract Field | UNTP Field |
|---|---|
| `id` | `credentialSubject.id` (as `urn:goldprov:bar:{hex}`) |
| `inputOreIds[]` | `credentialSubject.inputItems[]` |
| `refineryId` | `credentialSubject.processingParty.id` |
| `refinedAt` | event `eventTime` |
| `outputWeightGrams` | `credentialSubject.dimensions.weight` |
| `finenessPPT` | `credentialSubject.characteristics.finenessPPT` |
| `barSerialNumber` | `credentialSubject.serialNumber` |

#### CertifiedProduct → DPP + DCC

| Contract Field | UNTP Field |
|---|---|
| `id` | `credentialSubject.id` (as `urn:goldprov:product:{hex}`) |
| `inputBarId` | DTE input reference |
| `assayerId` | DCC `issuer.id` (as `did:web:...`) |
| `certifiedAt` | `issuanceDate` |
| `finenessPPT` | `credentialSubject.conformityAssessment[].measuredValue` |
| `hallmark` | `credentialSubject.conformityAssessment[].standardOrRegulation` |
| `conformityCredentialURI` *(new)* | `credentialSubject.conformityInformation[].credentialReference` |

---

## 4. What Was Implemented

### Files Created / Modified

#### New files

| File | Purpose |
|---|---|
| `UNTP-ALIGNMENT.md` | This document — design rationale + verification guide |
| `src/services/untp-credentials.js` | Builds all 5 UNTP credential types as W3C VC JSON-LD |
| `src/routes/untp.js` | Identity Resolver (RFC 9264 linksets) + credential + DID endpoints |

#### Modified files

| File | What changed |
|---|---|
| `contracts/GoldSilverTraceability.sol` | `baseURI` state var, `partyDID` mapping, `conformityCredentialURI` on `CertifiedProduct`, 3 new functions + events |
| `src/services/traceability-contract.js` | Updated ABI, added `registerPartyDID`, `setConformityCredential`, `setBaseURI` service methods |
| `src/api.js` | Imports UNTP router, mounts it before the auth guard, adds `/.well-known/did.json` |
| `.env.example` | `UNTP_BASE_URI`, `UNTP_DID`, `UNTP_ISSUER_NAME` vars documented |

---

### 4.1 Smart Contract Changes (`contracts/GoldSilverTraceability.sol`)

Three additions to the existing contract:

**a) `baseURI` state variable + getter**

```solidity
string public baseURI;
function setBaseURI(string calldata uri) external onlyRole(ADMIN_ROLE);
```

Provides the root URL for UNTP-compatible URIs.
Example: `https://goldprovenance.example.com/`
Full product URI: `{baseURI}product/{bytes32hex}`

**b) `partyDID` mapping**

```solidity
mapping(address => string) public partyDID;
function registerPartyDID(string calldata did) external;
event PartyDIDRegistered(address indexed party, string did);
```

Any wallet holder can register their `did:web` identity on-chain.
This links the Ethereum address (used as `currentCustodian`) to a
verifiable W3C DID so credential verifiers can resolve the issuer's
public key.

**c) `conformityCredentialURI` on `CertifiedProduct`**

```solidity
string conformityCredentialURI;   // added to struct
function setConformityCredential(bytes32 productId, string calldata uri) external;
event ConformityCredentialSet(bytes32 indexed productId, string uri);
```

The assayer records the URI of their signed DCC (Digital Conformity
Credential) on-chain, making it permanently discoverable from the
product record without trusting any off-chain index.

### 4.2 UNTP Credential Generator (`src/services/untp-credentials.js`)

Reads on-chain data from `GoldSilverTraceability` and wraps it in
W3C VC JSON-LD claims that are then issued as JOSE-enveloped VC-JWTs
that conform to the UNTP schemas.

Produces four credential types:

- **`buildDTE_OreExtraction(oreId)`** → DTE ObjectEvent
- **`buildDTE_BarRefinement(barId)`** → DTE TransformationEvent
- **`buildDPP_Product(productId)`** → Digital Product Passport
- **`buildDCC_Assay(productId)`** → Digital Conformity Credential
- **`buildDFR_Facility(facilityId)`** → Digital Facility Record

Each credential is signed as a compact VC-JWT using an Ed25519 key,
published in the issuer DID document, and linked to a W3C Bitstring
Status List entry for revocation.

### 4.3 Identity Resolver API (`src/routes/untp.js`)

Implements the UNTP Discover-Resolve-Verify (D-R-V) workflow.

#### Discovery (RFC 9264 Linksets)

```
GET /api/resolve/ore/:id       → linkset { links: [ DTE, DPP ] }
GET /api/resolve/bar/:id       → linkset { links: [ DTE, DPP ] }
GET /api/resolve/product/:id   → linkset { links: [ DPP, DCC ] }
GET /api/resolve/facility/:id  → linkset { links: [ DFR ] }
```

#### Credential retrieval

```
GET /api/credentials/dte/ore/:id        → signed DTE VC (ore extraction)
GET /api/credentials/dte/bar/:id        → signed DTE VC (bar refinement)
GET /api/credentials/dpp/product/:id    → signed DPP VC
GET /api/credentials/dcc/product/:id    → signed DCC VC
GET /api/credentials/dfr/facility/:id   → signed DFR VC
```

#### DID documents

```
GET /.well-known/did.json               → server-level DID document
GET /parties/:partyId/did.json          → party-level DID document
```

### 4.4 Environment Variables

```
UNTP_BASE_URI        Base URL for entity URIs (e.g. https://goldprov.example.com/)
UNTP_DID             Server did:web identity (e.g. did:web:goldprov.example.com)
UNTP_ISSUER_NAME     Human-readable issuer name shown in credentials
```

See `.env.example` for the full list with descriptions.

---

## 5. How to Verify UNTP Compliance

### Step 1 — Start the server

```bash
npm run api
```

### Step 2 — Register a party DID (optional, live mode only)

```bash
curl -X POST http://localhost:3000/api/untp/party-did \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"did": "did:web:yourdomain.com:parties:miner-1"}'
```

### Step 3 — Fetch a UNTP linkset (Identity Resolver)

After registering an ore (via UI or API), copy its hex ID and run:

```bash
# Replace <oreId> with the 0x... hex from the UI
curl http://localhost:3000/api/resolve/ore/<oreId>
```

Expected response shape (RFC 9264):
```json
{
  "linkset": [{
    "anchor": "http://localhost:3000/api/resolve/ore/<oreId>",
    "https://vocabulary.uncefact.org/DigitalTraceabilityEvent": [
      { "href": "http://localhost:3000/api/credentials/dte/ore/<oreId>",
        "type": "application/vc+ld+json" }
    ]
  }]
}
```

### Step 4 — Fetch and inspect a UNTP credential

```bash
curl http://localhost:3000/api/credentials/dte/ore/<oreId> | jq .
```

Check that the response contains:
- `@context` includes `https://www.w3.org/ns/credentials/v2`
- top-level `type` is `EnvelopedVerifiableCredential`
- `id` starts with `data:application/vc+jwt,`

Decode the JWT payload and check that:

- `type` includes `DigitalTraceabilityEvent` and `VerifiableCredential`
- `issuer.id` is a `did:web:...` URI
- `credentialSubject.id` is a resolvable ore URI
- `credentialSubject.eventTime` is an ISO 8601 timestamp
- `credentialStatus.type` is `BitstringStatusListEntry`

### Step 5 — Fetch a Digital Product Passport

```bash
# Register a product first, then:
curl http://localhost:3000/api/credentials/dpp/product/<productId> | jq .
```

Check for:
- `type` includes `DigitalProductPassport`
- `credentialSubject.traceabilityInformation` references the input bar
- `credentialSubject.conformityInformation` references the DCC

### Step 5b — Fetch a DTE for a Refined Bar

```bash
curl http://localhost:3000/api/credentials/dte/bar/<barId> | jq .
```

Check for:

- `credentialSubject.type` is `TransformationEvent`
- `credentialSubject.inputItemList[]` references the input ore URNs
- `credentialSubject.outputItemList[0].serialNumber` matches the bar serial number

### Step 5c — Fetch a DCC (assay conformity credential)

```bash
curl http://localhost:3000/api/credentials/dcc/product/<productId> | jq .
```

Check for:

- `type` includes `DigitalConformityCredential`
- `credentialSubject.assessorLevel` is `3rdParty`
- `credentialSubject.conformityAssessment[0].measuredValue.unit` is `PPT`
- `credentialSubject.conformityAssessment[0].conformanceStatus` is `true`

### Step 5d — Fetch a DFR for a Facility

```bash
# Get a facilityId from GET /api/facilities, then:
curl http://localhost:3000/api/credentials/dfr/facility/<facilityId> | jq .
```

Check for:

- `type` includes `DigitalFacilityRecord`
- `credentialSubject.location.country` is populated
- `credentialSubject.operatedByParty.name` matches the facility owner

### Step 6 — Validate against the UNTP test suite

The official UNTP test suite is at:
**https://uncefact.github.io/tests-untp/**

1. Copy the JSON output of any credential endpoint
2. Paste into the test suite validator
3. Select the matching credential type (DTE / DPP / DCC / DFR)
4. Run validation — it checks JSON-LD context, required fields, and
   schema conformance

### Step 7 — Verify the DID document

```bash
curl http://localhost:3000/.well-known/did.json | jq .
```

Expected:
```json
{
  "@context": ["https://www.w3.org/ns/did/v1"],
  "id": "did:web:localhost",
  "verificationMethod": [{
    "id": "did:web:localhost#key-1",
    "type": "JsonWebKey2020",
    "controller": "did:web:localhost",
    "publicKeyJwk": { ... }
  }],
  "authentication": ["did:web:localhost#key-1"],
  "assertionMethod": ["did:web:localhost#key-1"]
}
```

### Step 8 — Check on-chain conformity credential URI

```bash
# In live mode, after certifying a product and setting a conformity credential:
curl -X POST http://localhost:3000/api/untp/conformity-credential \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"productId": "0x...", "uri": "http://localhost:3000/api/credentials/dcc/product/0x..."}'

# Then verify it's stored on-chain by reading the product:
curl http://localhost:3000/api/traceability/product/0x... | jq .conformityCredentialURI
```

### Step 9 — Redeploy the contract (live mode — required after Solidity changes)

The contract was updated with `baseURI`, `partyDID`, and `conformityCredentialURI`.
If you are using a live network you must redeploy and update your env:

```bash
# Redeploy
npx hardhat run scripts/deploy-traceability.cjs --network zkevm-testnet

# Update .env with the new address, then restart the server
# npm run api

# Set the base URI on-chain so entity URIs are resolvable:
curl -X POST http://localhost:3000/api/untp/base-uri \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{"uri": "http://localhost:3000/"}'
```

### Step 10 — Party DID document (per-party)

Each party in the system has its own DID document served at:

```bash
# Get a partyId from GET /api/parties, then:
curl http://localhost:3000/api/parties/<partyId>/did.json | jq .
```

Check for:

- `id` is `did:web:localhost:parties:<partyId>`
- `verificationMethod[0].type` is `JsonWebKey2020`
- `service[0].type` is `IdentityResolver`

---

## 6. UNTP Conformance Checklist

| Requirement | Status | Notes |
|---|---|---|
| W3C VC v2.0 JSON-LD envelope | ✅ | All credentials use `@context` with VC v2 |
| `did:web` issuer identity | ✅ | Server DID document at `/.well-known/did.json` |
| DTE for extraction events | ✅ | ObjectEvent wrapping `OreExtracted` on-chain data |
| DTE for transformation events | ✅ | TransformationEvent wrapping `BarRefined` |
| DPP for certified products | ✅ | Includes traceability + conformity refs |
| DCC for assay certification | ✅ | Wraps on-chain assay fields + document root |
| DFR for facilities | ✅ | Wraps off-chain facility record |
| RFC 9264 Linkset discovery | ✅ | `/api/resolve/:type/:id` endpoints |
| On-chain party DID registry | ✅ | `partyDID` mapping in contract |
| On-chain conformity URI | ✅ | `conformityCredentialURI` on `CertifiedProduct` |
| Credential proof (JWT) | ✅ | JOSE VC-JWT envelope signed with Ed25519 |
| UNTP test suite validation | 🔲 | Run manually — see Step 6 above |
| Production `did:web` domain | 🔲 | Set `UNTP_DID` and `UNTP_BASE_URI` env vars |
| Credential revocation | ✅ | W3C Bitstring Status List endpoint + revocation control |

---

## 7. References

- [UN Transparency Protocol](https://untp.unece.org/)
- [UNTP Specification](https://untp.unece.org/docs/specification/)
- [Digital Traceability Events](https://uncefact.github.io/spec-untp/docs/specification/DigitalTraceabilityEvents/)
- [Digital Product Passport](https://uncefact.github.io/spec-untp/docs/specification/DigitalProductPassport/)
- [Digital Conformity Credential](https://untp.unece.org/docs/0.6.0/specification/ConformityCredential/)
- [Digital Facility Record](https://uncefact.github.io/spec-untp/docs/specification/DigitalFacilityRecord/)
- [UNTP Test Suite](https://uncefact.github.io/tests-untp/)
- [W3C VC Data Model v2.0](https://www.w3.org/TR/vc-data-model-2.0/)
- [W3C DID Core](https://www.w3.org/TR/did-1.0/)
- [RFC 9264 Linksets](https://www.rfc-editor.org/rfc/rfc9264)
