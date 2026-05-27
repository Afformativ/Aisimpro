function normalize(value, fallback) {
  return (value || fallback).replace(/\/$/, '');
}

function didFromBaseUri(baseUri) {
  try {
    const url = new URL(baseUri);
    const host = url.hostname.replace(/\./g, ':');
    const path = url.pathname.replace(/^\/+|\/+$/g, '');
    return path ? `did:web:${host}:${path.replace(/\//g, ':')}` : `did:web:${host}`;
  } catch {
    return 'did:web:localhost';
  }
}

export function getConfiguredUntpBaseUri() {
  return normalize(process.env.UNTP_BASE_URI || 'http://localhost:3000', 'http://localhost:3000');
}

export function getRequestOrigin(req) {
  const protoHeader = req.headers['x-forwarded-proto'];
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader || req.protocol || 'http');
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!host) return null;
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function getActiveUntpBaseUri(req) {
  const configured = getConfiguredUntpBaseUri();
  const requestOrigin = getRequestOrigin(req);

  if (!requestOrigin) return configured;
  if (configured.includes('localhost')) return requestOrigin;

  try {
    const configuredHost = new URL(configured).host;
    const requestHost = new URL(requestOrigin).host;
    return configuredHost === requestHost ? configured : requestOrigin;
  } catch {
    return requestOrigin;
  }
}

export function getActiveUntpDid(req) {
  const configuredDid = process.env.UNTP_DID;
  const activeBaseUri = getActiveUntpBaseUri(req);

  if (!configuredDid || configuredDid === 'did:web:localhost') {
    return didFromBaseUri(activeBaseUri);
  }

  try {
    const expectedDid = didFromBaseUri(activeBaseUri);
    return configuredDid === expectedDid ? configuredDid : expectedDid;
  } catch {
    return configuredDid;
  }
}

export function didFromBase(baseUri) {
  return didFromBaseUri(baseUri);
}
