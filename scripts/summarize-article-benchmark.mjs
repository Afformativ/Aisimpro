import { readFileSync } from 'fs';
import { resolve } from 'path';

const inputPath = process.argv[2];

if (!inputPath) {
  throw new Error('Usage: node scripts/summarize-article-benchmark.mjs <article-benchmark.json>');
}

const benchmark = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));

const throughputOk = Number(benchmark?.throughput?.committedBusinessTps ?? 0) >= 200;
const leakageOk = Number(benchmark?.privacyLeakage?.leakagePercent ?? 100) < 0.1;

const lines = [
  `# Article KPI Summary`,
  '',
  `Run ID: ${benchmark.runId}`,
  `Ran at: ${benchmark.ranAt}`,
  `Network: ${benchmark.network?.name} (${benchmark.network?.chainId})`,
  `Contract: ${benchmark.network?.contractAddress}`,
  '',
  `## Throughput`,
  '',
  `- Committed business throughput: ${benchmark.throughput?.committedBusinessTps} events/s`,
  `- Target: >= 200 events/s`,
  `- Status: ${throughputOk ? 'PASS' : 'FAIL'}`,
  `- Sustained ingress throughput: ${benchmark.throughput?.sustainedIngressTps} events/s`,
  `- Anchor transactions: ${benchmark.throughput?.anchorTransactions}`,
  '',
  `## Privacy Leakage`,
  '',
  `- Leakage percent: ${benchmark.privacyLeakage?.leakagePercent}%`,
  `- Target: < 0.1%`,
  `- Status: ${leakageOk ? 'PASS' : 'FAIL'}`,
  `- Inferable confidential instances: ${benchmark.privacyLeakage?.inferableCount}/${benchmark.privacyLeakage?.totalApplicable}`,
  '',
  `## Proof Checks`,
  '',
  ...(benchmark.proofs || []).map((proof) => `- ${proof.type}: ${proof.verifiedLocally ? 'verified' : 'failed'}`),
  '',
  `## Overall`,
  '',
  `- KPI verdict: ${throughputOk && leakageOk ? 'PASS' : 'FAIL'}`,
  '',
];

console.log(lines.join('\n'));
