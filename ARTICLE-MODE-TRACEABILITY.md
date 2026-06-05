# Article-Mode Traceability

This repo now has an "article mode" that matches the draft's architecture more closely than the original direct-write contract flow.

## What changed

The article-mode path keeps sensitive lifecycle data off-chain and anchors only batched Merkle roots plus selective-disclosure commitments on-chain.

Confidential values kept off-chain:

- counterparty identity
- exact grade
- exact transformation yield
- price
- exact weights

On-chain in article mode:

- Merkle roots
- commitment references
- batch/anchor metadata

This follows the draft's stated pattern:

1. sensitive payloads remain off-chain
2. commitments are recorded
3. predicates are proven with Groth16
4. the execution environment is a zkEVM-compatible root-anchoring flow rather than full per-event state writes

## Proofs implemented

Groth16 circuits:

- [zk/circuits/ore_selective_disclosure.circom](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/zk/circuits/ore_selective_disclosure.circom:1)
- [zk/circuits/numeric_threshold_disclosure.circom](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/zk/circuits/numeric_threshold_disclosure.circom:1)

They support:

- origin-in-approved-set plus grade-above-threshold
- purity-above-threshold

Services:

- [src/services/zk-ore-proof.js](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/src/services/zk-ore-proof.js:1)
- [src/services/zk-numeric-proof.js](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/src/services/zk-numeric-proof.js:1)
- [src/services/article-traceability.js](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/src/services/article-traceability.js:1)

## Root anchoring path

The private lifecycle is ingested into the existing Merkle batching pipeline and anchored with `anchorRoot`, not individual business transactions.

Relevant files:

- [src/services/merkle/batching.js](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/src/services/merkle/batching.js:1)
- [src/services/merkle/anchor-worker.js](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/src/services/merkle/anchor-worker.js:1)
- [contracts/EventLogger.sol](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/contracts/EventLogger.sol:1)

This is the throughput story the paper needs: many business events per anchored root, not one on-chain transaction per lifecycle step.

## API endpoints

- `POST /api/article/ore`
- `POST /api/article/transfer`
- `POST /api/article/refine`
- `POST /api/article/certify`
- `POST /api/article/records/:id/prove-origin-grade`
- `POST /api/article/records/:id/prove-purity`
- `POST /api/article/anchor/close`
- `GET /api/article/records/:id`
- `GET /api/article/records/:id/verification-bundle`
- `GET /api/article/metrics`

## Local validation

Build circuits:

```bash
npm run zk:build
```

Run the original on-chain ore proof flow:

```bash
npm run zk:test
```

Run the article-mode integration benchmark:

```bash
npm run article:test
```

Run the live/article KPI harness:

```bash
npm run preflight:article
npm run benchmark:article
```

Re-score privacy leakage from a benchmark JSON file:

```bash
npm run privacy:article -- data/benchmarks/article-benchmark-<run-id>.json
npm run summary:article -- data/benchmarks/article-benchmark-<run-id>.json
```

The current local Hardhat run on June 4, 2026 produced:

- `240` committed business events
- `1` anchored Merkle root
- `683.76` business events/s
- `0.0%` privacy leakage under the article-mode public-data attacker model
- local Groth16 verification for both origin/grade and purity

This is a local architecture benchmark, not a live zkEVM/Cardona result.

## What this does and does not prove

What it proves:

- the repo now implements the hybrid off-chain/on-chain pattern described in the draft
- Groth16 selective disclosure is live for the draft's main predicates
- the throughput-critical write path is batched root anchoring rather than full public state writes

What it does not prove yet:

- a live zkEVM/Cardona measurement at or above the draft's `200 tx/s` target
- a formally reported privacy-leakage score from the full attribute-inference test suite
- a custom standalone rollup or validity-prover stack

The correct paper claim after this change is:

"The artifact now implements the paper's intended privacy-preserving architecture and can be evaluated on a zkEVM testbed with a representative-event harness. The previously measured low-throughput, high-leakage Amoy results applied to the old direct-write artifact, not this batched article-mode path."

## Exact testnet procedure

1. Deploy [contracts/GoldSilverTraceability.sol](/Users/Oleksandr_Hrabar/Aisimpro/gold-provenance/contracts/GoldSilverTraceability.sol:1) to the target network:

```bash
npx hardhat run scripts/deploy-traceability.cjs --network zkevm-testnet
```

2. Put the deployed address into `CONTRACT_ADDRESS` and set:

```env
ARTICLE_RPC_URL=https://rpc.cardona.zkevm-rpc.com
ARTICLE_CHAIN_ID=2442
ARTICLE_CHAIN_NAME=polygon-zkevm-cardona
ARTICLE_EXPLORER=https://cardona-zkevm.polygonscan.com
ARTICLE_BLOCKCHAIN_NETWORK=zkevm-testnet
```

3. Build the Groth16 artifacts:

```bash
npm run zk:build
```

4. Run the preflight. If it fails, fund the wallet on the same chain the preflight reports:

```bash
npm run preflight:article
```

5. Run the benchmark:

```bash
npm run benchmark:article
```

6. Score leakage and print a paper-style verdict:

```bash
npm run privacy:article -- data/benchmarks/article-benchmark-<run-id>.json
npm run summary:article -- data/benchmarks/article-benchmark-<run-id>.json
```
