/**
 * Traceability Contract Service
 * Wraps the GoldSilverTraceability smart contract for the REST API.
 *
 * When TRACEABILITY_CONTRACT_ADDRESS and PRIVATE_KEY are set the service
 * calls the real on-chain contract.  Otherwise it runs in *simulation mode*
 * and stores records in memory (great for frontend demos without a local node).
 */

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Mongoose schemas for persistent on-chain cache ──────────────────
const OnChainOreSchema = new mongoose.Schema({
  id:               { type: String, required: true, unique: true },
  metal:            { type: Number },
  mineId:           { type: String },
  originCountry:    { type: String },
  mineralType:      { type: String },
  extractedAt:      { type: Number },
  weightGrams:      { type: Number },
  estimatedGrade:   { type: String },
  currentCustodian: { type: String },
  txHash:           { type: String },
  blockNumber:      { type: Number },
}, { timestamps: true });

const OnChainBarSchema = new mongoose.Schema({
  id:               { type: String, required: true, unique: true },
  inputOreIds:      [{ type: String }],
  metal:            { type: Number },
  refineryId:       { type: String },
  refinedAt:        { type: Number },
  outputWeightGrams:{ type: Number },
  finenessPPT:      { type: Number },
  barSerialNumber:  { type: String },
  currentCustodian: { type: String },
  txHash:           { type: String },
  blockNumber:      { type: Number },
}, { timestamps: true });

const OnChainProductSchema = new mongoose.Schema({
  id:               { type: String, required: true, unique: true },
  inputBarId:       { type: String },
  metal:            { type: Number },
  assayerId:        { type: String },
  certifiedAt:      { type: Number },
  weightGrams:      { type: Number },
  finenessPPT:      { type: Number },
  hallmark:         { type: String },
  sku:              { type: String },
  productType:      { type: String },
  currentCustodian: { type: String },
  txHash:           { type: String },
  blockNumber:      { type: Number },
}, { timestamps: true });

const OnChainEventSchema = new mongoose.Schema({
  type:      { type: String, required: true },
  entityId:  { type: String, required: true },
  timestamp: { type: Number },
  txHash:    { type: String },
  blockNumber: { type: Number },
  data:      { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });
OnChainEventSchema.index({ entityId: 1, type: 1 });

const SyncCursorSchema = new mongoose.Schema({
  key:             { type: String, required: true, unique: true },
  lastScannedBlock:{ type: Number, required: true },
  updatedAt:       { type: Date, default: Date.now },
});

// Use mongoose.models to avoid OverwriteModelError on hot-reload
const OnChainOre     = mongoose.models.OnChainOre     || mongoose.model('OnChainOre', OnChainOreSchema);
const OnChainBar     = mongoose.models.OnChainBar     || mongoose.model('OnChainBar', OnChainBarSchema);
const OnChainProduct = mongoose.models.OnChainProduct || mongoose.model('OnChainProduct', OnChainProductSchema);
const OnChainEvent   = mongoose.models.OnChainEvent   || mongoose.model('OnChainEvent', OnChainEventSchema);
const SyncCursor     = mongoose.models.SyncCursor     || mongoose.model('SyncCursor', SyncCursorSchema);

// ── ABI (human-readable subset used by ethers) ─────────────────────
const CONTRACT_ABI = [
  // Roles (constants)
  'function SUPERADMIN_ROLE() view returns (bytes32)',
  'function ADMIN_ROLE() view returns (bytes32)',
  'function MINER_ROLE() view returns (bytes32)',
  'function REFINER_ROLE() view returns (bytes32)',
  'function ASSAYER_ROLE() view returns (bytes32)',
  'function DEALER_ROLE() view returns (bytes32)',
  'function AUDITOR_ROLE() view returns (bytes32)',

  // AccessControl
  'function grantRole(bytes32 role, address account)',
  'function hasRole(bytes32 role, address account) view returns (bool)',

  // Write
  'function registerOre(uint8 metal, string mineId, string originCountry, string mineralType, uint256 extractedAt, uint256 weightGrams, string estimatedGrade) returns (bytes32)',
  'function refine(bytes32[] oreIds, uint8 metal, string refineryId, uint256 refinedAt, uint256 outputWeightGrams, uint256 finenessPPT, string barSerialNumber) returns (bytes32)',
  'function certify(bytes32 inputBarId, uint8 metal, string assayerId, uint256 certifiedAt, uint256 weightGrams, uint256 finenessPPT, string hallmark, string sku, string productType) returns (bytes32)',
  'function transferCustody(uint8 recordType, bytes32 id, address to)',

  // Read
  'function getRawOre(bytes32 id) view returns (tuple(bytes32 id, uint8 metal, string mineId, string originCountry, string mineralType, uint256 extractedAt, uint256 weightGrams, string estimatedGrade, address currentCustodian, bool exists, bytes32 documentRoot, string evidenceManifestCID))',
  'function getRefinedBar(bytes32 id) view returns (tuple(bytes32 id, bytes32[] inputOreIds, uint8 metal, string refineryId, uint256 refinedAt, uint256 outputWeightGrams, uint256 finenessPPT, string barSerialNumber, address currentCustodian, bool exists, bytes32 documentRoot, string evidenceManifestCID))',
  'function getCertifiedProduct(bytes32 id) view returns (tuple(bytes32 id, bytes32 inputBarId, uint8 metal, string assayerId, uint256 certifiedAt, uint256 weightGrams, uint256 finenessPPT, string hallmark, string sku, string productType, address currentCustodian, bool exists, bytes32 documentRoot, string evidenceManifestCID, string conformityCredentialURI))',

  // UNTP — identity & discovery
  'function baseURI() view returns (string)',
  'function partyDID(address) view returns (string)',
  'function setBaseURI(string uri)',
  'function registerPartyDID(string did)',
  'function setConformityCredential(bytes32 productId, string uri)',

  // Document root setters
  'function setOreDocumentRoot(bytes32 oreId, bytes32 root, string manifestCID)',
  'function setBarDocumentRoot(bytes32 barId, bytes32 root, string manifestCID)',
  'function setProductDocumentRoot(bytes32 productId, bytes32 root, string manifestCID)',

  // Document root getters
  'function getOreDocumentRoot(bytes32 oreId) view returns (bytes32, string)',
  'function getBarDocumentRoot(bytes32 barId) view returns (bytes32, string)',
  'function getProductDocumentRoot(bytes32 productId) view returns (bytes32, string)',

  // Document Merkle proof verification
  'function verifyOreDocument(bytes32 oreId, bytes32[] proof, bytes32 leaf) view returns (bool)',
  'function verifyBarDocument(bytes32 barId, bytes32[] proof, bytes32 leaf) view returns (bool)',
  'function verifyProductDocument(bytes32 productId, bytes32[] proof, bytes32 leaf) view returns (bool)',

  // Events
  'event OreExtracted(bytes32 indexed id, uint8 metal, address indexed custodian, string mineId, string originCountry, string mineralType, uint256 extractedAt, uint256 weightGrams, string estimatedGrade)',
  'event BarRefined(bytes32 indexed barId, bytes32[] oreIds, uint8 metal, address indexed custodian, string refineryId, uint256 refinedAt, uint256 outputWeightGrams, uint256 finenessPPT, string barSerialNumber)',
  'event ProductCertified(bytes32 indexed productId, bytes32 indexed barId, uint8 metal, address indexed custodian, string assayerId, uint256 certifiedAt, uint256 weightGrams, uint256 finenessPPT, string hallmark, string sku, string productType)',
  'event CustodyTransferred(uint8 recordType, bytes32 indexed id, address indexed from, address indexed to)',

  // Document root events
  'event OreDocumentRootSet(bytes32 indexed oreId, bytes32 root, string manifestCID)',
  'event BarDocumentRootSet(bytes32 indexed barId, bytes32 root, string manifestCID)',
  'event ProductDocumentRootSet(bytes32 indexed productId, bytes32 root, string manifestCID)',

  // UNTP events
  'event PartyDIDRegistered(address indexed party, string did)',
  'event ConformityCredentialSet(bytes32 indexed productId, string uri)',
  'event BaseURIUpdated(string uri)',
];

// Metal enum maps
const METAL = { GOLD: 0, SILVER: 1 };
const METAL_NAME = ['GOLD', 'SILVER'];
const RECORD_TYPE = { RAW_ORE: 0, REFINED_BAR: 1, CERTIFIED_PRODUCT: 2 };

// Network presets (mirrors anchoring.js)
const NETWORKS = {
  'zkevm-testnet': {
    rpcUrl: 'https://rpc.cardona.zkevm-rpc.com',
    chainId: 2442,
    explorerUrl: 'https://cardona-zkevm.polygonscan.com',
    name: 'Polygon zkEVM Cardona Testnet',
  },
  amoy: {
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    chainId: 80002,
    explorerUrl: 'https://amoy.polygonscan.com',
    name: 'Polygon Amoy Testnet',
  },
  localhost: {
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    explorerUrl: null,
    name: 'Localhost Hardhat',
  },
};

// ────────────────────────────────────────────────────────────────────
// In-memory store (simulation mode OR live-mode cache)
// ────────────────────────────────────────────────────────────────────
const simStore = {
  ores: {},       // id → ore object
  bars: {},       // id → bar object
  products: {},   // id → product object
  events: [],     // chronological event list
};

class TraceabilityContractService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contract = null;
    this.isLive = false;
    this.explorerUrl = null;
    this.networkName = null;
    this._eventsCached = false;  // whether we already scanned past events
  }

  // ── Connect ─────────────────────────────────────────────────────
  async connect() {
    const contractAddr = process.env.TRACEABILITY_CONTRACT_ADDRESS;
    const privateKey = process.env.PRIVATE_KEY;

    // Pick RPC URL: env override → detect from ZKEVM_RPC_URL → Amoy default
    const rpcUrl = process.env.TRACEABILITY_RPC_URL
      || process.env.ZKEVM_RPC_URL
      || process.env.AMOY_RPC_URL
      || process.env.RPC_URL
      || 'https://rpc.cardona.zkevm-rpc.com';

    // Pick explorer URL from env or detect from RPC
    this.explorerUrl = process.env.TRACEABILITY_EXPLORER || null;

    if (!contractAddr || !privateKey) {
      console.log('⛏️  Traceability contract: SIMULATION mode (set TRACEABILITY_CONTRACT_ADDRESS + PRIVATE_KEY for live)');
      this.isLive = false;
      return { simulation: true };
    }

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.contract = new ethers.Contract(contractAddr, CONTRACT_ABI, this.wallet);

      // Gas price configuration
      // NOTE: Polygon Amoy RPC returns an inflated eth_gasPrice (~500 gwei)
      //   but the actual baseFeePerGas is ~0 gwei.  Real txs work fine at 25-30 gwei.
      //   We use baseFee + priority-tip model and NEVER trust eth_gasPrice blindly.
      this._priorityFeeGwei = parseFloat(process.env.TRACEABILITY_GAS_PRICE || '30');   // gwei — tip to validators
      this._maxGasPriceGwei = parseFloat(process.env.TRACEABILITY_MAX_GAS_PRICE || '50');  // gwei — hard cap
      this._maxTxCostPOL    = parseFloat(process.env.TRACEABILITY_MAX_TX_COST   || '0.02'); // POL — hard cap per tx

      // Auto-detect explorer from chainId
      const { chainId } = await this.provider.getNetwork();
      const net = Object.values(NETWORKS).find(n => BigInt(n.chainId) === chainId);
      if (net) {
        this.networkName = net.name;
        if (!this.explorerUrl) this.explorerUrl = net.explorerUrl;
      } else {
        this.networkName = `Chain ${chainId}`;
      }

      this.isLive = true;
      console.log(`⛏️  Traceability contract: LIVE at ${contractAddr}`);
      console.log(`   Network : ${this.networkName}`);
      console.log(`   Wallet  : ${this.wallet.address}`);
      console.log(`   Explorer: ${this.explorerUrl || '(none)'}`);
      console.log(`   Gas     : ${this._priorityFeeGwei} gwei priority (cap ${this._maxGasPriceGwei} gwei / ${this._maxTxCostPOL} POL per tx)`);

      // Pre-load historical events into cache (async, non-blocking)
      this._loadPastEvents().catch(e => console.warn('⛏️  Event scan warning:', e.message));

      return { simulation: false, address: contractAddr, wallet: this.wallet.address, network: this.networkName };
    } catch (err) {
      console.error('⛏️  Traceability contract connection failed:', err.message);
      this.isLive = false;
      return { simulation: true, error: err.message };
    }
  }

  // ── Status ──────────────────────────────────────────────────────
  status() {
    return {
      live: this.isLive,
      contractAddress: this.contract?.target || null,
      wallet: this.wallet?.address || null,
      simulation: !this.isLive,
      network: this.networkName || null,
      explorerUrl: this.explorerUrl || null,
      oreCount: Object.keys(simStore.ores).length,
      barCount: Object.keys(simStore.bars).length,
      productCount: Object.keys(simStore.products).length,
      eventCount: simStore.events.length,
      gasConfig: this.isLive ? {
        priorityFeeGwei: this._priorityFeeGwei,
        maxGasPriceGwei: this._maxGasPriceGwei,
        maxTxCostPOL: this._maxTxCostPOL,
      } : null,
    };
  }

  // ── Helper: build explorer link ─────────────────────────────────
  _txLink(hash) {
    if (!hash || !this.explorerUrl) return null;
    return `${this.explorerUrl}/tx/${hash}`;
  }

  _addrLink(addr) {
    if (!addr || !this.explorerUrl) return null;
    return `${this.explorerUrl}/address/${addr}`;
  }

  // ── Gas safety guard ────────────────────────────────────────────
  /**
   * Build EIP-1559 tx overrides using real baseFee + configured priority tip.
   *
   * WHY: Polygon Amoy's eth_gasPrice RPC returns an inflated ~500 gwei,
   *   but the actual baseFeePerGas is ~0 gwei. Real txs at 25-30 gwei tip
   *   get included instantly.  Using getFeeData().gasPrice would 16× overpay.
   *
   * APPROACH:
   * 1. Read baseFeePerGas from the latest block (real: ~0 on Amoy)
   * 2. Use configured _priorityFeeGwei as the tip (default 30)
   * 3. Cap total gas price (baseFee + priority) at _maxGasPriceGwei
   * 4. Estimate gas units for the specific call
   * 5. Reject if total cost > _maxTxCostPOL
   */
  async _buildSafeTxOverrides(methodName, args) {
    // Get real baseFee from latest block (NOT from the inflated eth_gasPrice)
    const latestBlock = await this.provider.getBlock('latest');
    const baseFee = latestBlock?.baseFeePerGas ?? 0n;
    const baseFeeGwei = Number(ethers.formatUnits(baseFee, 'gwei'));

    // Priority tip — configured, defaults to 30 gwei
    const priorityFeeWei = ethers.parseUnits(String(this._priorityFeeGwei), 'gwei');

    // Total effective gas price = baseFee + priority
    const effectiveGasPrice = baseFee + priorityFeeWei;
    const effectiveGwei = Number(ethers.formatUnits(effectiveGasPrice, 'gwei'));

    // Cap check
    const maxGasPriceWei = ethers.parseUnits(String(this._maxGasPriceGwei), 'gwei');
    const wasCapped = effectiveGasPrice > maxGasPriceWei;
    const finalGasPrice = wasCapped ? maxGasPriceWei : effectiveGasPrice;
    const finalGwei = Number(ethers.formatUnits(finalGasPrice, 'gwei'));

    if (wasCapped) {
      console.warn(`⛏️  ⚠ Gas price ${effectiveGwei.toFixed(1)} gwei exceeds cap ${this._maxGasPriceGwei} gwei — capping`);
    }

    // EIP-1559 overrides: maxFeePerGas and maxPriorityFeePerGas
    // maxFeePerGas = baseFee * 2 + priority (gives headroom for base fee fluctuations)
    const maxFee = wasCapped ? maxGasPriceWei : baseFee * 2n + priorityFeeWei;
    const txOverrides = {
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: wasCapped
        ? maxGasPriceWei - baseFee > 0n ? maxGasPriceWei - baseFee : maxGasPriceWei
        : priorityFeeWei,
    };

    // Estimate gas units
    let gasEstimate;
    try {
      gasEstimate = await this.contract[methodName].estimateGas(...args, txOverrides);
    } catch (estErr) {
      // If the error is a contract revert, surface it immediately instead of
      // wasting gas on a transaction that will fail on-chain.
      const reason = estErr?.reason || estErr?.revert?.name;
      if (reason || estErr?.code === 'CALL_EXCEPTION') {
        throw new Error(reason || `Contract call would revert: ${methodName} — ${estErr.message?.slice(0, 150)}`);
      }
      // Non-revert error (RPC flake, network issue) — use a safe fallback
      console.warn(`⛏️  ⚠ Gas estimate RPC error for ${methodName}, using fallback:`, estErr.message?.slice(0, 80));
      gasEstimate = 300000n;
    }
    txOverrides.gasLimit = gasEstimate * 130n / 100n; // 30% buffer

    // Calculate estimated total cost (using effective = baseFee + priority, not maxFee)
    const estimatedCostWei = gasEstimate * finalGasPrice;
    const estimatedCostPOL = Number(ethers.formatEther(estimatedCostWei));

    // Reject if total cost exceeds max
    if (estimatedCostPOL > this._maxTxCostPOL) {
      throw new Error(
        `⛽ Transaction too expensive! Estimated ${estimatedCostPOL.toFixed(6)} POL ` +
        `(baseFee: ${baseFeeGwei.toFixed(2)} + tip: ${this._priorityFeeGwei} = ${finalGwei.toFixed(1)} gwei × ${gasEstimate} units). ` +
        `Max allowed: ${this._maxTxCostPOL} POL. ` +
        `Try again later when gas is cheaper, or raise TRACEABILITY_MAX_TX_COST.`
      );
    }

    console.log(
      `⛏️  Gas: baseFee ${baseFeeGwei.toFixed(2)} + tip ${this._priorityFeeGwei} = ${finalGwei.toFixed(1)} gwei` +
      `${wasCapped ? ' (CAPPED)' : ''}` +
      ` × ${gasEstimate} units ≈ ${estimatedCostPOL.toFixed(6)} POL`
    );

    return {
      overrides: txOverrides,
      estimate: {
        baseFeeGwei: Math.round(baseFeeGwei * 100) / 100,
        priorityFeeGwei: this._priorityFeeGwei,
        gasPriceGwei: Math.round(finalGwei * 100) / 100,
        gasPriceCapped: wasCapped,
        gasUnits: Number(gasEstimate),
        estimatedCostPOL: Math.round(estimatedCostPOL * 1e6) / 1e6,
      },
    };
  }

  /** Extract actual gas info from a mined receipt */
  _receiptGasInfo(receipt) {
    const gasUsed = Number(receipt.gasUsed);
    const effectiveGasPrice = receipt.gasPrice ?? receipt.effectiveGasPrice ?? 0n;
    const gasPriceGwei = Number(ethers.formatUnits(effectiveGasPrice, 'gwei'));
    const txCostWei = receipt.gasUsed * effectiveGasPrice;
    const txCostPOL = Number(ethers.formatEther(txCostWei));
    return {
      gasUsed,
      gasPriceGwei: Math.round(gasPriceGwei * 100) / 100,
      txCostPOL: Math.round(txCostPOL * 1e6) / 1e6,
    };
  }

  /** Public: current gas info + wallet balance.
   *  Uses real baseFeePerGas from latest block — NOT the inflated eth_gasPrice. */
  async getGasInfo() {
    if (!this.isLive) return { simulation: true };
    try {
      const [latestBlock, balance] = await Promise.all([
        this.provider.getBlock('latest'),
        this.provider.getBalance(this.wallet.address),
      ]);
      const baseFee = latestBlock?.baseFeePerGas ?? 0n;
      const baseFeeGwei = Number(ethers.formatUnits(baseFee, 'gwei'));
      const effectiveGwei = baseFeeGwei + this._priorityFeeGwei;
      const balancePOL = Number(ethers.formatEther(balance));
      // Estimate how many txs the wallet can afford (~220k gas per tx)
      const estTxCost = effectiveGwei * 220000 / 1e9;  // POL per tx
      const estTxsLeft = estTxCost > 0 ? Math.floor(balancePOL / estTxCost) : 999;
      return {
        baseFeeGwei: Math.round(baseFeeGwei * 1000) / 1000,
        priorityFeeGwei: this._priorityFeeGwei,
        gasPriceGwei: Math.round(effectiveGwei * 100) / 100,  // baseFee + tip
        maxGasPriceGwei: this._maxGasPriceGwei,
        maxTxCostPOL: this._maxTxCostPOL,
        walletBalancePOL: Math.round(balancePOL * 1e6) / 1e6,
        estimatedTxCostPOL: Math.round(estTxCost * 1e6) / 1e6,
        estimatedTxsRemaining: estTxsLeft,
        gasPriceStatus: effectiveGwei > this._maxGasPriceGwei ? 'high'
          : effectiveGwei > this._maxGasPriceGwei * 0.7 ? 'elevated' : 'normal',
      };
    } catch (e) {
      return { error: e.message };
    }
  }

  // ── Load past on-chain events into cache (live mode) ────────────
  // 1. Loads all previously-saved records from MongoDB (instant).
  // 2. Reads the sync-cursor to know the last scanned block.
  // 3. Only scans NEW blocks from chain in 10 000-block chunks.
  // 4. Persists any new finds to MongoDB + updates the cursor.
  async _loadPastEvents() {
    if (!this.isLive || this._eventsCached) return;
    const CURSOR_KEY = `traceability-${this.contract.target}`;
    const isMongoConnected = mongoose.connection.readyState === 1;

    try {
      // ── Step 1: Restore from MongoDB ────────────────────────────
      if (isMongoConnected) {
        // Check if we have a cursor for the CURRENT contract address.
        // If not, this is a fresh deployment — purge all stale on-chain cache
        // so that records from a previous contract don't appear in the UI.
        const existingCursor = await SyncCursor.findOne({ key: CURSOR_KEY }).lean();
        if (!existingCursor) {
          const deleted = await Promise.all([
            OnChainOre.deleteMany({}),
            OnChainBar.deleteMany({}),
            OnChainProduct.deleteMany({}),
            OnChainEvent.deleteMany({}),
            SyncCursor.deleteMany({ key: { $ne: CURSOR_KEY } }),
          ]);
          console.log(`⛏️  New contract detected — purged stale cache (${deleted[0].deletedCount} ores, ${deleted[1].deletedCount} bars, ${deleted[2].deletedCount} products, ${deleted[3].deletedCount} events)`);
        } else {
          const [dbOres, dbBars, dbProducts, dbEvents] = await Promise.all([
            OnChainOre.find().lean(),
            OnChainBar.find().lean(),
            OnChainProduct.find().lean(),
            OnChainEvent.find().sort({ timestamp: 1 }).lean(),
          ]);

          for (const o of dbOres) simStore.ores[o.id] = { ...o, exists: true };
          for (const b of dbBars) simStore.bars[b.id] = { ...b, exists: true };
          for (const p of dbProducts) simStore.products[p.id] = { ...p, exists: true };
          for (const e of dbEvents) simStore.events.push({ type: e.type, id: e.entityId, timestamp: e.timestamp, data: e.data, txHash: e.txHash });

          console.log(`⛏️  DB cache: ${dbOres.length} ores, ${dbBars.length} bars, ${dbProducts.length} products restored`);
        }
      }

      // ── Step 2: Determine scan range ────────────────────────────
      const currentBlock = await this.provider.getBlockNumber();
      let fromBlock;

      if (isMongoConnected) {
        const cursor = await SyncCursor.findOne({ key: CURSOR_KEY }).lean();
        if (cursor) {
          fromBlock = cursor.lastScannedBlock + 1;
        } else {
          // First time: scan from deploy block
          const deployBlock = parseInt(process.env.TRACEABILITY_DEPLOY_BLOCK || '0', 10);
          fromBlock = deployBlock > 0 ? deployBlock : Math.max(0, currentBlock - 10000);
        }
      } else {
        // No MongoDB — full scan
        const deployBlock = parseInt(process.env.TRACEABILITY_DEPLOY_BLOCK || '0', 10);
        fromBlock = deployBlock > 0 ? deployBlock : Math.max(0, currentBlock - 10000);
      }

      if (fromBlock > currentBlock) {
        console.log(`⛏️  Chain is up-to-date (block ${currentBlock})`);
        this._eventsCached = true;
        return;
      }

      // ── Step 3: Scan only new blocks in chunks ──────────────────
      console.log(`⛏️  Scanning new blocks ${fromBlock}→${currentBlock} …`);
      // Public Polygon/zkEVM RPCs typically cap at ~2 000 blocks per eth_getLogs
      // call. Start conservatively; the retry helper will halve further if needed.
      const CHUNK = parseInt(process.env.TRACEABILITY_CHUNK_SIZE || '2000', 10);
      let newOre = 0, newBar = 0, newProd = 0;

      // Query a filter with automatic chunk-halving on block-range errors.
      const queryWithRetry = async (filter, start, end, label) => {
        let chunkSize = end - start + 1;
        let results = [];
        let cursor = start;
        while (cursor <= end) {
          const chunkEnd = Math.min(cursor + chunkSize - 1, end);
          try {
            const logs = await this.contract.queryFilter(filter, cursor, chunkEnd);
            results = results.concat(logs);
            cursor = chunkEnd + 1;
          } catch (e) {
            const isRangeError = e.code === -32000
              || (e.message && (e.message.includes('block range') || e.message.includes('coalesce')));
            if (isRangeError && chunkSize > 1) {
              chunkSize = Math.max(1, Math.floor(chunkSize / 2));
              console.warn(`⛏️  ${label} chunk ${cursor}-${chunkEnd}: range too large, retrying with ${chunkSize}-block chunks`);
            } else {
              console.warn(`⛏️  ${label} chunk ${cursor}-${chunkEnd}:`, e.message.slice(0, 80));
              cursor = chunkEnd + 1; // skip unrecoverable chunk
            }
          }
        }
        return results;
      };

      for (let start = fromBlock; start <= currentBlock; start += CHUNK) {
        const end = Math.min(start + CHUNK - 1, currentBlock);

        // Ore events
        const oreLogs = await queryWithRetry(this.contract.filters.OreExtracted(), start, end, 'Ore');
        for (const log of oreLogs) {
          const a = log.args;
          const ore = {
            id: a[0], metal: Number(a[1]), mineId: a[3], originCountry: a[4],
            mineralType: a[5], extractedAt: Number(a[6]), weightGrams: Number(a[7]),
            estimatedGrade: a[8], currentCustodian: a[2],
            exists: true, txHash: log.transactionHash, blockNumber: log.blockNumber,
          };
          if (!simStore.ores[ore.id]) {
            simStore.ores[ore.id] = ore;
            simStore.events.push({ type: 'OreExtracted', id: ore.id, timestamp: ore.extractedAt, data: ore, txHash: log.transactionHash });
            if (isMongoConnected) await this._persistOre(ore, log.blockNumber);
            newOre++;
          }
        }

        // Bar events
        const barLogs = await queryWithRetry(this.contract.filters.BarRefined(), start, end, 'Bar');
        for (const log of barLogs) {
          const a = log.args;
          const bar = {
            id: a[0], inputOreIds: [...(a[1] || [])], metal: Number(a[2]),
            refineryId: a[4], refinedAt: Number(a[5]),
            outputWeightGrams: Number(a[6]), finenessPPT: Number(a[7]),
            barSerialNumber: a[8], currentCustodian: a[3],
            exists: true, txHash: log.transactionHash, blockNumber: log.blockNumber,
          };
          if (!simStore.bars[bar.id]) {
            simStore.bars[bar.id] = bar;
            simStore.events.push({ type: 'BarRefined', id: bar.id, timestamp: bar.refinedAt, data: bar, txHash: log.transactionHash });
            if (isMongoConnected) await this._persistBar(bar, log.blockNumber);
            newBar++;
          }
        }

        // Product events
        const prodLogs = await queryWithRetry(this.contract.filters.ProductCertified(), start, end, 'Product');
        for (const log of prodLogs) {
          const a = log.args;
          const prod = {
            id: a[0], inputBarId: a[1], metal: Number(a[2]),
            assayerId: a[4], certifiedAt: Number(a[5]),
            weightGrams: Number(a[6]), finenessPPT: Number(a[7]),
            hallmark: a[8], sku: a[9], productType: a[10],
            currentCustodian: a[3],
            exists: true, txHash: log.transactionHash, blockNumber: log.blockNumber,
          };
          if (!simStore.products[prod.id]) {
            simStore.products[prod.id] = prod;
            simStore.events.push({ type: 'ProductCertified', id: prod.id, timestamp: prod.certifiedAt, data: prod, txHash: log.transactionHash });
            if (isMongoConnected) await this._persistProduct(prod, log.blockNumber);
            newProd++;
          }
        }
      }

      // ── Step 4: Update sync cursor ──────────────────────────────
      if (isMongoConnected) {
        await SyncCursor.findOneAndUpdate(
          { key: CURSOR_KEY },
          { lastScannedBlock: currentBlock, updatedAt: new Date() },
          { upsert: true },
        );
      }

      simStore.events.sort((a, b) => a.timestamp - b.timestamp);
      this._eventsCached = true;
      console.log(`⛏️  Scan done: ${newOre} new ores, ${newBar} new bars, ${newProd} new products (blocks ${fromBlock}→${currentBlock})`);
    } catch (err) {
      console.warn('⛏️  Event scan failure:', err.message);
      this._eventsCached = true;  // still mark cached so in-memory data is served
    }
  }

  // ── DB persistence helpers ──────────────────────────────────────
  async _persistOre(ore, blockNumber) {
    try {
      await OnChainOre.findOneAndUpdate(
        { id: ore.id },
        { ...ore, blockNumber, exists: undefined },
        { upsert: true, new: true },
      );
      await OnChainEvent.findOneAndUpdate(
        { entityId: ore.id, type: 'OreExtracted' },
        { type: 'OreExtracted', entityId: ore.id, timestamp: ore.extractedAt, txHash: ore.txHash, blockNumber, data: ore },
        { upsert: true },
      );
    } catch (e) { console.warn('⛏️  Persist ore error:', e.message); }
  }

  async _persistBar(bar, blockNumber) {
    try {
      await OnChainBar.findOneAndUpdate(
        { id: bar.id },
        { ...bar, blockNumber, exists: undefined },
        { upsert: true, new: true },
      );
      await OnChainEvent.findOneAndUpdate(
        { entityId: bar.id, type: 'BarRefined' },
        { type: 'BarRefined', entityId: bar.id, timestamp: bar.refinedAt, txHash: bar.txHash, blockNumber, data: bar },
        { upsert: true },
      );
    } catch (e) { console.warn('⛏️  Persist bar error:', e.message); }
  }

  async _persistProduct(prod, blockNumber) {
    try {
      await OnChainProduct.findOneAndUpdate(
        { id: prod.id },
        { ...prod, blockNumber, exists: undefined },
        { upsert: true, new: true },
      );
      await OnChainEvent.findOneAndUpdate(
        { entityId: prod.id, type: 'ProductCertified' },
        { type: 'ProductCertified', entityId: prod.id, timestamp: prod.certifiedAt, txHash: prod.txHash, blockNumber, data: prod },
        { upsert: true },
      );
    } catch (e) { console.warn('⛏️  Persist product error:', e.message); }
  }

  async _updateCursor(blockNumber) {
    if (mongoose.connection.readyState !== 1) return;
    const key = `traceability-${this.contract?.target || 'unknown'}`;
    try {
      await SyncCursor.findOneAndUpdate(
        { key },
        { $max: { lastScannedBlock: blockNumber }, updatedAt: new Date() },
        { upsert: true },
      );
    } catch (e) { /* non-critical */ }
  }

  // ── 1. Register Ore ─────────────────────────────────────────────
  async registerOre({ metal, mineId, originCountry, mineralType, weightGrams, estimatedGrade }) {
    const metalEnum = typeof metal === 'string' ? METAL[metal.toUpperCase()] : metal;
    const extractedAt = Math.floor(Date.now() / 1000);

    if (this.isLive) {
      const callArgs = [metalEnum, mineId, originCountry, mineralType, extractedAt, weightGrams, estimatedGrade];
      const { overrides, estimate } = await this._buildSafeTxOverrides('registerOre', callArgs);
      const tx = await this.contract.registerOre(...callArgs, overrides);
      const receipt = await tx.wait();
      const gasInfo = this._receiptGasInfo(receipt);
      const event = receipt.logs.find(l => l.fragment?.name === 'OreExtracted');
      const id = event?.args?.[0] || receipt.logs[0]?.topics?.[1];
      const ore = {
        id, metal: metalEnum, mineId, originCountry, mineralType,
        extractedAt, weightGrams, estimatedGrade,
        currentCustodian: this.wallet.address,
        txHash: receipt.hash, blockNumber: receipt.blockNumber,
      };
      console.log(`⛏️  ✅ registerOre: ${gasInfo.gasUsed} gas × ${gasInfo.gasPriceGwei} gwei = ${gasInfo.txCostPOL} POL`);
      // Cache locally + persist to MongoDB
      simStore.ores[id] = { ...ore, exists: true };
      simStore.events.push({ type: 'OreExtracted', id, timestamp: extractedAt, data: ore, txHash: receipt.hash });
      this._persistOre(ore, receipt.blockNumber).catch(() => {});
      this._updateCursor(receipt.blockNumber).catch(() => {});
      return { ...this._formatOre(ore), gasInfo };
    }

    // Simulation
    const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint8', 'string', 'string', 'string', 'uint256', 'uint256', 'string', 'address'],
      [metalEnum, mineId, originCountry, mineralType, extractedAt, weightGrams, estimatedGrade, '0x0000000000000000000000000000000000000001'],
    ));
    const ore = {
      id, metal: metalEnum, mineId, originCountry, mineralType,
      extractedAt, weightGrams: Number(weightGrams), estimatedGrade,
      currentCustodian: '0x0000000000000000000000000000000000000001',
      exists: true, txHash: `sim-${id.slice(0, 10)}`,
    };
    simStore.ores[id] = ore;
    simStore.events.push({ type: 'OreExtracted', id, timestamp: extractedAt, data: ore });
    return this._formatOre(ore);
  }

  // ── 2. Refine ───────────────────────────────────────────────────
  async refine({ oreIds, metal, refineryId, outputWeightGrams, finenessPPT, barSerialNumber }) {
    const metalEnum = typeof metal === 'string' ? METAL[metal.toUpperCase()] : metal;
    const refinedAt = Math.floor(Date.now() / 1000);

    if (this.isLive) {
      const callArgs = [oreIds, metalEnum, refineryId, refinedAt, outputWeightGrams, finenessPPT, barSerialNumber];
      const { overrides, estimate } = await this._buildSafeTxOverrides('refine', callArgs);
      const tx = await this.contract.refine(...callArgs, overrides);
      const receipt = await tx.wait();
      const gasInfo = this._receiptGasInfo(receipt);
      const event = receipt.logs.find(l => l.fragment?.name === 'BarRefined');
      const barId = event?.args?.[0] || receipt.logs[0]?.topics?.[1];
      const bar = {
        id: barId, inputOreIds: oreIds, metal: metalEnum, refineryId,
        refinedAt, outputWeightGrams, finenessPPT, barSerialNumber,
        currentCustodian: this.wallet.address, txHash: receipt.hash, blockNumber: receipt.blockNumber,
      };
      console.log(`⛏️  ✅ refine: ${gasInfo.gasUsed} gas × ${gasInfo.gasPriceGwei} gwei = ${gasInfo.txCostPOL} POL`);
      simStore.bars[barId] = { ...bar, exists: true };
      simStore.events.push({ type: 'BarRefined', id: barId, timestamp: refinedAt, data: bar, txHash: receipt.hash });
      this._persistBar(bar, receipt.blockNumber).catch(() => {});
      this._updateCursor(receipt.blockNumber).catch(() => {});
      return { ...this._formatBar(bar), gasInfo };
    }

    // Simulation
    for (const oid of oreIds) {
      if (!simStore.ores[oid]) throw new Error(`Input ore ${oid} not found`);
    }
    const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32[]', 'uint8', 'string', 'uint256', 'uint256', 'uint256', 'string', 'address'],
      [oreIds, metalEnum, refineryId, refinedAt, outputWeightGrams, finenessPPT, barSerialNumber, '0x0000000000000000000000000000000000000001'],
    ));
    const bar = {
      id, inputOreIds: oreIds, metal: metalEnum, refineryId,
      refinedAt, outputWeightGrams: Number(outputWeightGrams),
      finenessPPT: Number(finenessPPT), barSerialNumber,
      currentCustodian: '0x0000000000000000000000000000000000000001',
      exists: true, txHash: `sim-${id.slice(0, 10)}`,
    };
    simStore.bars[id] = bar;
    simStore.events.push({ type: 'BarRefined', id, timestamp: refinedAt, data: bar });
    return this._formatBar(bar);
  }

  // ── 3. Certify ──────────────────────────────────────────────────
  async certify({ inputBarId, metal, assayerId, weightGrams, finenessPPT, hallmark, sku, productType }) {
    const metalEnum = typeof metal === 'string' ? METAL[metal.toUpperCase()] : metal;
    const certifiedAt = Math.floor(Date.now() / 1000);

    if (this.isLive) {
      const callArgs = [inputBarId, metalEnum, assayerId, certifiedAt, weightGrams, finenessPPT, hallmark, sku, productType];
      const { overrides, estimate } = await this._buildSafeTxOverrides('certify', callArgs);
      const tx = await this.contract.certify(...callArgs, overrides);
      const receipt = await tx.wait();
      const gasInfo = this._receiptGasInfo(receipt);
      const event = receipt.logs.find(l => l.fragment?.name === 'ProductCertified');
      const productId = event?.args?.[0] || receipt.logs[0]?.topics?.[1];
      const product = {
        id: productId, inputBarId, metal: metalEnum, assayerId,
        certifiedAt, weightGrams, finenessPPT, hallmark, sku, productType,
        currentCustodian: this.wallet.address, txHash: receipt.hash, blockNumber: receipt.blockNumber,
      };
      console.log(`⛏️  ✅ certify: ${gasInfo.gasUsed} gas × ${gasInfo.gasPriceGwei} gwei = ${gasInfo.txCostPOL} POL`);
      simStore.products[productId] = { ...product, exists: true };
      simStore.events.push({ type: 'ProductCertified', id: productId, timestamp: certifiedAt, data: product, txHash: receipt.hash });
      this._persistProduct(product, receipt.blockNumber).catch(() => {});
      this._updateCursor(receipt.blockNumber).catch(() => {});
      return { ...this._formatProduct(product), gasInfo };
    }

    // Simulation
    if (!simStore.bars[inputBarId]) throw new Error(`Bar ${inputBarId} not found`);
    const id = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint8', 'string', 'uint256', 'uint256', 'uint256', 'string', 'string', 'string', 'address'],
      [inputBarId, metalEnum, assayerId, certifiedAt, weightGrams, finenessPPT, hallmark, sku, productType, '0x0000000000000000000000000000000000000001'],
    ));
    const product = {
      id, inputBarId, metal: metalEnum, assayerId,
      certifiedAt, weightGrams: Number(weightGrams),
      finenessPPT: Number(finenessPPT), hallmark, sku, productType,
      currentCustodian: '0x0000000000000000000000000000000000000001',
      exists: true, txHash: `sim-${id.slice(0, 10)}`,
    };
    simStore.products[id] = product;
    simStore.events.push({ type: 'ProductCertified', id, timestamp: certifiedAt, data: product });
    return this._formatProduct(product);
  }

  // ── 4. Lookup (read) ────────────────────────────────────────────
  async getOre(id) {
    if (this.isLive) {
      try {
        const raw = await this.contract.getRawOre(id);
        return this._formatOre(raw);
      } catch { /* fall through to cache */ }
    }
    const ore = simStore.ores[id];
    if (!ore) throw new Error('Ore not found');
    return this._formatOre(ore);
  }

  async getBar(id) {
    if (this.isLive) {
      try {
        const raw = await this.contract.getRefinedBar(id);
        return this._formatBar(raw);
      } catch { /* fall through to cache */ }
    }
    const bar = simStore.bars[id];
    if (!bar) throw new Error('Bar not found');
    return this._formatBar(bar);
  }

  async getProduct(id) {
    if (this.isLive) {
      try {
        const raw = await this.contract.getCertifiedProduct(id);
        return this._formatProduct(raw);
      } catch { /* fall through to cache */ }
    }
    const p = simStore.products[id];
    if (!p) throw new Error('Product not found');
    return this._formatProduct(p);
  }

  // ── 5. List all (cache + on-chain events) ───────────────────────
  listOres()    { return Object.values(simStore.ores).map(o => this._formatOre(o)); }
  listBars()    { return Object.values(simStore.bars).map(b => this._formatBar(b)); }
  listProducts(){ return Object.values(simStore.products).map(p => this._formatProduct(p)); }
  listEvents()  { return simStore.events.map(e => ({ ...e, explorerUrl: this._txLink(e.txHash) })); }

  // ── Formatters ──────────────────────────────────────────────────
  _formatOre(o) {
    const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
    return {
      id: o.id,
      stage: 'RAW_ORE',
      metal: METAL_NAME[Number(o.metal)] || 'GOLD',
      mineId: o.mineId,
      originCountry: o.originCountry,
      mineralType: o.mineralType,
      extractedAt: Number(o.extractedAt),
      weightGrams: Number(o.weightGrams),
      estimatedGrade: o.estimatedGrade,
      currentCustodian: o.currentCustodian,
      txHash: o.txHash || null,
      explorerUrl: this._txLink(o.txHash),
      documentRoot: o.documentRoot && o.documentRoot !== ZERO_BYTES32 ? o.documentRoot : null,
      evidenceManifestCID: o.evidenceManifestCID || null,
    };
  }

  _formatBar(b) {
    const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
    return {
      id: b.id,
      stage: 'REFINED_BAR',
      inputOreIds: Array.isArray(b.inputOreIds) ? [...b.inputOreIds] : [],
      metal: METAL_NAME[Number(b.metal)] || 'GOLD',
      refineryId: b.refineryId,
      refinedAt: Number(b.refinedAt),
      outputWeightGrams: Number(b.outputWeightGrams),
      finenessPPT: Number(b.finenessPPT),
      barSerialNumber: b.barSerialNumber,
      currentCustodian: b.currentCustodian,
      txHash: b.txHash || null,
      explorerUrl: this._txLink(b.txHash),
      documentRoot: b.documentRoot && b.documentRoot !== ZERO_BYTES32 ? b.documentRoot : null,
      evidenceManifestCID: b.evidenceManifestCID || null,
    };
  }

  _formatProduct(p) {
    const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
    return {
      id: p.id,
      stage: 'CERTIFIED_PRODUCT',
      inputBarId: p.inputBarId,
      metal: METAL_NAME[Number(p.metal)] || 'GOLD',
      assayerId: p.assayerId,
      certifiedAt: Number(p.certifiedAt),
      weightGrams: Number(p.weightGrams),
      finenessPPT: Number(p.finenessPPT),
      hallmark: p.hallmark,
      sku: p.sku,
      productType: p.productType,
      currentCustodian: p.currentCustodian,
      txHash: p.txHash || null,
      explorerUrl: this._txLink(p.txHash),
      documentRoot: p.documentRoot && p.documentRoot !== ZERO_BYTES32 ? p.documentRoot : null,
      evidenceManifestCID: p.evidenceManifestCID || null,
    };
  }

  // ── Document Root Operations ────────────────────────────────────

  /**
   * Set the Merkle document root for an on-chain record.
   * @param {'ore'|'bar'|'product'} recordType
   * @param {string} recordId   bytes32 record ID
   * @param {string} root       bytes32 Merkle root
   * @param {string} manifestCID  optional IPFS CID
   */
  async setDocumentRoot(recordType, recordId, root, manifestCID = '') {
    const methodMap = { ore: 'setOreDocumentRoot', bar: 'setBarDocumentRoot', product: 'setProductDocumentRoot' };
    const method = methodMap[recordType];
    if (!method) throw new Error(`Unknown record type: ${recordType}`);

    if (this.isLive) {
      const callArgs = [recordId, root, manifestCID];

      // Pre-flight: staticCall to get a clear revert reason before spending gas
      try {
        await this.contract[method].staticCall(...callArgs);
      } catch (preErr) {
        const reason = preErr?.reason || preErr?.revert?.name || preErr?.message?.slice(0, 200);
        throw new Error(`${method} would revert: ${reason}`);
      }

      const { overrides } = await this._buildSafeTxOverrides(method, callArgs);
      const tx = await this.contract[method](...callArgs, overrides);
      const receipt = await tx.wait();
      const gasInfo = this._receiptGasInfo(receipt);
      console.log(`⛏️  ✅ ${method}: ${gasInfo.gasUsed} gas × ${gasInfo.gasPriceGwei} gwei = ${gasInfo.txCostPOL} POL`);

      // Update local cache
      const store = recordType === 'ore' ? simStore.ores : recordType === 'bar' ? simStore.bars : simStore.products;
      if (store[recordId]) {
        store[recordId].documentRoot = root;
        store[recordId].evidenceManifestCID = manifestCID;
      }

      return { recordType, recordId, root, manifestCID, txHash: receipt.hash, explorerUrl: this._txLink(receipt.hash), gasInfo };
    }

    // Simulation
    const store = recordType === 'ore' ? simStore.ores : recordType === 'bar' ? simStore.bars : simStore.products;
    if (!store[recordId]) throw new Error(`${recordType} ${recordId} not found`);
    store[recordId].documentRoot = root;
    store[recordId].evidenceManifestCID = manifestCID;
    return { recordType, recordId, root, manifestCID, txHash: `sim-docroot-${recordId.slice(0, 10)}`, explorerUrl: null };
  }

  /**
   * Get document root for an on-chain record.
   */
  async getDocumentRoot(recordType, recordId) {
    const methodMap = { ore: 'getOreDocumentRoot', bar: 'getBarDocumentRoot', product: 'getProductDocumentRoot' };
    const method = methodMap[recordType];
    if (!method) throw new Error(`Unknown record type: ${recordType}`);

    if (this.isLive) {
      try {
        const [root, cid] = await this.contract[method](recordId);
        const ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
        return { root: root === ZERO ? null : root, manifestCID: cid || null };
      } catch { /* fall through */ }
    }
    const store = recordType === 'ore' ? simStore.ores : recordType === 'bar' ? simStore.bars : simStore.products;
    const rec = store[recordId];
    if (!rec) throw new Error(`${recordType} ${recordId} not found`);
    return { root: rec.documentRoot || null, manifestCID: rec.evidenceManifestCID || null };
  }

  /**
   * Verify a document's Merkle proof on-chain.
   */
  async verifyDocument(recordType, recordId, proof, leaf) {
    const methodMap = { ore: 'verifyOreDocument', bar: 'verifyBarDocument', product: 'verifyProductDocument' };
    const method = methodMap[recordType];
    if (!method) throw new Error(`Unknown record type: ${recordType}`);

    if (this.isLive) {
      return this.contract[method](recordId, proof, leaf);
    }

    // Simulation: basic Merkle proof check using ethers
    const store = recordType === 'ore' ? simStore.ores : recordType === 'bar' ? simStore.bars : simStore.products;
    const rec = store[recordId];
    if (!rec) throw new Error(`${recordType} ${recordId} not found`);
    if (!rec.documentRoot) throw new Error('No document root set');

    // Recompute root from proof
    let computedHash = leaf;
    for (const sibling of proof) {
      const pair = BigInt(computedHash) <= BigInt(sibling)
        ? [computedHash, sibling]
        : [sibling, computedHash];
      computedHash = ethers.keccak256(ethers.concat(pair));
    }
    return computedHash === rec.documentRoot;
  }

  // ── UNTP: party DID registry ─────────────────────────────────────

  /**
   * Register the calling wallet's did:web identity on-chain.
   * In simulation mode the DID is stored in the in-memory party record.
   */
  async registerPartyDID(did) {
    if (this.isLive) {
      const overrides = await this._buildSafeTxOverrides('registerPartyDID', [did]);
      const tx = await this.contract.registerPartyDID(did, overrides);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, did };
    }
    // Simulation: nothing to store globally; return ack
    return { success: true, simulation: true, did };
  }

  /**
   * Read the on-chain DID for a wallet address.
   */
  async getPartyDID(address) {
    if (this.isLive) {
      return this.contract.partyDID(address);
    }
    return null;
  }

  /**
   * Set the on-chain base URI for UNTP entity resolution (ADMIN only).
   */
  async setBaseURI(uri) {
    if (this.isLive) {
      const overrides = await this._buildSafeTxOverrides('setBaseURI', [uri]);
      const tx = await this.contract.setBaseURI(uri, overrides);
      const receipt = await tx.wait();
      return { success: true, txHash: receipt.hash, uri };
    }
    return { success: true, simulation: true, uri };
  }

  /**
   * Record the URI of a UNTP Digital Conformity Credential on a product (ASSAYER/ADMIN).
   */
  async setConformityCredential(productId, uri) {
    if (this.isLive) {
      const overrides = await this._buildSafeTxOverrides('setConformityCredential', [productId, uri]);
      const tx = await this.contract.setConformityCredential(productId, uri, overrides);
      const receipt = await tx.wait();
      // Update local cache
      if (simStore.products[productId]) {
        simStore.products[productId].conformityCredentialURI = uri;
      }
      return { success: true, txHash: receipt.hash, productId, uri };
    }
    // Simulation: update in-memory store
    if (simStore.products[productId]) {
      simStore.products[productId].conformityCredentialURI = uri;
    }
    return { success: true, simulation: true, productId, uri };
  }
}

// Singleton
const traceabilityContract = new TraceabilityContractService();
export default traceabilityContract;
