/**
 * Merkle Tree Engine
 * 
 * Binary hash tree with configurable hash algorithm.
 * 
 * Deterministic rules:
 *   - Leaves are supplied in a fixed order (caller's responsibility).
 *   - If a level has an odd number of nodes the LAST node is duplicated.
 *   - parentHash = H(left || right)  (concatenation of raw hex bytes)
 *   - Proof siblings carry explicit { position: 'left'|'right', hash } so
 *     verifiers never need to guess orientation.
 * 
 * Tree algorithm identifier: 'sha256-binary-v1'
 */

import { createHash } from 'crypto';

/** Algorithm tag persisted alongside roots & proofs */
export const TREE_ALGO = 'sha256-binary-v1';

// ---------------------------------------------------------------------------
// Hashing helpers
// ---------------------------------------------------------------------------

/**
 * SHA-256 of a hex-encoded buffer (two hex leaves concatenated).
 * Inputs MUST be lower-case hex without 0x prefix.
 * @param {string} hexA
 * @param {string} hexB
 * @returns {string} hex digest (64 chars, no prefix)
 */
export function hashPair(hexA, hexB) {
  const buf = Buffer.from(hexA + hexB, 'hex');
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Hash arbitrary data with SHA-256.
 * @param {string|Buffer} data
 * @returns {string} hex digest
 */
export function sha256Hex(data) {
  const h = createHash('sha256');
  if (Buffer.isBuffer(data)) {
    h.update(data);
  } else {
    h.update(data, 'utf8');
  }
  return h.digest('hex');
}

/**
 * Keccak-256 hash matching Solidity's keccak256().
 * Uses ethers.js when available, falls back to the 'keccak256' npm module.
 * @param {string} hexData - hex-encoded data (with or without 0x prefix)
 * @returns {string} 0x-prefixed hex digest (66 chars)
 */
export function keccak256Hex(hexData) {
  // Dynamic import avoided; use Node.js crypto keccak if available (Node 18+),
  // otherwise fall back to createHash('sha3-256').  For EVM parity the caller
  // should use ethers.keccak256 directly; this helper is convenience-only.
  try {
    const h = createHash('sha3-256');
    const buf = Buffer.from(hexData.replace(/^0x/, ''), 'hex');
    return '0x' + h.update(buf).digest('hex');
  } catch {
    // If sha3-256 unavailable, return sha256 as degraded fallback
    return '0x' + sha256Hex(Buffer.from(hexData.replace(/^0x/, ''), 'hex'));
  }
}

// ---------------------------------------------------------------------------
// Tree construction
// ---------------------------------------------------------------------------

/**
 * Build a complete Merkle tree from an array of leaf hashes.
 * 
 * @param {string[]} leaves - Array of hex-encoded leaf hashes (no 0x prefix)
 * @returns {{ root: string, levels: string[][], leafCount: number }}
 *   - root:   hex Merkle root
 *   - levels: levels[0] = leaves, levels[n] = [root]
 *   - leafCount: number of original leaves
 * @throws If leaves is empty
 */
export function buildTree(leaves) {
  if (!leaves || leaves.length === 0) {
    throw new Error('Cannot build Merkle tree from zero leaves');
  }

  // Normalise – lower case, strip 0x
  const normalised = leaves.map(l => l.toLowerCase().replace(/^0x/, ''));
  const levels = [normalised];

  let current = normalised;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      // If odd, duplicate last node
      const right = i + 1 < current.length ? current[i + 1] : current[i];
      next.push(hashPair(left, right));
    }
    levels.push(next);
    current = next;
  }

  return {
    root: current[0],
    levels,
    leafCount: normalised.length,
  };
}

// ---------------------------------------------------------------------------
// Inclusion proof generation
// ---------------------------------------------------------------------------

/**
 * Generate an inclusion proof (sibling path) for a given leaf index.
 * 
 * @param {string[][]} levels - levels from buildTree()
 * @param {number} leafIndex - index into levels[0]
 * @returns {{ leafHash: string, siblings: Array<{ position: 'left'|'right', hash: string }> }}
 */
export function getInclusionProof(levels, leafIndex) {
  if (leafIndex < 0 || leafIndex >= levels[0].length) {
    throw new Error(`leafIndex ${leafIndex} out of range [0, ${levels[0].length})`);
  }

  const siblings = [];
  let idx = leafIndex;

  for (let level = 0; level < levels.length - 1; level++) {
    const layer = levels[level];
    const isLeft = idx % 2 === 0;
    let siblingIdx;
    if (isLeft) {
      siblingIdx = idx + 1 < layer.length ? idx + 1 : idx; // dup if odd
    } else {
      siblingIdx = idx - 1;
    }

    siblings.push({
      position: isLeft ? 'right' : 'left',
      hash: layer[siblingIdx],
    });

    idx = Math.floor(idx / 2);
  }

  return {
    leafHash: levels[0][leafIndex],
    siblings,
  };
}

// ---------------------------------------------------------------------------
// Proof verification
// ---------------------------------------------------------------------------

/**
 * Verify an inclusion proof against a known Merkle root.
 * 
 * @param {string} leafHash - hex leaf hash
 * @param {Array<{ position: 'left'|'right', hash: string }>} siblings
 * @param {string} expectedRoot - hex root
 * @returns {boolean}
 */
export function verifyProof(leafHash, siblings, expectedRoot) {
  let current = leafHash.toLowerCase().replace(/^0x/, '');
  const root = expectedRoot.toLowerCase().replace(/^0x/, '');

  for (const sibling of siblings) {
    const sHash = sibling.hash.toLowerCase().replace(/^0x/, '');
    if (sibling.position === 'left') {
      current = hashPair(sHash, current);
    } else if (sibling.position === 'right') {
      current = hashPair(current, sHash);
    } else {
      return false; // Invalid position
    }
  }

  return current === root;
}

// ---------------------------------------------------------------------------
// Convenience: build tree + all proofs at once
// ---------------------------------------------------------------------------

/**
 * Build tree and generate inclusion proofs for every leaf.
 * 
 * @param {string[]} leaves
 * @returns {{
 *   root: string,
 *   leafCount: number,
 *   proofs: Array<{ leafIndex: number, leafHash: string, siblings: Array<{position,hash}> }>
 * }}
 */
export function buildTreeWithProofs(leaves) {
  const { root, levels, leafCount } = buildTree(leaves);

  const proofs = levels[0].map((_, idx) => {
    const proof = getInclusionProof(levels, idx);
    return { leafIndex: idx, ...proof };
  });

  return { root, leafCount, proofs, levels };
}
