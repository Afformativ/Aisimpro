// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IOreSelectiveDisclosureVerifier {
    function verifyProof(
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) external view returns (bool);
}

/**
 * @title GoldSilverTraceability
 * @notice On-chain gold & silver mining provenance and chain-of-custody
 *         traceability inspired by Patel et al. (Scientific Reports 2025).
 *
 *         Every entity ID is a deterministic keccak256(abi.encode(…)) hash
 *         so that any auditor can recompute and verify provenance without
 *         trusting a centralised database.
 *
 * @dev    Supply-chain stages:
 *           1. RawOre        – extracted at the mine (gold or silver ore)
 *           2. RefinedBar    – smelted & refined bullion bar
 *           3. CertifiedProduct – assayed, hallmarked bar / coin / ingot
 *
 *         Certificate *templates* live on IPFS (CID stored on-chain);
 *         populated certificates are rendered off-chain by fetching the
 *         template from IPFS and filling in the on-chain fields.
 *
 *         Gas note: `RefinedBar.inputOreIds` is an unbounded array.
 *         For production, cap at a sensible limit (e.g., 50) and paginate
 *         multi-TX smelting flows.  Here we accept arrays up to 100
 *         elements for demo purposes.
 */
contract GoldSilverTraceability is AccessControl {

    // ================================================================
    // Roles
    // ================================================================

    bytes32 public constant SUPERADMIN_ROLE   = keccak256("SUPERADMIN");
    bytes32 public constant ADMIN_ROLE        = keccak256("ADMIN");
    bytes32 public constant MINER_ROLE        = keccak256("MINER");
    bytes32 public constant REFINER_ROLE      = keccak256("REFINER");
    bytes32 public constant ASSAYER_ROLE      = keccak256("ASSAYER");
    bytes32 public constant DEALER_ROLE       = keccak256("DEALER");
    bytes32 public constant AUDITOR_ROLE      = keccak256("AUDITOR");

    // ================================================================
    // Enums
    // ================================================================

    /// Metal type extracted or processed
    enum Metal { GOLD, SILVER }

    /// Record type used in transferCustody
    enum RecordType { RAW_ORE, REFINED_BAR, CERTIFIED_PRODUCT }

    // ================================================================
    // Data Structures
    // ================================================================

    /**
     * @dev Raw ore extracted at the mine site.
     *      Represents unprocessed material before smelting.
     */
    struct RawOre {
        bytes32 id;
        Metal   metal;             // GOLD or SILVER
        string  mineId;            // e.g. "MINE-ZA-DRIEFONTEIN"
        string  originCountry;     // ISO 3166 country
        string  mineralType;       // e.g. "alluvial", "reef", "lode"
        uint256 extractedAt;       // unix timestamp
        uint256 weightGrams;       // gross weight of ore in grams
        string  estimatedGrade;    // e.g. "8 g/t" (grams per tonne)
        address currentCustodian;
        bool    exists;
        bytes32 documentRoot;          // Merkle root of attached evidence documents
        string  evidenceManifestCID;   // IPFS CID pointing to the document manifest
    }

    /**
     * @dev Refined bullion bar produced by smelting one or more RawOre inputs.
     */
    struct RefinedBar {
        bytes32   id;
        bytes32[] inputOreIds;     // source RawOre IDs consumed
        Metal     metal;
        string    refineryId;      // e.g. "RAND-REFINERY-ZA"
        uint256   refinedAt;       // unix timestamp
        uint256   outputWeightGrams; // net weight of refined bar
        uint256   finenessPPT;     // fineness in parts per thousand (e.g. 9999 = 999.9‰)
        string    barSerialNumber; // refinery serial, e.g. "RR-2026-001234"
        address   currentCustodian;
        bool      exists;
        bytes32   documentRoot;          // Merkle root of attached evidence documents
        string    evidenceManifestCID;   // IPFS CID pointing to the document manifest
    }

    /**
     * @dev Certified, assayed product ready for market
     *      (hallmarked bar, minted coin, investment ingot, etc.)
     */
    struct CertifiedProduct {
        bytes32 id;
        bytes32 inputBarId;        // source RefinedBar
        Metal   metal;
        string  assayerId;         // e.g. "LBMA-ASSAYER-UK-003"
        uint256 certifiedAt;       // unix timestamp
        uint256 weightGrams;       // final certified weight
        uint256 finenessPPT;       // certified fineness
        string  hallmark;          // e.g. "LBMA Good Delivery", "999.9 AU"
        string  sku;               // stock-keeping unit
        string  productType;       // "bar", "coin", "ingot"
        address currentCustodian;
        bool    exists;
        bytes32 documentRoot;          // Merkle root of attached evidence documents
        string  evidenceManifestCID;   // IPFS CID pointing to the document manifest
        // ── UNTP: URI of the signed Digital Conformity Credential (DCC) ──
        string  conformityCredentialURI;
    }

    // ================================================================
    // State
    // ================================================================

    mapping(bytes32 => RawOre)           private _rawOres;
    mapping(bytes32 => RefinedBar)       private _refinedBars;
    mapping(bytes32 => CertifiedProduct) private _certifiedProducts;

    /// IPFS CIDs for certificate templates  (RecordType → CID string)
    mapping(RecordType => string) public templateCID;

    // ── UNTP: base URI used to build resolvable entity URIs ─────────
    // e.g. "https://goldprovenance.example.com/"
    // Full URI for an ore: {baseURI}ore/{bytes32hex}
    string public baseURI;

    // ── UNTP: on-chain registry of did:web identities for wallet addresses ──
    // Any address can register its own DID.  Credential verifiers resolve
    // the issuer DID to retrieve the public key used to verify signatures.
    mapping(address => string) public partyDID;

    // ── ZK selective-disclosure commitments for ore origin + grade ──────────
    mapping(bytes32 => uint256) private _orePrivacyCommitments;
    address public oreDisclosureVerifier;

    // ================================================================
    // Events
    // ================================================================

    event OreExtracted(
        bytes32 indexed id,
        Metal   metal,
        address indexed custodian,
        string  mineId,
        string  originCountry,
        string  mineralType,
        uint256 extractedAt,
        uint256 weightGrams,
        string  estimatedGrade
    );

    event BarRefined(
        bytes32   indexed barId,
        bytes32[] oreIds,
        Metal     metal,
        address   indexed custodian,
        string    refineryId,
        uint256   refinedAt,
        uint256   outputWeightGrams,
        uint256   finenessPPT,
        string    barSerialNumber
    );

    event ProductCertified(
        bytes32 indexed productId,
        bytes32 indexed barId,
        Metal   metal,
        address indexed custodian,
        string  assayerId,
        uint256 certifiedAt,
        uint256 weightGrams,
        uint256 finenessPPT,
        string  hallmark,
        string  sku,
        string  productType
    );

    event CustodyTransferred(
        RecordType recordType,
        bytes32    indexed id,
        address    indexed from,
        address    indexed to
    );

    event TemplateCIDUpdated(
        RecordType recordType,
        string     cid
    );

    /// @notice Emitted when a Merkle document root is set for a RawOre record
    event OreDocumentRootSet(
        bytes32 indexed oreId,
        bytes32 root,
        string  manifestCID
    );

    /// @notice Emitted when a Merkle document root is set for a RefinedBar record
    event BarDocumentRootSet(
        bytes32 indexed barId,
        bytes32 root,
        string  manifestCID
    );

    /// @notice Emitted when a Merkle document root is set for a CertifiedProduct record
    event ProductDocumentRootSet(
        bytes32 indexed productId,
        bytes32 root,
        string  manifestCID
    );

    // ── UNTP events ──────────────────────────────────────────────────

    /// @notice Emitted when a wallet registers its did:web identity on-chain
    event PartyDIDRegistered(address indexed party, string did);

    /// @notice Emitted when an assayer records a UNTP conformity credential URI
    event ConformityCredentialSet(bytes32 indexed productId, string uri);

    /// @notice Emitted when the UNTP base URI is updated
    event BaseURIUpdated(string uri);

    /// @notice Emitted when a private ore record anchors a ZK commitment on-chain
    event OrePrivacyCommitmentSet(bytes32 indexed oreId, uint256 commitment);

    /// @notice Emitted when the Groth16 verifier contract address is updated
    event OreDisclosureVerifierUpdated(address indexed verifier);

    /// @notice Emitted when a verifier confirms a private ore predicate against the stored commitment
    event OreSelectiveDisclosureVerified(
        bytes32 indexed oreId,
        uint256 minGrade,
        uint256 approvedCountryA,
        uint256 approvedCountryB,
        uint256 approvedCountryC,
        address indexed verifier
    );

    // ── Article-mode Merkle root anchoring ───────────────────────────────

    /// @notice Generic hash anchor event for backwards-compatible indexing
    event HashAnchored(
        bytes32 indexed id,
        bytes32 hash,
        uint256 timestamp,
        address indexed sender
    );

    /// @notice Emitted when a batched Merkle root is anchored on-chain
    event RootAnchored(
        bytes32 indexed merkleRoot,
        bytes32 indexed batchIdHash,
        string  scopeType,
        string  scopeId,
        uint256 timestamp,
        address indexed sender,
        bytes32 prevChainedRoot,
        bytes32 chainedRoot
    );

    // ================================================================
    // Constructor
    // ================================================================

    constructor(address superAdmin) {
        _grantRole(DEFAULT_ADMIN_ROLE, superAdmin);
        _grantRole(SUPERADMIN_ROLE, superAdmin);

        _setRoleAdmin(ADMIN_ROLE,   SUPERADMIN_ROLE);
        _setRoleAdmin(MINER_ROLE,   SUPERADMIN_ROLE);
        _setRoleAdmin(REFINER_ROLE, SUPERADMIN_ROLE);
        _setRoleAdmin(ASSAYER_ROLE, SUPERADMIN_ROLE);
        _setRoleAdmin(DEALER_ROLE,  SUPERADMIN_ROLE);
        _setRoleAdmin(AUDITOR_ROLE, SUPERADMIN_ROLE);
    }

    // ================================================================
    // Modifiers
    // ================================================================

    modifier onlyRole2(bytes32 role1, bytes32 role2) {
        require(
            hasRole(role1, msg.sender) || hasRole(role2, msg.sender),
            "AccessControl: missing role"
        );
        _;
    }

    // ================================================================
    // 1. Register Raw Ore  (MINER or ADMIN)
    // ================================================================

    /**
     * @notice Register a new mine output (gold or silver ore).
     * @dev    id = keccak256(abi.encode(
     *            metal, mineId, originCountry, mineralType,
     *            extractedAt, weightGrams, estimatedGrade, msg.sender))
     */
    function registerOre(
        Metal   metal,
        string  calldata mineId,
        string  calldata originCountry,
        string  calldata mineralType,
        uint256 extractedAt,
        uint256 weightGrams,
        string  calldata estimatedGrade
    )
        external
        onlyRole2(MINER_ROLE, ADMIN_ROLE)
        returns (bytes32 id)
    {
        id = keccak256(abi.encode(
            metal,
            mineId,
            originCountry,
            mineralType,
            extractedAt,
            weightGrams,
            estimatedGrade,
            msg.sender
        ));

        require(!_rawOres[id].exists, "Duplicate ore record");

        _rawOres[id] = RawOre({
            id:               id,
            metal:            metal,
            mineId:           mineId,
            originCountry:    originCountry,
            mineralType:      mineralType,
            extractedAt:      extractedAt,
            weightGrams:      weightGrams,
            estimatedGrade:   estimatedGrade,
            currentCustodian: msg.sender,
            exists:           true,
            documentRoot:         bytes32(0),
            evidenceManifestCID:  ""
        });

        emit OreExtracted(
            id, metal, msg.sender,
            mineId, originCountry, mineralType,
            extractedAt, weightGrams, estimatedGrade
        );
    }

    /**
     * @notice Register a new ore record while keeping origin country and grade off-chain.
     * @dev    The hidden values are committed as a Groth16/Poseidon commitment.
     *         Later, the owner proves predicates over those values without revealing them.
     */
    function registerOrePrivate(
        Metal   metal,
        string  calldata mineId,
        string  calldata mineralType,
        uint256 extractedAt,
        uint256 weightGrams,
        uint256 privacyCommitment
    )
        external
        onlyRole2(MINER_ROLE, ADMIN_ROLE)
        returns (bytes32 id)
    {
        require(privacyCommitment != 0, "Commitment required");

        id = keccak256(abi.encode(
            metal,
            mineId,
            "PRIVATE",
            mineralType,
            extractedAt,
            weightGrams,
            "PRIVATE",
            privacyCommitment,
            msg.sender
        ));

        require(!_rawOres[id].exists, "Duplicate ore record");

        _rawOres[id] = RawOre({
            id:               id,
            metal:            metal,
            mineId:           mineId,
            originCountry:    "PRIVATE",
            mineralType:      mineralType,
            extractedAt:      extractedAt,
            weightGrams:      weightGrams,
            estimatedGrade:   "PRIVATE",
            currentCustodian: msg.sender,
            exists:           true,
            documentRoot:         bytes32(0),
            evidenceManifestCID:  ""
        });

        _orePrivacyCommitments[id] = privacyCommitment;

        emit OreExtracted(
            id, metal, msg.sender,
            mineId, "PRIVATE", mineralType,
            extractedAt, weightGrams, "PRIVATE"
        );
        emit OrePrivacyCommitmentSet(id, privacyCommitment);
    }

    // ================================================================
    // 2. Refine / Smelt  (REFINER or ADMIN)
    // ================================================================

    /**
     * @notice Smelt one or more RawOre records into a RefinedBar.
     * @dev    id = keccak256(abi.encode(
     *            oreIds, metal, refineryId, refinedAt,
     *            outputWeightGrams, finenessPPT, barSerialNumber, msg.sender))
     *         All input ore IDs MUST exist.
     *         Gas warning: oreIds length bounded to 100 for demo.
     */
    function refine(
        bytes32[] calldata oreIds,
        Metal     metal,
        string    calldata refineryId,
        uint256   refinedAt,
        uint256   outputWeightGrams,
        uint256   finenessPPT,
        string    calldata barSerialNumber
    )
        external
        onlyRole2(REFINER_ROLE, ADMIN_ROLE)
        returns (bytes32 barId)
    {
        require(oreIds.length > 0 && oreIds.length <= 100, "oreIds: 1-100");

        for (uint256 i = 0; i < oreIds.length; i++) {
            require(_rawOres[oreIds[i]].exists, "Input ore not found");
        }

        barId = keccak256(abi.encode(
            oreIds,
            metal,
            refineryId,
            refinedAt,
            outputWeightGrams,
            finenessPPT,
            barSerialNumber,
            msg.sender
        ));

        require(!_refinedBars[barId].exists, "Duplicate bar record");

        RefinedBar storage bar = _refinedBars[barId];
        bar.id                = barId;
        bar.metal             = metal;
        bar.refineryId        = refineryId;
        bar.refinedAt         = refinedAt;
        bar.outputWeightGrams = outputWeightGrams;
        bar.finenessPPT       = finenessPPT;
        bar.barSerialNumber   = barSerialNumber;
        bar.currentCustodian  = msg.sender;
        bar.exists            = true;
        for (uint256 i = 0; i < oreIds.length; i++) {
            bar.inputOreIds.push(oreIds[i]);
        }

        emit BarRefined(
            barId, oreIds, metal, msg.sender,
            refineryId, refinedAt, outputWeightGrams,
            finenessPPT, barSerialNumber
        );
    }

    // ================================================================
    // 3. Certify / Assay  (ASSAYER or ADMIN)
    // ================================================================

    /**
     * @notice Certify a RefinedBar into a market-ready CertifiedProduct.
     * @dev    id = keccak256(abi.encode(
     *            inputBarId, metal, assayerId, certifiedAt,
     *            weightGrams, finenessPPT, hallmark, sku,
     *            productType, msg.sender))
     */
    function certify(
        bytes32 inputBarId,
        Metal   metal,
        string  calldata assayerId,
        uint256 certifiedAt,
        uint256 weightGrams,
        uint256 finenessPPT,
        string  calldata hallmark,
        string  calldata sku,
        string  calldata productType
    )
        external
        onlyRole2(ASSAYER_ROLE, ADMIN_ROLE)
        returns (bytes32 productId)
    {
        require(_refinedBars[inputBarId].exists, "Bar not found");

        productId = keccak256(abi.encode(
            inputBarId,
            metal,
            assayerId,
            certifiedAt,
            weightGrams,
            finenessPPT,
            hallmark,
            sku,
            productType,
            msg.sender
        ));

        require(!_certifiedProducts[productId].exists, "Duplicate product");

        _certifiedProducts[productId] = CertifiedProduct({
            id:               productId,
            inputBarId:       inputBarId,
            metal:            metal,
            assayerId:        assayerId,
            certifiedAt:      certifiedAt,
            weightGrams:      weightGrams,
            finenessPPT:      finenessPPT,
            hallmark:         hallmark,
            sku:              sku,
            productType:      productType,
            currentCustodian: msg.sender,
            exists:           true,
            documentRoot:         bytes32(0),
            evidenceManifestCID:  "",
            conformityCredentialURI: ""
        });

        emit ProductCertified(
            productId, inputBarId, metal, msg.sender,
            assayerId, certifiedAt, weightGrams,
            finenessPPT, hallmark, sku, productType
        );
    }

    // ================================================================
    // 4. Transfer Custody
    // ================================================================

    /**
     * @notice Transfer custody of a record to another address.
     *         Only the current custodian may transfer.
     */
    function transferCustody(
        RecordType recordType,
        bytes32    id,
        address    to
    ) external {
        require(to != address(0), "Cannot transfer to zero address");

        if (recordType == RecordType.RAW_ORE) {
            RawOre storage r = _rawOres[id];
            require(r.exists, "Ore not found");
            require(r.currentCustodian == msg.sender, "Not custodian");
            address prev = r.currentCustodian;
            r.currentCustodian = to;
            emit CustodyTransferred(recordType, id, prev, to);

        } else if (recordType == RecordType.REFINED_BAR) {
            RefinedBar storage b = _refinedBars[id];
            require(b.exists, "Bar not found");
            require(b.currentCustodian == msg.sender, "Not custodian");
            address prev = b.currentCustodian;
            b.currentCustodian = to;
            emit CustodyTransferred(recordType, id, prev, to);

        } else if (recordType == RecordType.CERTIFIED_PRODUCT) {
            CertifiedProduct storage p = _certifiedProducts[id];
            require(p.exists, "Product not found");
            require(p.currentCustodian == msg.sender, "Not custodian");
            address prev = p.currentCustodian;
            p.currentCustodian = to;
            emit CustodyTransferred(recordType, id, prev, to);

        } else {
            revert("Unknown record type");
        }
    }

    // ================================================================
    // 5. Read Methods
    // ================================================================

    function getRawOre(bytes32 id)
        external view returns (RawOre memory)
    {
        require(_rawOres[id].exists, "Not found");
        return _rawOres[id];
    }

    function getRefinedBar(bytes32 id)
        external view returns (RefinedBar memory)
    {
        require(_refinedBars[id].exists, "Not found");
        return _refinedBars[id];
    }

    function getCertifiedProduct(bytes32 id)
        external view returns (CertifiedProduct memory)
    {
        require(_certifiedProducts[id].exists, "Not found");
        return _certifiedProducts[id];
    }

    function getOrePrivacyCommitment(bytes32 oreId)
        external view returns (uint256)
    {
        require(_rawOres[oreId].exists, "Ore not found");
        return _orePrivacyCommitments[oreId];
    }

    // ================================================================
    // 6. Verification Methods (recompute hash & compare)
    // ================================================================

    /**
     * @notice Recompute the ore hash from the given fields and compare.
     */
    function verifyOre(
        bytes32 id,
        Metal   metal,
        string  calldata mineId,
        string  calldata originCountry,
        string  calldata mineralType,
        uint256 extractedAt,
        uint256 weightGrams,
        string  calldata estimatedGrade,
        address creator
    ) external view returns (bool) {
        require(_rawOres[id].exists, "Not found");
        bytes32 recomputed = keccak256(abi.encode(
            metal, mineId, originCountry, mineralType,
            extractedAt, weightGrams, estimatedGrade, creator
        ));
        return recomputed == id;
    }

    /**
     * @notice Recompute the refined-bar hash and compare.
     */
    function verifyBar(
        bytes32   id,
        bytes32[] calldata oreIds,
        Metal     metal,
        string    calldata refineryId,
        uint256   refinedAt,
        uint256   outputWeightGrams,
        uint256   finenessPPT,
        string    calldata barSerialNumber,
        address   creator
    ) external view returns (bool) {
        require(_refinedBars[id].exists, "Not found");
        bytes32 recomputed = keccak256(abi.encode(
            oreIds, metal, refineryId, refinedAt,
            outputWeightGrams, finenessPPT, barSerialNumber, creator
        ));
        return recomputed == id;
    }

    /**
     * @notice Recompute the certified-product hash and compare.
     */
    function verifyProduct(
        bytes32 id,
        bytes32 inputBarId,
        Metal   metal,
        string  calldata assayerId,
        uint256 certifiedAt,
        uint256 weightGrams,
        uint256 finenessPPT,
        string  calldata hallmark,
        string  calldata sku,
        string  calldata productType,
        address creator
    ) external view returns (bool) {
        require(_certifiedProducts[id].exists, "Not found");
        bytes32 recomputed = keccak256(abi.encode(
            inputBarId, metal, assayerId, certifiedAt,
            weightGrams, finenessPPT, hallmark, sku,
            productType, creator
        ));
        return recomputed == id;
    }

    /**
     * @notice Verify a Groth16 proof that a hidden ore country is in an approved set
     *         and the hidden grade meets a minimum threshold, without revealing either.
     * @dev    Public inputs layout:
     *         [0] commitment, [1] minGrade, [2] approvedCountryA, [3] approvedCountryB, [4] approvedCountryC
     */
    function verifyOreSelectiveDisclosure(
        bytes32 oreId,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) public view returns (bool) {
        require(_rawOres[oreId].exists, "Ore not found");
        require(oreDisclosureVerifier != address(0), "Verifier not configured");
        require(_orePrivacyCommitments[oreId] != 0, "No ore commitment set");
        require(_orePrivacyCommitments[oreId] == input[0], "Commitment mismatch");

        return IOreSelectiveDisclosureVerifier(oreDisclosureVerifier).verifyProof(a, b, c, input);
    }

    function attestOreSelectiveDisclosure(
        bytes32 oreId,
        uint[2] calldata a,
        uint[2][2] calldata b,
        uint[2] calldata c,
        uint[5] calldata input
    ) external returns (bool) {
        bool valid = verifyOreSelectiveDisclosure(oreId, a, b, c, input);
        require(valid, "Invalid selective disclosure proof");

        emit OreSelectiveDisclosureVerified(
            oreId,
            input[1],
            input[2],
            input[3],
            input[4],
            msg.sender
        );

        return true;
    }

    // ================================================================
    // 7.5 Article-mode Root Anchoring
    // ================================================================

    /**
     * @notice Emit a generic hash anchor event.
     * @dev    Stateless anchoring helper so article-mode benchmarks can reuse
     *         this contract instead of deploying a separate EventLogger.
     */
    function logHash(bytes32 id, bytes32 hash) external {
        emit HashAnchored(id, hash, block.timestamp, msg.sender);
    }

    /**
     * @notice Anchor a Merkle root representing a batch of off-chain events.
     * @dev    Mirrors EventLogger.anchorRoot so the private article-mode path
     *         can use this contract as its sole on-chain dependency.
     */
    function anchorRoot(
        bytes32 merkleRoot,
        bytes32 batchIdHash,
        string  calldata scopeType,
        string  calldata scopeId,
        string  calldata schemaVersion,
        string  calldata treeAlgo,
        bytes32 prevChainedRoot,
        bytes32 chainedRoot
    ) external {
        emit RootAnchored(
            merkleRoot,
            batchIdHash,
            scopeType,
            scopeId,
            block.timestamp,
            msg.sender,
            prevChainedRoot,
            chainedRoot
        );

        // Keep unused-parameter intent explicit; they are part of the ABI and event payload semantics.
        schemaVersion;
        treeAlgo;

        emit HashAnchored(batchIdHash, merkleRoot, block.timestamp, msg.sender);
    }

    // ================================================================
    // 8. UNTP Identity & Discovery
    // ================================================================

    /**
     * @notice Set the base URI used to build UNTP-resolvable entity URIs.
     *         e.g. "https://goldprovenance.example.com/"
     *         Full ore URI: {baseURI}ore/{bytes32hex}
     */
    function setBaseURI(string calldata uri)
        external
        onlyRole(ADMIN_ROLE)
    {
        baseURI = uri;
        emit BaseURIUpdated(uri);
    }

    /**
     * @notice Register a did:web identity for the calling wallet.
     *         Stores the DID on-chain so credential verifiers can resolve
     *         the public key of any custodian without a centralised directory.
     * @param  did  W3C DID string, e.g. "did:web:example.com:parties:miner-1"
     */
    function registerPartyDID(string calldata did) external {
        partyDID[msg.sender] = did;
        emit PartyDIDRegistered(msg.sender, did);
    }

    /**
     * @notice Record the URI of a UNTP Digital Conformity Credential (DCC)
     *         on the certified product, making it permanently discoverable
     *         on-chain without relying on any off-chain index.
     * @param  productId  The CertifiedProduct ID.
     * @param  uri        URI of the signed DCC JSON-LD credential.
     */
    function setConformityCredential(bytes32 productId, string calldata uri)
        external
        onlyRole2(ASSAYER_ROLE, ADMIN_ROLE)
    {
        require(_certifiedProducts[productId].exists, "Product not found");
        _certifiedProducts[productId].conformityCredentialURI = uri;
        emit ConformityCredentialSet(productId, uri);
    }

    function setOreDisclosureVerifier(address verifier)
        external
        onlyRole(ADMIN_ROLE)
    {
        require(verifier != address(0), "Verifier required");
        oreDisclosureVerifier = verifier;
        emit OreDisclosureVerifierUpdated(verifier);
    }

    // ================================================================
    // 9. IPFS Certificate Template CIDs  (ADMIN only)
    // ================================================================

    /**
     * @notice Set the IPFS CID of the certificate template for a record type.
     *         Off-chain systems fetch the template by CID, then populate it
     *         with on-chain field values to render a human-readable certificate
     *         (e.g., LBMA Good Delivery certificate, assay report).
     */
    function setTemplateCID(RecordType recordType, string calldata cid)
        external
        onlyRole(ADMIN_ROLE)
    {
        templateCID[recordType] = cid;
        emit TemplateCIDUpdated(recordType, cid);
    }

    function getTemplateCID(RecordType recordType)
        external view returns (string memory)
    {
        return templateCID[recordType];
    }

    // ================================================================
    // 10. Document Root Setters  (attach Merkle root of evidence docs)
    // ================================================================

    /**
     * @notice Attach or update the Merkle document root for a RawOre record.
     * @param oreId       The ore record ID.
     * @param root        Merkle root of the document hashes (must be non-zero).
     * @param manifestCID IPFS CID of the off-chain document manifest (may be empty).
     */
    function setOreDocumentRoot(
        bytes32 oreId,
        bytes32 root,
        string  calldata manifestCID
    )
        external
        onlyRole2(MINER_ROLE, ADMIN_ROLE)
    {
        require(_rawOres[oreId].exists, "Ore not found");
        require(root != bytes32(0), "Root must be non-zero");

        _rawOres[oreId].documentRoot        = root;
        _rawOres[oreId].evidenceManifestCID  = manifestCID;

        emit OreDocumentRootSet(oreId, root, manifestCID);
    }

    /**
     * @notice Attach or update the Merkle document root for a RefinedBar record.
     * @param barId       The bar record ID.
     * @param root        Merkle root of the document hashes (must be non-zero).
     * @param manifestCID IPFS CID of the off-chain document manifest (may be empty).
     */
    function setBarDocumentRoot(
        bytes32 barId,
        bytes32 root,
        string  calldata manifestCID
    )
        external
        onlyRole2(REFINER_ROLE, ADMIN_ROLE)
    {
        require(_refinedBars[barId].exists, "Bar not found");
        require(root != bytes32(0), "Root must be non-zero");

        _refinedBars[barId].documentRoot        = root;
        _refinedBars[barId].evidenceManifestCID  = manifestCID;

        emit BarDocumentRootSet(barId, root, manifestCID);
    }

    /**
     * @notice Attach or update the Merkle document root for a CertifiedProduct record.
     * @param productId   The product record ID.
     * @param root        Merkle root of the document hashes (must be non-zero).
     * @param manifestCID IPFS CID of the off-chain document manifest (may be empty).
     */
    function setProductDocumentRoot(
        bytes32 productId,
        bytes32 root,
        string  calldata manifestCID
    )
        external
        onlyRole2(ASSAYER_ROLE, ADMIN_ROLE)
    {
        require(_certifiedProducts[productId].exists, "Product not found");
        require(root != bytes32(0), "Root must be non-zero");

        _certifiedProducts[productId].documentRoot        = root;
        _certifiedProducts[productId].evidenceManifestCID  = manifestCID;

        emit ProductDocumentRootSet(productId, root, manifestCID);
    }

    // ================================================================
    // 9. Document Root Getters
    // ================================================================

    /// @notice Get the document Merkle root and manifest CID for a RawOre record.
    function getOreDocumentRoot(bytes32 oreId)
        external view returns (bytes32, string memory)
    {
        require(_rawOres[oreId].exists, "Ore not found");
        return (_rawOres[oreId].documentRoot, _rawOres[oreId].evidenceManifestCID);
    }

    /// @notice Get the document Merkle root and manifest CID for a RefinedBar record.
    function getBarDocumentRoot(bytes32 barId)
        external view returns (bytes32, string memory)
    {
        require(_refinedBars[barId].exists, "Bar not found");
        return (_refinedBars[barId].documentRoot, _refinedBars[barId].evidenceManifestCID);
    }

    /// @notice Get the document Merkle root and manifest CID for a CertifiedProduct record.
    function getProductDocumentRoot(bytes32 productId)
        external view returns (bytes32, string memory)
    {
        require(_certifiedProducts[productId].exists, "Product not found");
        return (_certifiedProducts[productId].documentRoot, _certifiedProducts[productId].evidenceManifestCID);
    }

    // ================================================================
    // 10. Document Merkle Proof Verification (OpenZeppelin MerkleProof)
    // ================================================================

    /**
     * @notice Verify that a document leaf belongs to the evidence set of a RawOre.
     * @dev    Leaf must be computed off-chain as:
     *         `keccak256(abi.encode(recordId, docType, fileHash, uriOrCid, version))`
     * @param oreId The ore record ID.
     * @param proof The Merkle proof siblings.
     * @param leaf  The pre-computed leaf hash.
     * @return      True if the proof is valid against the stored document root.
     */
    function verifyOreDocument(
        bytes32          oreId,
        bytes32[] calldata proof,
        bytes32          leaf
    ) external view returns (bool) {
        require(_rawOres[oreId].exists, "Ore not found");
        require(_rawOres[oreId].documentRoot != bytes32(0), "No document root set");
        return MerkleProof.verify(proof, _rawOres[oreId].documentRoot, leaf);
    }

    /**
     * @notice Verify that a document leaf belongs to the evidence set of a RefinedBar.
     * @param barId The bar record ID.
     * @param proof The Merkle proof siblings.
     * @param leaf  The pre-computed leaf hash.
     * @return      True if the proof is valid against the stored document root.
     */
    function verifyBarDocument(
        bytes32          barId,
        bytes32[] calldata proof,
        bytes32          leaf
    ) external view returns (bool) {
        require(_refinedBars[barId].exists, "Bar not found");
        require(_refinedBars[barId].documentRoot != bytes32(0), "No document root set");
        return MerkleProof.verify(proof, _refinedBars[barId].documentRoot, leaf);
    }

    /**
     * @notice Verify that a document leaf belongs to the evidence set of a CertifiedProduct.
     * @param productId The product record ID.
     * @param proof     The Merkle proof siblings.
     * @param leaf      The pre-computed leaf hash.
     * @return          True if the proof is valid against the stored document root.
     */
    function verifyProductDocument(
        bytes32          productId,
        bytes32[] calldata proof,
        bytes32          leaf
    ) external view returns (bool) {
        require(_certifiedProducts[productId].exists, "Product not found");
        require(_certifiedProducts[productId].documentRoot != bytes32(0), "No document root set");
        return MerkleProof.verify(proof, _certifiedProducts[productId].documentRoot, leaf);
    }
}
