import fs from 'fs';
import path from 'path';
import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const KEY_PATH = process.env.UNTP_SIGNING_KEY_PATH || path.join(DATA_DIR, 'untp-signing-key.jwk');

let cachedPrivateKey = null;
let cachedPublicJwk = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function parsePrivateJwk(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error('UNTP_SIGNING_PRIVATE_JWK must be valid JSON');
  }
}

function loadEnvPrivateKey() {
  if (process.env.UNTP_SIGNING_PRIVATE_JWK) {
    return createPrivateKey({
      key: parsePrivateJwk(process.env.UNTP_SIGNING_PRIVATE_JWK),
      format: 'jwk',
    });
  }

  if (process.env.UNTP_SIGNING_PRIVATE_PEM) {
    return createPrivateKey(process.env.UNTP_SIGNING_PRIVATE_PEM);
  }

  return null;
}

function loadFilePrivateKey() {
  if (!fs.existsSync(KEY_PATH)) return null;
  const raw = fs.readFileSync(KEY_PATH, 'utf8');
  return createPrivateKey({
    key: JSON.parse(raw),
    format: 'jwk',
  });
}

function createAndPersistKey() {
  ensureDataDir();
  const { privateKey } = generateKeyPairSync('ed25519');
  const privateJwk = privateKey.export({ format: 'jwk' });
  fs.writeFileSync(KEY_PATH, JSON.stringify(privateJwk, null, 2));
  return privateKey;
}

export function getUntpPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;

  cachedPrivateKey = loadEnvPrivateKey()
    || loadFilePrivateKey()
    || createAndPersistKey();

  return cachedPrivateKey;
}

export function getUntpPublicJwk() {
  if (cachedPublicJwk) return cachedPublicJwk;
  cachedPublicJwk = createPublicKey(getUntpPrivateKey()).export({ format: 'jwk' });
  return cachedPublicJwk;
}

export function getUntpKeyId(did) {
  return `${did}#key-1`;
}
