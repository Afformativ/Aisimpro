import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { buildPoseidon } from 'circomlibjs';
import { groth16 } from 'snarkjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const circuitDir = join(__dirname, '..', '..', 'zk', 'artifacts', 'ore_selective_disclosure');
const wasmPath = join(circuitDir, 'ore_selective_disclosure_js', 'ore_selective_disclosure.wasm');
const zkeyPath = join(circuitDir, 'ore_selective_disclosure_final.zkey');
const vkeyPath = join(circuitDir, 'verification_key.json');

let poseidonInstancePromise = null;

function requireBuiltArtifacts() {
  try {
    readFileSync(vkeyPath, 'utf8');
  } catch (error) {
    throw new Error('ZK artifacts are missing. Run `npm run zk:build` first.');
  }
}

async function getPoseidon() {
  if (!poseidonInstancePromise) {
    poseidonInstancePromise = buildPoseidon();
  }
  return poseidonInstancePromise;
}

function normalizeBigInt(value, label) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') return BigInt(value);
  throw new Error(`Invalid numeric value for ${label}`);
}

function countryCodeToField(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw new Error('countryCode must be a 2-letter ISO code');
  }
  return BigInt((code.charCodeAt(0) << 8) + code.charCodeAt(1));
}

function parseAllowedCountries(allowedCountries) {
  if (!Array.isArray(allowedCountries) || allowedCountries.length !== 3) {
    throw new Error('allowedCountries must contain exactly 3 ISO country codes');
  }
  return allowedCountries.map(countryCodeToField);
}

function encodeCommitment(commitment) {
  return `0x${normalizeBigInt(commitment, 'commitment').toString(16).padStart(64, '0')}`;
}

function decodeCommitmentHex(commitmentHex) {
  return normalizeBigInt(commitmentHex, 'commitmentHex');
}

function formatProofForSolidity(proof) {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
  };
}

class ZkOreProofService {
  async computeCommitment({ countryCode, gradeValue, salt }) {
    const poseidon = await getPoseidon();
    const country = countryCodeToField(countryCode);
    const grade = normalizeBigInt(gradeValue, 'gradeValue');
    const secretSalt = normalizeBigInt(salt, 'salt');
    const field = poseidon.F;
    const commitment = field.toString(poseidon([country, grade, secretSalt]));

    return {
      commitment,
      commitmentHex: encodeCommitment(commitment),
      countryCodeField: country.toString(),
      gradeValue: grade.toString(),
      salt: secretSalt.toString(),
    };
  }

  async generateProof({
    countryCode,
    gradeValue,
    salt,
    minGrade,
    allowedCountries,
    expectedCommitment,
  }) {
    requireBuiltArtifacts();

    const commitmentData = await this.computeCommitment({ countryCode, gradeValue, salt });
    const allowedCountryFields = parseAllowedCountries(allowedCountries);
    const minGradeValue = normalizeBigInt(minGrade, 'minGrade');

    if (expectedCommitment) {
      const expected = decodeCommitmentHex(expectedCommitment).toString();
      if (commitmentData.commitment !== expected) {
        throw new Error('Provided secret data does not match the on-chain commitment');
      }
    }

    const input = {
      countryCode: commitmentData.countryCodeField,
      gradeValue: commitmentData.gradeValue,
      salt: commitmentData.salt,
      commitment: commitmentData.commitment,
      minGrade: minGradeValue.toString(),
      allowedCountries: allowedCountryFields.map((value) => value.toString()),
    };

    const { proof, publicSignals } = await groth16.fullProve(input, wasmPath, zkeyPath);
    const verificationKey = JSON.parse(readFileSync(vkeyPath, 'utf8'));
    const verified = await groth16.verify(verificationKey, publicSignals, proof);

    return {
      proof,
      publicSignals,
      commitmentHex: commitmentData.commitmentHex,
      verified,
      solidity: {
        ...formatProofForSolidity(proof),
        input: publicSignals,
      },
    };
  }

  async verifyProof({ proof, publicSignals }) {
    requireBuiltArtifacts();
    const verificationKey = JSON.parse(readFileSync(vkeyPath, 'utf8'));
    return groth16.verify(verificationKey, publicSignals, proof);
  }
}

export { countryCodeToField, encodeCommitment };
export default new ZkOreProofService();
