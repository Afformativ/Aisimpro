/**
 * Deterministic Canonicalization Module
 * 
 * Produces a canonical byte representation of certificate packages
 * for Merkle leaf hashing. Rules:
 *   - Lexicographic key ordering (recursive)
 *   - UTF-8 encoding
 *   - Explicit null handling (null preserved, undefined stripped)
 *   - Timestamps normalised to ISO-8601 UTC (Z suffix)
 *   - Numbers: no trailing zeros, no +0 / -0 distinction
 *   - Deterministic across runtimes (JSON subset)
 * 
 * Each canonical output is tagged with a canonicalizationVersion so
 * future changes never silently alter hashes.
 */

/** Current canonicalization version */
export const CANONICALIZATION_VERSION = 'canon-v1';

/**
 * Normalise an ISO timestamp to UTC with 'Z' suffix.
 * Accepts Date objects, ISO strings, or epoch millis.
 * Returns ISO-8601 string with milliseconds and Z suffix.
 */
export function normalizeTimestamp(value) {
  if (value === null || value === undefined) return null;
  let d;
  if (value instanceof Date) {
    d = value;
  } else if (typeof value === 'number') {
    d = new Date(value);
  } else if (typeof value === 'string') {
    d = new Date(value);
  } else {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  return d.toISOString(); // always ends with Z, includes ms
}

/**
 * Normalise a number for canonical representation.
 * - NaN / Infinity → null
 * - -0 → 0
 * - No trailing zeros (JSON.stringify handles this)
 */
function normalizeNumber(n) {
  if (!Number.isFinite(n)) return null;
  if (Object.is(n, -0)) return 0;
  return n;
}

/**
 * Deep-sort an object's keys lexicographically and normalise values.
 * - undefined values are omitted (not serialised)
 * - null is preserved as JSON null
 * - Date objects are converted to ISO-8601 UTC
 * - Numbers are normalised
 */
export function deepSortAndNormalize(obj) {
  if (obj === null) return null;
  if (obj === undefined) return undefined;

  if (obj instanceof Date) {
    return normalizeTimestamp(obj);
  }

  if (typeof obj === 'number') {
    return normalizeNumber(obj);
  }

  if (typeof obj === 'string') {
    return obj;
  }

  if (typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => deepSortAndNormalize(item));
  }

  if (typeof obj === 'object') {
    const sorted = {};
    const keys = Object.keys(obj).sort(); // lexicographic
    for (const key of keys) {
      const val = obj[key];
      if (val === undefined) continue; // strip undefined
      sorted[key] = deepSortAndNormalize(val);
    }
    return sorted;
  }

  // Fallback – coerce to string
  return String(obj);
}

/**
 * Produce canonical JSON bytes (UTF-8 string) from an input object.
 * 
 * @param {object} obj - Input object
 * @returns {string} Deterministic JSON string (no whitespace)
 */
export function canonicalize(obj) {
  const normalized = deepSortAndNormalize(obj);
  return JSON.stringify(normalized);
}

/**
 * Build a canonical certificate payload suitable for Merkle-leaf hashing.
 * 
 * @param {object} params
 * @param {string} params.certificateId
 * @param {object} params.certificateJson - The full certificate payload
 * @param {string[]} params.docHashList - Sorted hex hashes of referenced docs
 * @param {string} params.schemaVersion
 * @param {string} params.issuerKeyId
 * @returns {string} Canonical JSON bytes
 */
export function buildCanonicalCertificatePayload({
  certificateId,
  certificateJson,
  docHashList = [],
  schemaVersion,
  issuerKeyId,
}) {
  // Assemble the envelope that will be hashed
  const envelope = {
    _canonVersion: CANONICALIZATION_VERSION,
    certificateId,
    certificatePayload: certificateJson,
    docHashList: [...docHashList].sort(), // ensure deterministic ordering
    issuerKeyId,
    schemaVersion,
  };
  return canonicalize(envelope);
}
