import { execFileSync } from 'child_process';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const ptauPower = '11';
const ptauDir = join(rootDir, 'zk', 'ptau');
const verifierDir = join(rootDir, 'contracts', 'generated');
const ptauInitial = join(ptauDir, `pot${ptauPower}_0000.ptau`);
const ptauFinal = join(ptauDir, `pot${ptauPower}_final.ptau`);
const entropySeed = process.env.ZK_ENTROPY || 'gold-provenance-zk';

const circuits = [
  {
    circuitName: 'ore_selective_disclosure',
    verifierName: 'OreSelectiveDisclosureVerifier',
    entropySuffix: 'ore-selective-disclosure',
  },
  {
    circuitName: 'numeric_threshold_disclosure',
    verifierName: 'NumericThresholdDisclosureVerifier',
    entropySuffix: 'numeric-threshold-disclosure',
  },
];

function run(cmd, args, options = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    ...options,
  });
}

mkdirSync(ptauDir, { recursive: true });
mkdirSync(verifierDir, { recursive: true });

if (!existsSync(ptauInitial)) {
  run('snarkjs', ['powersoftau', 'new', 'bn128', ptauPower, ptauInitial]);
}

if (!existsSync(ptauFinal)) {
  const ptauContrib = join(ptauDir, `pot${ptauPower}_0001.ptau`);
  run('snarkjs', ['powersoftau', 'contribute', ptauInitial, ptauContrib, '--name=gold-provenance-zk', `-e=${entropySeed}`]);
  run('snarkjs', ['powersoftau', 'prepare', 'phase2', ptauContrib, ptauFinal]);
}

for (const { circuitName, verifierName, entropySuffix } of circuits) {
  const circuitPath = join(rootDir, 'zk', 'circuits', `${circuitName}.circom`);
  const outputDir = join(rootDir, 'zk', 'artifacts', circuitName);
  const r1csPath = join(outputDir, `${circuitName}.r1cs`);
  const wasmPath = join(outputDir, `${circuitName}_js`, `${circuitName}.wasm`);
  const zkeyInitial = join(outputDir, `${circuitName}_0000.zkey`);
  const zkeyFinal = join(outputDir, `${circuitName}_final.zkey`);
  const vkeyPath = join(outputDir, 'verification_key.json');
  const verifierPath = join(verifierDir, `${verifierName}.sol`);
  const entropy = `${entropySeed}-${entropySuffix}`;

  mkdirSync(outputDir, { recursive: true });

  run('circom', [
    circuitPath,
    '--r1cs',
    '--wasm',
    '--sym',
    '--output', outputDir,
  ]);

  run('snarkjs', ['groth16', 'setup', r1csPath, ptauFinal, zkeyInitial]);
  run('snarkjs', ['zkey', 'contribute', zkeyInitial, zkeyFinal, '--name=gold-provenance-zk', `-e=${entropy}-phase2`]);
  run('snarkjs', ['zkey', 'export', 'verificationkey', zkeyFinal, vkeyPath]);

  const tmpVerifierPath = join(outputDir, 'Verifier.sol');
  run('snarkjs', ['zkey', 'export', 'solidityverifier', zkeyFinal, tmpVerifierPath]);

  let verifierSource = readFileSync(tmpVerifierPath, 'utf8');
  verifierSource = verifierSource.replace(/\bcontract Verifier\b/, `contract ${verifierName}`);
  verifierSource = verifierSource.replace(/\bcontract Groth16Verifier\b/, `contract ${verifierName}`);
  writeFileSync(verifierPath, verifierSource);

  console.log(`\nBuilt circuit artifacts in ${outputDir}`);
  console.log(`Verifier written to ${verifierPath}`);
  console.log(`WASM: ${wasmPath}`);
  console.log(`ZKey: ${zkeyFinal}`);
  console.log(`Verification key: ${vkeyPath}`);
}
