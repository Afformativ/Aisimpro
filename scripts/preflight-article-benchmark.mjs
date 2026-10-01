import 'dotenv/config';
import { ethers } from 'ethers';

const ARTICLE_EVENTS = parseInt(process.env.ARTICLE_BENCH_EVENTS || '2000', 10);
const ARTICLE_BATCH_SIZE = parseInt(process.env.ARTICLE_BENCH_BATCH_SIZE || '500', 10);
const ARTICLE_RPC_URL = process.env.ARTICLE_RPC_URL || process.env.ZKEVM_RPC_URL || process.env.RPC_URL || 'https://rpc.cardona.zkevm-rpc.com';
const ARTICLE_PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARTICLE_CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const ARTICLE_CHAIN_ID = parseInt(process.env.ARTICLE_CHAIN_ID || '2442', 10);
const ARTICLE_CHAIN_NAME = process.env.ARTICLE_CHAIN_NAME || 'polygon-zkevm-cardona';
const ARTICLE_EXPLORER = process.env.ARTICLE_EXPLORER || '';
const FUNDING_BUFFER_POL = parseFloat(process.env.ARTICLE_FUNDING_BUFFER_POL || '0.01');
const FUNDING_SAFETY_MULTIPLIER = parseFloat(process.env.ARTICLE_FUNDING_SAFETY_MULTIPLIER || '2');

const ANCHOR_ABI = [
  'function anchorRoot(bytes32 merkleRoot, bytes32 batchIdHash, string scopeType, string scopeId, string schemaVersion, string treeAlgo, bytes32 prevChainedRoot, bytes32 chainedRoot) external',
];

function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function makeDummyAnchorArgs() {
  return [
    ethers.keccak256(ethers.toUtf8Bytes('dummy-root')),
    ethers.keccak256(ethers.toUtf8Bytes('dummy-batch')),
    'shipment',
    'article-preflight',
    'canon-v1',
    'sha256-binary-v1',
    ethers.ZeroHash,
    ethers.keccak256(ethers.toUtf8Bytes('dummy-chain-root')),
  ];
}

async function main() {
  if (!ARTICLE_RPC_URL || !ARTICLE_PRIVATE_KEY || !ARTICLE_CONTRACT_ADDRESS) {
    throw new Error('Missing ARTICLE_RPC_URL/ZKEVM_RPC_URL/RPC_URL, PRIVATE_KEY, or CONTRACT_ADDRESS');
  }

  const network = ethers.Network.from({ chainId: ARTICLE_CHAIN_ID, name: ARTICLE_CHAIN_NAME });
  const provider = new ethers.JsonRpcProvider(ARTICLE_RPC_URL, network, {
    staticNetwork: network,
    batchMaxCount: 1,
  });
  const signer = new ethers.Wallet(ARTICLE_PRIVATE_KEY, provider);
  const anchorContract = new ethers.Contract(ARTICLE_CONTRACT_ADDRESS, ANCHOR_ABI, signer);

  const [liveNetwork, balanceWei, code, feeData] = await Promise.all([
    provider.getNetwork(),
    provider.getBalance(signer.address),
    provider.getCode(ARTICLE_CONTRACT_ADDRESS),
    provider.getFeeData(),
  ]);

  const chainIdMatches = Number(liveNetwork.chainId) === ARTICLE_CHAIN_ID;
  if (!chainIdMatches) {
    throw new Error(`Chain mismatch: env expects ${ARTICLE_CHAIN_ID}, RPC returned ${liveNetwork.chainId}`);
  }

  if (!code || code === '0x') {
    throw new Error(`No contract code found at ${ARTICLE_CONTRACT_ADDRESS} on chain ${ARTICLE_CHAIN_ID}`);
  }

  const args = makeDummyAnchorArgs();
  const gasEstimate = await anchorContract.anchorRoot.estimateGas(...args);
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? ethers.parseUnits('1', 'gwei');
  const estimatedAnchorCostWei = gasEstimate * gasPrice;

  const totalEvents = Math.floor(ARTICLE_EVENTS / 4) * 4;
  const expectedAnchorTxs = Math.max(1, Math.ceil(totalEvents / ARTICLE_BATCH_SIZE));
  const estimatedTotalWei = (estimatedAnchorCostWei * BigInt(expectedAnchorTxs) * BigInt(Math.ceil(FUNDING_SAFETY_MULTIPLIER * 100))) / 100n;
  const recommendedWei = estimatedTotalWei + ethers.parseEther(String(FUNDING_BUFFER_POL));
  const shortfallWei = balanceWei >= recommendedWei ? 0n : (recommendedWei - balanceWei);

  const output = {
    ok: shortfallWei === 0n,
    network: {
      expectedChainId: ARTICLE_CHAIN_ID,
      actualChainId: Number(liveNetwork.chainId),
      name: ARTICLE_CHAIN_NAME,
      rpcUrl: ARTICLE_RPC_URL,
      explorerUrl: ARTICLE_EXPLORER || null,
    },
    wallet: {
      address: signer.address,
      balancePol: round(Number(ethers.formatEther(balanceWei))),
    },
    contract: {
      address: ARTICLE_CONTRACT_ADDRESS,
      hasCode: true,
      anchorRootEstimatedGas: gasEstimate.toString(),
      anchorRootEstimatedCostPol: round(Number(ethers.formatEther(estimatedAnchorCostWei))),
    },
    benchmark: {
      requestedEvents: ARTICLE_EVENTS,
      committedEventsApprox: totalEvents,
      batchSize: ARTICLE_BATCH_SIZE,
      expectedAnchorTxs,
      fundingSafetyMultiplier: FUNDING_SAFETY_MULTIPLIER,
      fundingBufferPol: FUNDING_BUFFER_POL,
      recommendedBalancePol: round(Number(ethers.formatEther(recommendedWei))),
      shortfallPol: round(Number(ethers.formatEther(shortfallWei))),
    },
  };

  console.log(JSON.stringify(output, null, 2));

  if (shortfallWei > 0n) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
