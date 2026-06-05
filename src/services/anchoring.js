/**
 * Blockchain Anchoring Service
 * Handles EVM testnet anchoring for provenance records
 * Uses a stateless Event Logger pattern for minimal gas costs
 */

import 'dotenv/config';
import { ethers } from 'ethers';

// Event Logger Contract ABI (minimal - just emits events)
const EVENT_LOGGER_ABI = [
  "event HashAnchored(bytes32 indexed id, bytes32 hash, uint256 timestamp, address indexed sender)",
  "event RootAnchored(bytes32 indexed merkleRoot, bytes32 indexed batchIdHash, string scopeType, string scopeId, uint256 timestamp, address indexed sender, bytes32 prevChainedRoot, bytes32 chainedRoot)",
  "function logHash(bytes32 id, bytes32 hash) external",
  "function anchorRoot(bytes32 merkleRoot, bytes32 batchIdHash, string scopeType, string scopeId, string schemaVersion, string treeAlgo, bytes32 prevChainedRoot, bytes32 chainedRoot) external"
];

// Network configurations
const NETWORKS = {
  // Polygon zkEVM Mainnet
  'zkevm-mainnet': {
    rpcUrl: 'https://zkevm-rpc.com',
    chainId: 1101,
    explorerUrl: 'https://explorer.mainnet.zkevm-rpc.com',
    name: 'Polygon zkEVM Mainnet'
  },
  // Polygon zkEVM Cardona Testnet
  'zkevm-testnet': {
    rpcUrl: 'https://rpc.cardona.zkevm-rpc.com',
    chainId: 2442,
    explorerUrl: 'https://explorer.cardona.zkevm-rpc.com',
    name: 'Polygon zkEVM Cardona Testnet'
  },
  // Polygon Amoy testnet (legacy)
  'amoy': {
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    chainId: 80002,
    explorerUrl: 'https://amoy.polygonscan.com',
    name: 'Polygon Amoy Testnet'
  },
  localhost: {
    rpcUrl: 'http://127.0.0.1:8545',
    chainId: 31337,
    explorerUrl: null,
    name: 'Localhost Hardhat'
  }
};

const DEFAULT_NETWORK = process.env.BLOCKCHAIN_NETWORK || process.env.ANCHORING_NETWORK || 'amoy';
const preset = NETWORKS[DEFAULT_NETWORK] || NETWORKS.amoy;

// Default configuration for Polygon Amoy Testnet
const DEFAULT_CONFIG = {
  ...preset,
  rpcUrl: process.env.ANCHORING_RPC_URL || process.env.RPC_URL || preset.rpcUrl,
  explorerUrl: process.env.ANCHORING_EXPLORER_URL || preset.explorerUrl,
  contractAddress: process.env.CONTRACT_ADDRESS || null
};

class BlockchainAnchoringService {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.provider = null;
    this.wallet = null;
    this.contract = null;
    this.isConnected = false;
    this.simulationMode = true; // Start in simulation mode
    this.simulatedTransactions = [];
  }

  /**
   * Initialize connection to blockchain
   */
  async connect(privateKey = null) {
    try {
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      
      if (privateKey) {
        this.wallet = new ethers.Wallet(privateKey, this.provider);
        
        // Get contract address from env if not set
        const contractAddress = this.config.contractAddress || process.env.CONTRACT_ADDRESS;
        
        if (contractAddress) {
          this.contract = new ethers.Contract(
            contractAddress,
            EVENT_LOGGER_ABI,
            this.wallet
          );
          this.simulationMode = false;
          console.log(` Contract: ${contractAddress}`);
        } else {
          console.log(' No CONTRACT_ADDRESS set - running in simulation mode');
          this.simulationMode = true;
        }
      }
      
      this.isConnected = true;
      return { success: true, address: this.wallet?.address || 'simulation-mode' };
    } catch (error) {
      console.error('Blockchain connection failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Attach an already-connected signer/provider pair.
   * Useful for Hardhat in-process tests where no external RPC is exposed.
   */
  async attachSigner(signer, contractAddress = null) {
    if (!signer?.provider) {
      throw new Error('Signer with provider is required');
    }

    this.provider = signer.provider;
    this.wallet = signer;

    const resolvedContractAddress = contractAddress || this.config.contractAddress || process.env.CONTRACT_ADDRESS;
    if (resolvedContractAddress) {
      this.contract = new ethers.Contract(
        resolvedContractAddress,
        EVENT_LOGGER_ABI,
        signer
      );
      this.simulationMode = false;
      console.log(` Contract: ${resolvedContractAddress}`);
    } else {
      this.contract = null;
      this.simulationMode = true;
      console.log(' No CONTRACT_ADDRESS set - running in simulation mode');
    }

    this.isConnected = true;
    const address = typeof signer.getAddress === 'function'
      ? await signer.getAddress()
      : signer.address;

    return { success: true, address: address || 'attached-signer' };
  }

  /**
   * Convert string to bytes32 for contract interaction
   * Uses keccak256 hash for strings longer than 31 bytes
   */
  stringToBytes32(str) {
    // For short strings (max 31 bytes), use direct encoding
    if (str.length <= 31) {
      return ethers.encodeBytes32String(str);
    }
    // For longer strings, hash them to get bytes32
    return ethers.keccak256(ethers.toUtf8Bytes(str));
  }

  /**
   * Ensure hash is properly formatted as bytes32
   */
  hashToBytes32(hash) {
    // Remove '0x' prefix if present and ensure it's 64 chars
    const cleanHash = hash.replace(/^0x/, '');
    if (cleanHash.length !== 64) {
      // If not a valid 256-bit hash, hash it
      return ethers.keccak256(ethers.toUtf8Bytes(hash));
    }
    return '0x' + cleanHash;
  }

  /**
   * Anchor a hash on the blockchain
   */
  async anchorHash(id, hash) {
    const anchorRecord = {
      id,
      hash,
      timestamp: new Date().toISOString(),
      txHash: null,
      blockNumber: null,
      explorerUrl: null
    };

    if (this.simulationMode) {
      // Simulation mode - generate fake tx hash
      const fakeTxHash = '0x' + Array(64).fill(0).map(() => 
        Math.floor(Math.random() * 16).toString(16)
      ).join('');
      
      anchorRecord.txHash = fakeTxHash;
      anchorRecord.blockNumber = Math.floor(Math.random() * 1000000) + 50000000;
      anchorRecord.explorerUrl = `${this.config.explorerUrl}/tx/${fakeTxHash}`;
      anchorRecord.simulated = true;
      
      this.simulatedTransactions.push(anchorRecord);
      
      return {
        success: true,
        ...anchorRecord
      };
    }

    try {
      // Real blockchain transaction
      const idBytes32 = this.stringToBytes32(id);
      const hashBytes32 = this.hashToBytes32(hash);
      
      console.log(` Anchoring: ${id.substring(0, 30)}...`);
      const tx = await this.contract.logHash(idBytes32, hashBytes32);
      console.log(` TX sent: ${tx.hash}`);
      
      const receipt = await tx.wait();
      console.log(`Confirmed in block ${receipt.blockNumber}`);
      
      anchorRecord.txHash = receipt.hash;
      anchorRecord.blockNumber = receipt.blockNumber;
      anchorRecord.explorerUrl = `${this.config.explorerUrl}/tx/${receipt.hash}`;
      anchorRecord.simulated = false;
      
      return {
        success: true,
        ...anchorRecord
      };
    } catch (error) {
      console.error(`Anchor failed: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Anchor a batch record
   */
  async anchorBatch(batchId, batchHash) {
    return this.anchorHash(`batch:${batchId}`, batchHash);
  }

  /**
   * Anchor an event record
   */
  async anchorEvent(eventId, eventHash) {
    return this.anchorHash(`event:${eventId}`, eventHash);
  }

  /**
   * Anchor a Merkle root on-chain (batched certificate anchoring).
   * Uses the anchorRoot() contract function when live, otherwise simulates.
   * 
   * @param {object} params
   * @param {string} params.merkleRoot - hex Merkle root (no 0x prefix)
   * @param {string} params.batchId - off-chain batch UUID
   * @param {string} params.scopeType - 'shipment' | 'day' | 'lot'
   * @param {string} params.scopeId
   * @param {string} [params.schemaVersion]
   * @param {string} [params.treeAlgo]
   * @param {string} [params.prevChainedRoot]
   * @param {string} [params.chainedRoot]
   * @returns {object} anchor result
   */
  async anchorMerkleRoot({
    merkleRoot,
    batchId,
    scopeType = 'shipment',
    scopeId = '',
    schemaVersion = '1.0.0',
    treeAlgo = 'sha256-binary-v1',
    prevChainedRoot = null,
    chainedRoot = null,
  }) {
    const anchorRecord = {
      batchId,
      merkleRoot,
      scopeType,
      scopeId,
      timestamp: new Date().toISOString(),
      txHash: null,
      blockNumber: null,
      explorerUrl: null,
    };

    if (this.simulationMode) {
      const fakeTxHash = '0x' + Array(64).fill(0).map(() =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('');

      anchorRecord.txHash = fakeTxHash;
      anchorRecord.blockNumber = Math.floor(Math.random() * 1000000) + 50000000;
      anchorRecord.explorerUrl = `${this.config.explorerUrl}/tx/${fakeTxHash}`;
      anchorRecord.simulated = true;
      this.simulatedTransactions.push(anchorRecord);

      return { success: true, ...anchorRecord };
    }

    try {
      const rootBytes32 = this.hashToBytes32(merkleRoot);
      const batchIdBytes32 = this.stringToBytes32(batchId);
      const prevBytes32 = prevChainedRoot
        ? this.hashToBytes32(prevChainedRoot)
        : ethers.ZeroHash;
      const chainBytes32 = chainedRoot
        ? this.hashToBytes32(chainedRoot)
        : ethers.ZeroHash;

      console.log(` Anchoring Merkle root for batch ${batchId.substring(0, 8)}...`);
      const tx = await this.contract.anchorRoot(
        rootBytes32,
        batchIdBytes32,
        scopeType,
        scopeId,
        schemaVersion,
        treeAlgo,
        prevBytes32,
        chainBytes32
      );
      console.log(` TX sent: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(` Confirmed in block ${receipt.blockNumber}`);

      anchorRecord.txHash = receipt.hash;
      anchorRecord.blockNumber = receipt.blockNumber;
      anchorRecord.explorerUrl = `${this.config.explorerUrl}/tx/${receipt.hash}`;
      anchorRecord.simulated = false;

      return { success: true, ...anchorRecord };
    } catch (error) {
      console.error(`Merkle root anchor failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify an anchor exists (simulation checks local records)
   */
  async verifyAnchor(txHash) {
    if (this.simulationMode) {
      const found = this.simulatedTransactions.find(t => t.txHash === txHash);
      return {
        verified: !!found,
        record: found || null
      };
    }

    try {
      const receipt = await this.provider.getTransactionReceipt(txHash);
      return {
        verified: !!receipt,
        blockNumber: receipt?.blockNumber,
        confirmations: receipt?.confirmations
      };
    } catch (error) {
      return {
        verified: false,
        error: error.message
      };
    }
  }

  /**
   * Get explorer URL for a transaction
   */
  getExplorerUrl(txHash) {
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }

  /**
   * Get all simulated transactions (for demo purposes)
   */
  getSimulatedTransactions() {
    return [...this.simulatedTransactions];
  }

  /**
   * Check if running in simulation mode
   */
  isSimulated() {
    return this.simulationMode;
  }

  /**
   * Get current network info
   */
  getNetworkInfo() {
    return {
      name: this.config.name,
      chainId: this.config.chainId,
      rpcUrl: this.config.rpcUrl,
      explorerUrl: this.config.explorerUrl,
      simulationMode: this.simulationMode
    };
  }

  /**
   * Switch to a different network
   */
  switchNetwork(networkKey) {
    if (!NETWORKS[networkKey]) {
      throw new Error(`Unknown network: ${networkKey}. Available: ${Object.keys(NETWORKS).join(', ')}`);
    }
    this.config = { ...NETWORKS[networkKey], contractAddress: this.config.contractAddress };
    this.isConnected = false;
    this.provider = null;
    this.wallet = null;
    return this.getNetworkInfo();
  }

  /**
   * Get available networks
   */
  static getAvailableNetworks() {
    return Object.entries(NETWORKS).map(([key, value]) => ({
      key,
      name: value.name,
      chainId: value.chainId
    }));
  }
}

// Export singleton instance (defaults to Polygon zkEVM Cardona Testnet)
const anchoringService = new BlockchainAnchoringService();
export default anchoringService;
export { BlockchainAnchoringService, NETWORKS };
