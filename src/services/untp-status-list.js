import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const STORE_PATH = path.join(DATA_DIR, 'untp-status-lists.json');
const DEFAULT_BITS = Math.max(parseInt(process.env.UNTP_STATUS_LIST_BITS || '131072', 10), 131072);

let cachedState = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function freshState() {
  return {
    version: 1,
    lists: {
      revocation: {
        bits: DEFAULT_BITS,
        credentials: {},
      },
    },
  };
}

function loadState() {
  if (cachedState) return cachedState;
  ensureDataDir();
  if (!fs.existsSync(STORE_PATH)) {
    cachedState = freshState();
    return cachedState;
  }

  try {
    cachedState = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    cachedState = freshState();
  }

  cachedState.lists ||= {};
  cachedState.lists.revocation ||= { bits: DEFAULT_BITS, credentials: {} };
  cachedState.lists.revocation.bits ||= DEFAULT_BITS;
  cachedState.lists.revocation.credentials ||= {};
  return cachedState;
}

function saveState() {
  ensureDataDir();
  fs.writeFileSync(STORE_PATH, JSON.stringify(cachedState, null, 2));
}

function base() {
  return (process.env.UNTP_BASE_URI || 'http://localhost:3000').replace(/\/$/, '');
}

function listUrl(statusPurpose = 'revocation') {
  return `${base()}/api/credentials/status/bitstring-status-list/${statusPurpose}`;
}

function usedIndexes(statusPurpose) {
  const credentials = loadState().lists[statusPurpose].credentials;
  return new Set(Object.values(credentials).map(entry => entry.statusListIndex));
}

function randomFreeIndex(bits, taken) {
  if (taken.size >= bits) {
    throw new Error(`Status list exhausted for ${bits} entries`);
  }

  while (true) {
    const candidate = crypto.randomInt(0, bits);
    if (!taken.has(candidate)) return candidate;
  }
}

export function ensureCredentialStatus(credentialId, statusPurpose = 'revocation') {
  const state = loadState();
  const list = state.lists[statusPurpose];
  if (list.credentials[credentialId]) {
    return {
      ...list.credentials[credentialId],
      id: `${listUrl(statusPurpose)}#${list.credentials[credentialId].statusListIndex}`,
      type: 'BitstringStatusListEntry',
      statusPurpose,
      statusListCredential: listUrl(statusPurpose),
    };
  }

  const statusListIndex = randomFreeIndex(list.bits, usedIndexes(statusPurpose));
  const now = new Date().toISOString();
  list.credentials[credentialId] = {
    statusListIndex,
    revoked: false,
    createdAt: now,
    updatedAt: now,
  };
  saveState();

  return {
    id: `${listUrl(statusPurpose)}#${statusListIndex}`,
    type: 'BitstringStatusListEntry',
    statusPurpose,
    statusListIndex,
    statusListCredential: listUrl(statusPurpose),
  };
}

export function setCredentialRevocation(credentialId, revoked = true, statusPurpose = 'revocation') {
  const entry = ensureCredentialStatus(credentialId, statusPurpose);
  const list = loadState().lists[statusPurpose];
  list.credentials[credentialId].revoked = revoked;
  list.credentials[credentialId].updatedAt = new Date().toISOString();
  saveState();
  return {
    credentialId,
    revoked,
    ...entry,
  };
}

export function getCredentialStatusEntry(credentialId, statusPurpose = 'revocation') {
  const list = loadState().lists[statusPurpose];
  const entry = list.credentials[credentialId];
  if (!entry) return null;
  return {
    id: `${listUrl(statusPurpose)}#${entry.statusListIndex}`,
    type: 'BitstringStatusListEntry',
    statusPurpose,
    statusListIndex: entry.statusListIndex,
    statusListCredential: listUrl(statusPurpose),
    revoked: entry.revoked,
  };
}

function buildBitstring(statusPurpose = 'revocation') {
  const list = loadState().lists[statusPurpose];
  const bytes = Buffer.alloc(Math.ceil(list.bits / 8));

  for (const entry of Object.values(list.credentials)) {
    if (!entry.revoked) continue;
    const byteIndex = Math.floor(entry.statusListIndex / 8);
    const bitOffset = entry.statusListIndex % 8;
    bytes[byteIndex] |= (1 << (7 - bitOffset));
  }

  return bytes;
}

export function getEncodedStatusList(statusPurpose = 'revocation') {
  const compressed = zlib.gzipSync(buildBitstring(statusPurpose));
  return `u${compressed.toString('base64url')}`;
}

export function getStatusListCredentialMetadata(statusPurpose = 'revocation') {
  const list = loadState().lists[statusPurpose];
  return {
    id: listUrl(statusPurpose),
    type: ['VerifiableCredential', 'BitstringStatusListCredential'],
    credentialSubject: {
      id: `${listUrl(statusPurpose)}#list`,
      type: 'BitstringStatusList',
      statusPurpose,
      encodedList: getEncodedStatusList(statusPurpose),
    },
    stats: {
      totalAssigned: Object.keys(list.credentials).length,
      totalRevoked: Object.values(list.credentials).filter(entry => entry.revoked).length,
      sizeBits: list.bits,
    },
  };
}
