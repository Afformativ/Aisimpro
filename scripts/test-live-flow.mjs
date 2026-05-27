/**
 * Quick smoke-test of the traceability contract service in LIVE mode.
 * Uses env vars: TRACEABILITY_CONTRACT_ADDRESS, TRACEABILITY_RPC_URL, PRIVATE_KEY
 */
import traceabilityContract from '../src/services/traceability-contract.js';

const conn = await traceabilityContract.connect();
console.log('=== CONNECTION ===', JSON.stringify(conn, null, 2));

// Wait for background event scan to finish
await new Promise(r => setTimeout(r, 2000));

console.log('\n--- Registering ore ---');
const ore = await traceabilityContract.registerOre({
  metal: 'GOLD', mineId: 'MINE-ZA-DRIEFONTEIN', originCountry: 'South Africa',
  mineralType: 'reef', weightGrams: 500000, estimatedGrade: '8 g/t'
});
console.log('ORE:', JSON.stringify(ore, null, 2));

// Small delay for nonce sync
await new Promise(r => setTimeout(r, 500));

console.log('\n--- Refining ore → bar ---');
const bar = await traceabilityContract.refine({
  oreIds: [ore.id], metal: 'GOLD', refineryId: 'RAND-REFINERY-ZA',
  outputWeightGrams: 400000, finenessPPT: 9999, barSerialNumber: 'RR-2026-001234'
});
console.log('BAR:', JSON.stringify(bar, null, 2));

await new Promise(r => setTimeout(r, 500));

console.log('\n--- Certifying bar → product ---');
const prod = await traceabilityContract.certify({
  inputBarId: bar.id, metal: 'GOLD', assayerId: 'LBMA-003',
  weightGrams: 400000, finenessPPT: 9999, hallmark: 'LBMA Good Delivery',
  sku: 'AU-BAR-400', productType: 'bar'
});
console.log('PRODUCT:', JSON.stringify(prod, null, 2));

console.log('\n--- Listing all ---');
console.log('Ores:', traceabilityContract.listOres().length);
console.log('Bars:', traceabilityContract.listBars().length);
console.log('Products:', traceabilityContract.listProducts().length);
console.log('\n--- Final Status ---');
console.log(JSON.stringify(traceabilityContract.status(), null, 2));
