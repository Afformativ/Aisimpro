import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { groth16 } from 'snarkjs';
import {
  computeTaggedCommitment,
  encodeCommitmentHex,
  normalizeBigInt,
  stringToField,
} from './zk-commitments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const circuitDir = join(__dirname, '..', '..', 'zk', 'artifacts', 'numeric_threshold_disclosure');
const wasmPath = join(circuitDir, 'numeric_threshold_disclosure_js', 'numeric_threshold_disclosure.wasm');
const zkeyPath = join(circuitDir, 'numeric_threshold_disclosure_final.zkey');
const vkeyPath = join(circuitDir, 'verification_key.json');

function requireBuiltArtifacts() {
  try {
    readFileSync(vkeyPath, 'utf8');
  } catch {
    throw new Error('ZK artifacts are missing. Run `npm run zk:build` first.');
  }
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

class ZkNumericProofService {
  async computeCommitment({ fieldTag, value, salt }) {
    const result = await computeTaggedCommitment(fieldTag, [value, salt]);
    return {
      fieldTag,
      fieldTagField: stringToField(fieldTag, 'fieldTag').toString(),
      value: normalizeBigInt(value, 'value').toString(),
      salt: normalizeBigInt(salt, 'salt').toString(),
      commitment: result.commitment,
      commitmentHex: encodeCommitmentHex(result.commitment),
    };
  }

  async generateProof({
    fieldTag,
    value,
    salt,
    minValue,
    expectedCommitment,
  }) {
    requireBuiltArtifacts();

    const commitmentData = await this.computeCommitment({ fieldTag, value, salt });
    const minThreshold = normalizeBigInt(minValue, 'minValue');

    if (expectedCommitment) {
      const expected = normalizeBigInt(expectedCommitment, 'expectedCommitment').toString();
      if (commitmentData.commitment !== expected) {
        throw new Error('Provided secret data does not match the stored commitment');
      }
    }

    const input = {
      fieldTag: commitmentData.fieldTagField,
      value: commitmentData.value,
      salt: commitmentData.salt,
      commitment: commitmentData.commitment,
      minValue: minThreshold.toString(),
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

export default new ZkNumericProofService();
