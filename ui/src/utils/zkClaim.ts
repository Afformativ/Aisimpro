// The fixed demo claim, as public signals 1..4 of the ore circuit:
// minGrade 500 (5.00 g/t) and the approved countries CA, AU, US.
const EXPECTED_PUBLIC_SIGNALS = ['500', '17217', '16725', '21843'];

export function matchesDemoClaim(publicSignals: string[]) {
  if (publicSignals.length !== EXPECTED_PUBLIC_SIGNALS.length + 1) return false;
  try {
    return EXPECTED_PUBLIC_SIGNALS.every((value, i) => BigInt(publicSignals[i + 1]) === BigInt(value));
  } catch {
    return false;
  }
}

export function shortHash(hash: string) {
  return hash.length > 12 ? `${hash.slice(0, 6)}…${hash.slice(-4)}` : hash;
}
