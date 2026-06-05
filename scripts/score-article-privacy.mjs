import { readFileSync } from 'fs';
import { resolve } from 'path';
import { scoreArticleModeLeakage } from '../src/services/privacy-leakage.js';

const inputPath = process.argv[2];

if (!inputPath) {
  throw new Error('Usage: node scripts/score-article-privacy.mjs <article-benchmark.json>');
}

const benchmark = JSON.parse(readFileSync(resolve(inputPath), 'utf8'));
const snapshot = benchmark.publicSnapshot;

if (!Array.isArray(snapshot)) {
  throw new Error('Benchmark file does not contain publicSnapshot');
}

const leakage = scoreArticleModeLeakage(snapshot);

console.log(JSON.stringify({
  file: resolve(inputPath),
  inferable_confidential_instances: leakage.inferableCount,
  total_confidential_instances: leakage.totalApplicable,
  privacy_leakage_percent: leakage.leakagePercent,
  by_category: leakage.byCategory,
}, null, 2));
