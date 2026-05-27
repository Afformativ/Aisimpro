function decodeSegment(segment: string) {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(Math.ceil(segment.length / 4) * 4, '=')
  return JSON.parse(window.atob(padded))
}

export function decodeCredentialDocument(document: Record<string, any> | null) {
  if (!document) {
    return { envelope: null, claims: null, header: null, jwt: null }
  }

  if (
    document.type === 'EnvelopedVerifiableCredential'
    && typeof document.id === 'string'
    && document.id.startsWith('data:application/vc+jwt,')
  ) {
    const jwt = document.id.slice('data:application/vc+jwt,'.length)
    const [headerPart, payloadPart] = jwt.split('.')
    return {
      envelope: document,
      claims: decodeSegment(payloadPart),
      header: decodeSegment(headerPart),
      jwt,
    }
  }

  return {
    envelope: document,
    claims: document,
    header: null,
    jwt: null,
  }
}
