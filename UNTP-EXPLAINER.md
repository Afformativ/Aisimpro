# What Is UNTP and Why Does It Exist?
### A plain-language guide for non-programmers

---

## The Problem: "Trust Me, It's Ethical Gold"

Imagine you buy a gold ring. The jeweller says the gold is:
- Ethically mined in South Africa
- Refined to 99.9% purity
- Certified by an independent assayer

But how do you **actually know** that's true?

Right now, you can't. You take the jeweller's word for it — or pay an auditor thousands of dollars to trace each handoff manually. Factories falsify records. Middlemen lose paperwork. Corrupt actors swap materials. The supply chain is a black box.

This is the problem UNTP solves.

---

## What Is UNTP?

**UNTP** stands for **UN Transparency Protocol** — a standard created by the United Nations to make supply chain claims independently verifiable by anyone, anywhere, for free.

Think of it as a **universal language for trust**.

Instead of "trust me, here's a PDF certificate", every step in the gold's journey produces a **digital credential** — a tamper-proof, machine-readable document that:
- Is cryptographically signed (like a digital notary seal)
- Can be verified by anyone without calling the issuer
- Links forward and backward through the entire supply chain chain

> **Analogy:** It's like replacing handwritten letters of recommendation with a verified LinkedIn profile. Anyone can check it instantly, without contacting the author.

---

## Why Gold and Silver Specifically?

Gold and silver are high-value commodities with serious problems:

| Problem | Real-World Impact |
|---|---|
| Conflict minerals | Gold funds armed groups in conflict zones |
| Environmental damage | Mercury-polluted rivers, illegal mining |
| Purity fraud | Bars diluted with cheaper metals, sold at full gold price |
| Provenance washing | Unethical gold re-labeled as "responsible" |
| Documentation gaps | Paper certificates lost, faked, or backdated |

Regulators (EU, UK, US) are increasingly requiring documented supply chain due diligence. Without UNTP-style traceability, companies face legal exposure and reputational risk.

---

## The Gold Journey: From Mine to Market

Here is the physical journey of gold — and what UNTP records at each step:

```
 ┌─────────────┐
 │    MINE     │  👷 Miner extracts raw ore
 │  (origin)   │  Weight: 1,000 kg | Grade: 8 g/t gold | Country: South Africa
 └──────┬──────┘
        │ 📄 UNTP issues: Digital Traceability Event (Extraction)
        │    "1,000 kg of ore extracted on 2025-04-15 at Driefontein mine"
        │    Signed by miner's verified identity (DID)
        ▼
 ┌─────────────┐
 │  REFINERY   │  🔥 Ore smelted and purified into gold bars
 │             │  Input: 1,000 kg ore → Output: 6.5 kg bar at 999.9 purity
 └──────┬──────┘
        │ 📄 UNTP issues: Digital Traceability Event (Transformation)
        │    "Ore batches A, B, C refined into Bar #GLD-2025-00142"
        │    Links back to the original ore extraction events
        ▼
 ┌─────────────┐
 │   ASSAYER   │  🔬 Independent lab measures actual gold content
 │  (3rd party)│  Result: 999.8 fine, hallmark LBMA Good Delivery
 └──────┬──────┘
        │ 📄 UNTP issues: Digital Conformity Credential
        │    "We certify: Bar #GLD-2025-00142 is 999.8 fine gold"
        │    Signed by accredited assay lab — independent of seller
        ▼
 ┌─────────────┐
 │  CERTIFIED  │  ✅ Bar gets a Digital Product Passport
 │   PRODUCT   │  Passport links: DCC (assay) + DTE (refinement) + DTE (extraction)
 └──────┬──────┘
        │ 📄 UNTP issues: Digital Product Passport
        │    Complete history: mine → refinery → assay → product
        ▼
 ┌─────────────┐
 │   MARKET /  │  💍 Jeweller or investor buys the bar
 │    BUYER    │  Scans QR code → sees full provenance chain instantly
 └─────────────┘
        │ 🔍 Anyone can verify:
           1. Who extracted it (with GPS location and date)
           2. Who refined it (input/output traceability)
           3. Who certified the purity (independent third party)
           4. Every handoff in between
```

---

## The Five Document Types UNTP Creates

Think of these like different official documents you already know:

| UNTP Document | Real-World Equivalent | What It Records |
|---|---|---|
| **DTE** — Digital Traceability Event | Customs declaration / bill of lading | A specific thing that happened: ore extracted, bar refined, ownership transferred |
| **DPP** — Digital Product Passport | Product birth certificate / vehicle logbook | Everything known about one product, with links to its full history |
| **DCC** — Digital Conformity Credential | Lab test certificate / CE mark | An independent third party verified a specific claim (e.g., "this bar is 999.9 fine") |
| **DFR** — Digital Facility Record | Business registration / mine license | Who owns/operates a physical location and what it's authorized to do |
| **DID** — Digital Identity | Verified digital passport | Proves who issued the document and lets you check their signature |

---

## How the Trust Works: Digital Signatures

Every UNTP document is **signed** by its issuer — like a notary seal, but mathematical.

**The old way:**
1. Mine prints a paper certificate
2. Buyer receives it — no way to know if it's genuine
3. Fraudster reprints with different details — looks identical

**The UNTP way:**
1. Mine creates a digital credential and signs it with their private key
2. Their public key is registered at a web address they control (their "DID")
3. Anyone can check: does the signature on this credential match the public key?
4. If someone changes even one word — the signature breaks. Tampering is mathematically detectable.

> **Analogy:** Like a wax seal on an envelope — except breaking it is visible to everyone and impossible to fake.

---

## Why Blockchain? (And What It Adds)

UNTP does not require blockchain — but this project uses one (Polygon zkEVM) to add an extra layer:

| Without Blockchain | With Blockchain |
|---|---|
| Credential exists on a server | Key facts are also written to a permanent, public ledger |
| Server could be shut down | Blockchain record survives even if the company disappears |
| Company could delete records | Records are immutable — no one can erase them |
| Time of record is claimed | Block timestamp is independently verifiable |

**What gets put on-chain in this system:**
- The fact that ore was extracted (not the full details, just a hash — a fingerprint)
- The fact that a bar was refined from specific inputs
- The conformity certificate URI (permanent link to the assay certificate)
- Each party's verified digital identity (DID)

> **Analogy:** Blockchain is like filing the title deed for a house at the land registry. The deed itself (UNTP credential) lives with the owner — but the registry proves it was registered at a specific date and can't be secretly changed.

---

## What a Verifier Actually Does

A buyer, regulator, or auditor wants to verify a gold bar. Here's what they do:

```
Step 1: Scan the QR code on the bar (or enter the product ID)
         ↓
Step 2: System returns a "linkset" — a menu of available credentials
         ↓
Step 3: Click "Product Passport" → see weight, purity, hallmark
         ↓
Step 4: Click "Conformity Credential" → see the independent assay result
         ↓
Step 5: Click "Traceability Events" → see the full chain:
         - Which refinery produced this bar
         - Which ore batches went in
         - Which mine extracted each ore batch
         ↓
Step 6: The system automatically checks every digital signature
         ✅ All valid = fully verified supply chain
         ❌ Any invalid = tampered record detected
```

This takes **seconds**, costs **nothing**, and requires **no phone calls or paperwork**.

---

## What This Project Built (In Plain English)

This Gold Provenance system implemented UNTP by creating:

### 1. A Smart Contract on the Blockchain
Stores the permanent, tamper-proof record of every event:
- When and where ore was extracted
- How bars were refined (what went in, what came out)
- When products were certified and by whom
- Each company's verified digital identity

### 2. A Credential Generator
Reads the on-chain data and wraps it into properly formatted UNTP documents — the five types above. Like a printer that takes raw data and formats it into official documents.

### 3. An Identity Resolver
A public web endpoint where anyone can type in a product ID and get back a list of all associated credentials. Think of it like a product's "verified profile page".

### 4. A REST API
The technical interface that lets other software systems (apps, auditing tools, government portals) automatically query this system and retrieve credentials in a standard format.

---

## The Real-World Impact

When UNTP is adopted across an industry:

**For Buyers:**
- Know exactly where your gold came from — no more "trust the jeweller"
- Verify ethical sourcing claims in seconds, not months

**For Miners & Refiners:**
- Responsible operators get credit for doing the right thing
- Undercutting by irresponsible competitors becomes harder

**For Regulators:**
- Automated compliance checking instead of expensive audits
- Cross-border supply chain data that doesn't require bilateral agreements

**For the Environment:**
- Illegal mining operations can't produce valid UNTP credentials
- Consumers and brands can genuinely prefer verified-clean gold

**For the Financial System:**
- Banks and insurers get real-time supply chain data for risk assessment
- Fraud (gold-plated tungsten, re-labeled conflict minerals) becomes detectable

---

## Summary: The One-Sentence Version

> UNTP turns verbal claims ("this gold is ethical") into verifiable digital facts ("here is a cryptographically signed, blockchain-anchored credential proving where this gold came from, who refined it, and who certified its purity — check for yourself").

---

## Key Terms Glossary

| Term | Plain-Language Meaning |
|---|---|
| **Credential** | An official digital document making a claim |
| **Verifiable** | Can be checked by anyone, independently, for free |
| **Cryptographic signature** | Mathematical seal that breaks if the document is changed |
| **DID (Decentralized Identifier)** | A web address that proves who you are without a central authority |
| **Blockchain** | A shared, permanent record-book no single party controls |
| **Hash / Fingerprint** | A short code that uniquely represents a document — changing the document changes the hash |
| **Linkset** | A list of credentials available for a specific product |
| **LBMA Good Delivery** | The gold industry's highest purity standard |
| **Fineness PPT** | Purity in parts-per-thousand (999 = 99.9% pure gold) |
| **Smart Contract** | A program that runs automatically on a blockchain — no human can modify it |
