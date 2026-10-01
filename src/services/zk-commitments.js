import { buildPoseidon } from 'circomlibjs';

let poseidonPromise = null;

function getPoseidon() {
  if (!poseidonPromise) {
    poseidonPromise = buildPoseidon();
  }
  return poseidonPromise;
}

function normalizeBigInt(value, label) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string') {
    if (value.startsWith('0x') || value.startsWith('0X')) return BigInt(value);
    if (/^-?\d+$/.test(value)) return BigInt(value);
  }
  throw new Error(`Invalid numeric value for ${label}`);
}

function stringToField(value, label = 'string') {
  const text = String(value || '').trim();
  if (!text) {
    throw new Error(`${label} is required`);
  }
  const hex = Buffer.from(text, 'utf8').toString('hex');
  return BigInt(`0x${hex}`);
}

function encodeCommitmentHex(commitment) {
  return `0x${normalizeBigInt(commitment, 'commitment').toString(16).padStart(64, '0')}`;
}

async function computePoseidonCommitment(values) {
  const poseidon = await getPoseidon();
  const normalized = values.map((value, index) => normalizeBigInt(value, `values[${index}]`));
  const field = poseidon.F;
  return field.toString(poseidon(normalized));
}

async function computeTaggedCommitment(tag, values) {
  const tagField = stringToField(tag, 'tag');
  const commitment = await computePoseidonCommitment([tagField, ...values]);
  return {
    tag,
    tagField: tagField.toString(),
    values: values.map((value, index) => normalizeBigInt(value, `values[${index}]`).toString()),
    commitment,
    commitmentHex: encodeCommitmentHex(commitment),
  };
}

export {
  computePoseidonCommitment,
  computeTaggedCommitment,
  encodeCommitmentHex,
  getPoseidon,
  normalizeBigInt,
  stringToField,
};
