import { decodeCredentialDocument } from './envelopedVc';

export type UntpCredentialKind = 'dte' | 'dpp' | 'dcc';
export type UntpEntityType = 'ore' | 'bar' | 'product';

export interface UntpCredentialTarget {
  kind: UntpCredentialKind;
  entityType: UntpEntityType;
  id: string;
}

export interface UntpDisplayField {
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}

export interface UntpDisplaySection {
  title: string;
  fields: UntpDisplayField[];
}

export interface UntpDisplayStat {
  label: string;
  value: string;
}

export interface UntpCredentialDescription {
  badge: string;
  title: string;
  subtitle: string;
  accentColor: string;
  qrTitle: string;
  qrCaption: string;
  footer: string;
  metaFields: UntpDisplayField[];
  stats: UntpDisplayStat[];
  sections: UntpDisplaySection[];
}

type RouteParams = {
  id?: string;
  credentialKind?: string;
  entityType?: string;
};

const SUPPORTED_TARGETS = new Set([
  'dte:ore',
  'dte:bar',
  'dpp:product',
  'dcc:product',
]);

const BADGES: Record<UntpCredentialKind, string> = {
  dte: 'UNTP Digital Traceability Event',
  dpp: 'UNTP Digital Product Passport',
  dcc: 'UNTP Digital Conformity Credential',
};

const ACCENTS: Record<UntpEntityType, string> = {
  ore: '#d4af37',
  bar: '#f97316',
  product: '#10b981',
};

function targetKey(kind: string, entityType: string) {
  return `${kind}:${entityType}`;
}

function asText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function maybeHref(value: string | null): string | undefined {
  if (!value) return undefined;
  return /^https?:\/\//i.test(value) ? value : undefined;
}

function formatDateTime(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
}

function metalName(value: unknown): string {
  const raw = (asText(value) || '').toUpperCase();
  if (raw === 'AU' || raw === 'GOLD') return 'Gold';
  if (raw === 'AG' || raw === 'SILVER') return 'Silver';
  return raw || 'Gold';
}

function formatWeight(value: unknown, unit: unknown = 'GRM'): string | null {
  if (typeof value !== 'number') return asText(value);
  const suffix = asText(unit) === 'GRM' ? 'g' : asText(unit) || '';
  return `${value.toLocaleString()} ${suffix}`.trim();
}

function formatFineness(value: unknown): string | null {
  if (typeof value !== 'number') return asText(value);
  return `${(value / 10).toFixed(1)}‰`;
}

function truncate(value: unknown): string | null {
  const raw = asText(value);
  if (!raw) return null;
  return raw.length > 22 ? `${raw.slice(0, 12)}…${raw.slice(-6)}` : raw;
}

function compactFields(fields: Array<UntpDisplayField | null>): UntpDisplayField[] {
  return fields.filter((field): field is UntpDisplayField => Boolean(field && field.value));
}

function compactStats(stats: Array<UntpDisplayStat | null>): UntpDisplayStat[] {
  return stats.filter((stat): stat is UntpDisplayStat => Boolean(stat && stat.value));
}

function field(label: string, value: unknown, options: { mono?: boolean; href?: string } = {}) {
  const text = asText(value);
  if (!text) return null;
  return { label, value: text, href: options.href || maybeHref(text), mono: options.mono };
}

function stat(label: string, value: unknown) {
  const text = asText(value);
  if (!text) return null;
  return { label, value: text };
}

function section(title: string, fields: Array<UntpDisplayField | null>): UntpDisplaySection | null {
  const filtered = compactFields(fields);
  if (filtered.length === 0) return null;
  return { title, fields: filtered };
}

function summarizeInputItems(items: unknown[]): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items
    .map((item) => {
      const entry = item as Record<string, unknown>;
      return asText(entry.name) || truncate(entry.id) || null;
    })
    .filter(Boolean)
    .join(', ');
}

function buildOreDescription(claims: any, header: any): UntpCredentialDescription {
  const subject = claims?.credentialSubject || {};
  const issuer = typeof claims?.issuer === 'object' ? claims.issuer : { id: claims?.issuer, name: claims?.issuer };
  const epcItem = subject.epcList?.[0] || {};
  const readPoint = subject.readPoint || {};
  const ilmd = subject.ilmd || {};
  const evidence = Array.isArray(claims?.evidence) ? claims.evidence[0] : claims?.evidence || {};
  const issuedDate = claims?.validFrom || claims?.issuanceDate;
  const metal = metalName(epcItem.metalCode);

  return {
    badge: BADGES.dte,
    title: `${metal} Ore Extraction`,
    subtitle: asText(epcItem.name) || asText(subject.bizLocation) || asText(readPoint.id) || 'Mine extraction event',
    accentColor: ACCENTS.ore,
    qrTitle: BADGES.dte,
    qrCaption: "Scan to verify this ore's UNTP credential",
    footer: 'Issued under the UN Transparency Protocol (UNTP) as a Digital Traceability Event.',
    metaFields: compactFields([
      field('Type', Array.isArray(claims?.type) ? claims.type.join(', ') : claims?.type),
      field('Issuer', asText(issuer?.name) || asText(issuer?.id)),
      field('Issued', formatDateTime(issuedDate)),
      field('Algorithm', header?.alg),
    ]),
    stats: compactStats([
      stat('Weight', formatWeight(epcItem.weight?.value, epcItem.weight?.unit)),
      stat('Origin Country', asText(readPoint.country) || asText(ilmd.originCountry)),
      stat('Mineral Type', ilmd.mineralType),
      stat('Issued', issuedDate ? new Date(issuedDate).toLocaleDateString() : null),
    ]),
    sections: [
      section('Extraction Details', [
        field('Mine / Location', asText(readPoint.id) || asText(subject.bizLocation)),
        field('Origin Country', asText(readPoint.country) || asText(ilmd.originCountry)),
        field('Mineral Type', ilmd.mineralType),
        field('Estimated Grade', ilmd.estimatedGrade),
        field('Metal', metal),
        field('Weight', formatWeight(epcItem.weight?.value, epcItem.weight?.unit)),
        field('Event Time', formatDateTime(subject.eventTime)),
        field('Disposition', subject.disposition),
      ]),
      section('Issuer', [
        field('Name', issuer?.name),
        field('DID', issuer?.id, { mono: true }),
      ]),
      section('Blockchain Evidence', [
        field('Type', asText(evidence?.name) || asText(evidence?.type)),
        field('TX Hash', evidence?.txHash, { mono: true, href: asText(evidence?.explorerUrl) || undefined }),
        field('Block Number', evidence?.blockNumber),
      ]),
      section('Proof', [
        field('Envelope Type', claims?.type ? (Array.isArray(claims.type) ? claims.type.join(', ') : claims.type) : null),
        field('Suite', header?.typ || 'vc+jwt'),
        field('Algorithm', header?.alg),
        field('Key ID', header?.kid, { mono: true }),
      ]),
      section('Credential ID', [
        field('ID', claims?.id, { mono: true }),
      ]),
    ].filter((item): item is UntpDisplaySection => Boolean(item)),
  };
}

function buildBarDescription(claims: any, header: any): UntpCredentialDescription {
  const subject = claims?.credentialSubject || {};
  const issuer = typeof claims?.issuer === 'object' ? claims.issuer : { id: claims?.issuer, name: claims?.issuer };
  const output = subject.outputItemList?.[0] || {};
  const inputItems = Array.isArray(subject.inputItemList) ? subject.inputItemList : [];
  const evidence = Array.isArray(claims?.evidence) ? claims.evidence[0] : claims?.evidence || {};
  const issuedDate = claims?.validFrom || claims?.issuanceDate;
  const metal = metalName(output.metalCode);

  return {
    badge: BADGES.dte,
    title: `${metal} Bar Refinement`,
    subtitle: asText(output.name) || asText(subject.readPoint?.id) || asText(subject.bizLocation) || 'Refinery transformation event',
    accentColor: ACCENTS.bar,
    qrTitle: BADGES.dte,
    qrCaption: "Scan to verify this refined bar's UNTP credential",
    footer: 'Issued under the UN Transparency Protocol (UNTP) as a refinery transformation event.',
    metaFields: compactFields([
      field('Type', Array.isArray(claims?.type) ? claims.type.join(', ') : claims?.type),
      field('Issuer', asText(issuer?.name) || asText(issuer?.id)),
      field('Issued', formatDateTime(issuedDate)),
      field('Algorithm', header?.alg),
    ]),
    stats: compactStats([
      stat('Weight', formatWeight(output.weight?.value, output.weight?.unit)),
      stat('Fineness', formatFineness(output.finenessPPT)),
      stat('Input Ores', inputItems.length ? `${inputItems.length}` : null),
      stat('Issued', issuedDate ? new Date(issuedDate).toLocaleDateString() : null),
    ]),
    sections: [
      section('Refinement Details', [
        field('Refinery', asText(subject.readPoint?.id) || asText(subject.bizLocation)),
        field('Serial Number', output.serialNumber),
        field('Metal', metal),
        field('Weight', formatWeight(output.weight?.value, output.weight?.unit)),
        field('Fineness', formatFineness(output.finenessPPT)),
        field('Event Time', formatDateTime(subject.eventTime)),
        field('Business Step', subject.bizStep),
      ]),
      section('Input Ores', [
        field('Count', inputItems.length ? String(inputItems.length) : null),
        field('Items', summarizeInputItems(inputItems)),
      ]),
      section('Output Item', [
        field('Output ID', output.id, { mono: true }),
        field('Output Name', output.name),
      ]),
      section('Issuer', [
        field('Name', issuer?.name),
        field('DID', issuer?.id, { mono: true }),
      ]),
      section('Blockchain Evidence', [
        field('Type', asText(evidence?.name) || asText(evidence?.type)),
        field('TX Hash', evidence?.txHash, { mono: true, href: asText(evidence?.explorerUrl) || undefined }),
        field('Block Number', evidence?.blockNumber),
      ]),
      section('Proof', [
        field('Envelope Type', claims?.type ? (Array.isArray(claims.type) ? claims.type.join(', ') : claims.type) : null),
        field('Suite', header?.typ || 'vc+jwt'),
        field('Algorithm', header?.alg),
        field('Key ID', header?.kid, { mono: true }),
      ]),
      section('Credential ID', [
        field('ID', claims?.id, { mono: true }),
      ]),
    ].filter((item): item is UntpDisplaySection => Boolean(item)),
  };
}

function buildProductPassportDescription(claims: any, header: any): UntpCredentialDescription {
  const subject = claims?.credentialSubject || {};
  const issuer = typeof claims?.issuer === 'object' ? claims.issuer : { id: claims?.issuer, name: claims?.issuer };
  const characteristics = subject.characteristics || {};
  const weight = subject.dimensions?.weight || {};
  const producer = subject.producedByParty || {};
  const traceability = Array.isArray(subject.traceabilityInformation) ? subject.traceabilityInformation[0] : null;
  const conformity = Array.isArray(subject.conformityInformation) ? subject.conformityInformation[0] : null;
  const attachment = Array.isArray(subject.attachments) ? subject.attachments[0] : null;
  const evidence = Array.isArray(claims?.evidence) ? claims.evidence[0] : claims?.evidence || {};
  const issuedDate = claims?.validFrom || claims?.issuanceDate;
  const metal = metalName(characteristics.metalCode);

  return {
    badge: BADGES.dpp,
    title: asText(subject.name) || `${metal} Product Passport`,
    subtitle: asText(subject.description) || asText(subject.registeredId?.id) || 'Digital Product Passport',
    accentColor: ACCENTS.product,
    qrTitle: BADGES.dpp,
    qrCaption: "Scan to open this product's UNTP passport",
    footer: 'Issued under the UN Transparency Protocol (UNTP) as a Digital Product Passport.',
    metaFields: compactFields([
      field('Type', Array.isArray(claims?.type) ? claims.type.join(', ') : claims?.type),
      field('Issuer', asText(issuer?.name) || asText(issuer?.id)),
      field('Issued', formatDateTime(issuedDate)),
      field('Algorithm', header?.alg),
    ]),
    stats: compactStats([
      stat('Weight', formatWeight(weight.value, weight.unit)),
      stat('Fineness', asText(characteristics.fineness) || formatFineness(characteristics.finenessPPT)),
      stat('Product Type', characteristics.productType),
      stat('Issued', issuedDate ? new Date(issuedDate).toLocaleDateString() : null),
    ]),
    sections: [
      section('Product Details', [
        field('Name', subject.name),
        field('Description', subject.description),
        field('SKU', subject.registeredId?.id),
        field('Serial Number', subject.serialNumber),
        field('Metal', metal),
        field('Product Type', characteristics.productType),
        field('Hallmark', characteristics.hallmark),
        field('Weight', formatWeight(weight.value, weight.unit)),
        field('Fineness', asText(characteristics.fineness) || formatFineness(characteristics.finenessPPT)),
        field('Production Date', formatDateTime(subject.productionDate)),
      ]),
      section('Produced By', [
        field('Name', producer.name),
        field('ID', producer.id, { mono: true }),
      ]),
      section('Traceability', [
        field('Source Event', traceability?.eventReference, { mono: true }),
        field('Event Type', traceability?.eventType),
        field('Trace Depth', traceability?.tracedTo),
        field('Verified', typeof traceability?.verified === 'boolean' ? String(traceability.verified) : null),
        field('Verified Ratio', typeof traceability?.verifiedRatio === 'number' ? String(traceability.verifiedRatio) : null),
      ]),
      section('Conformity Information', [
        field('Topic', conformity?.topic),
        field('Standard', conformity?.standardOrRegulation),
        field('Credential Reference', conformity?.credentialReference, { mono: true, href: asText(conformity?.credentialReference) || undefined }),
      ]),
      section('Attachments', [
        field('Attachment Type', attachment?.type),
        field('Merkle Root', attachment?.merkleRoot, { mono: true }),
        field('Manifest CID', attachment?.manifestCID, { mono: true }),
      ]),
      section('Issuer', [
        field('Name', issuer?.name),
        field('DID', issuer?.id, { mono: true }),
      ]),
      section('Blockchain Evidence', [
        field('Type', asText(evidence?.name) || asText(evidence?.type)),
        field('TX Hash', evidence?.txHash, { mono: true, href: asText(evidence?.explorerUrl) || undefined }),
        field('Block Number', evidence?.blockNumber),
      ]),
      section('Proof', [
        field('Envelope Type', claims?.type ? (Array.isArray(claims.type) ? claims.type.join(', ') : claims.type) : null),
        field('Suite', header?.typ || 'vc+jwt'),
        field('Algorithm', header?.alg),
        field('Key ID', header?.kid, { mono: true }),
      ]),
      section('Credential ID', [
        field('ID', claims?.id, { mono: true }),
      ]),
    ].filter((item): item is UntpDisplaySection => Boolean(item)),
  };
}

function buildProductConformityDescription(claims: any, header: any): UntpCredentialDescription {
  const subject = claims?.credentialSubject || {};
  const issuer = typeof claims?.issuer === 'object' ? claims.issuer : { id: claims?.issuer, name: claims?.issuer };
  const assessment = Array.isArray(subject.conformityAssessment) ? subject.conformityAssessment[0] : {};
  const criterion = Array.isArray(assessment?.conformityCriteria) ? assessment.conformityCriteria[0] : {};
  const measured = criterion?.measuredValue || {};
  const characteristics = assessment?.characteristics || {};
  const evidenceItem = Array.isArray(subject.evidence) ? subject.evidence[0] : null;
  const chainEvidence = Array.isArray(claims?.evidence) ? claims.evidence[0] : claims?.evidence || {};
  const issuedDate = claims?.validFrom || claims?.issuanceDate;
  const metal = metalName(characteristics.metalCode);

  return {
    badge: BADGES.dcc,
    title: asText(subject.name) || 'Assay Certificate',
    subtitle: asText(assessment?.referenceStandard?.name) || 'Digital Conformity Credential',
    accentColor: ACCENTS.product,
    qrTitle: BADGES.dcc,
    qrCaption: "Scan to verify this product's UNTP assay credential",
    footer: 'Issued under the UN Transparency Protocol (UNTP) as a Digital Conformity Credential.',
    metaFields: compactFields([
      field('Type', Array.isArray(claims?.type) ? claims.type.join(', ') : claims?.type),
      field('Issuer', asText(issuer?.name) || asText(issuer?.id)),
      field('Issued', formatDateTime(issuedDate)),
      field('Algorithm', header?.alg),
    ]),
    stats: compactStats([
      stat('Fineness', asText(measured.metric) || formatFineness(measured.value)),
      stat('Hallmark', characteristics.hallmark),
      stat('Product Type', characteristics.productType),
      stat('Issued', issuedDate ? new Date(issuedDate).toLocaleDateString() : null),
    ]),
    sections: [
      section('Attestation Details', [
        field('Attestation Type', subject.attestationType),
        field('Assessor Level', subject.assessorLevel),
        field('Assessment Level', subject.assessmentLevel),
        field('Assessment Date', formatDateTime(assessment?.assessmentDate)),
        field('Reference Standard', assessment?.referenceStandard?.name),
      ]),
      section('Assessing Party', [
        field('Name', subject.assessingParty?.name),
        field('ID', subject.assessingParty?.id, { mono: true }),
        field('Assessed Facility', subject.assessedFacility?.id, { mono: true }),
      ]),
      section('Product Assessment', [
        field('Product', assessment?.name),
        field('Product ID', assessment?.id, { mono: true }),
        field('Metal', metal),
        field('Weight', formatWeight(characteristics.weightGrams)),
        field('Hallmark', characteristics.hallmark),
        field('SKU', characteristics.sku),
        field('Product Type', characteristics.productType),
        field('Measured Fineness', asText(measured.metric) || formatFineness(measured.value)),
        field('Conformance', typeof criterion?.conformanceStatus === 'boolean' ? String(criterion.conformanceStatus) : null),
      ]),
      section('Embedded Evidence', [
        field('Evidence Type', evidenceItem?.type),
        field('Merkle Root', evidenceItem?.merkleRoot, { mono: true }),
        field('Manifest CID', evidenceItem?.manifestCID, { mono: true }),
      ]),
      section('Issuer', [
        field('Name', issuer?.name),
        field('DID', issuer?.id, { mono: true }),
      ]),
      section('Blockchain Evidence', [
        field('Type', asText(chainEvidence?.name) || asText(chainEvidence?.type)),
        field('TX Hash', chainEvidence?.txHash, { mono: true, href: asText(chainEvidence?.explorerUrl) || undefined }),
        field('Block Number', chainEvidence?.blockNumber),
      ]),
      section('Proof', [
        field('Envelope Type', claims?.type ? (Array.isArray(claims.type) ? claims.type.join(', ') : claims.type) : null),
        field('Suite', header?.typ || 'vc+jwt'),
        field('Algorithm', header?.alg),
        field('Key ID', header?.kid, { mono: true }),
      ]),
      section('Credential ID', [
        field('ID', claims?.id, { mono: true }),
      ]),
    ].filter((item): item is UntpDisplaySection => Boolean(item)),
  };
}

export function isSupportedUntpTarget(kind: string, entityType: string) {
  return SUPPORTED_TARGETS.has(targetKey(kind, entityType));
}

export function resolveUntpRouteTarget(params: RouteParams): UntpCredentialTarget | null {
  if (!params.id) return null;

  if (!params.credentialKind && !params.entityType) {
    return { kind: 'dte', entityType: 'ore', id: params.id };
  }

  if (!params.credentialKind || !params.entityType) return null;
  if (!isSupportedUntpTarget(params.credentialKind, params.entityType)) return null;

  return {
    kind: params.credentialKind as UntpCredentialKind,
    entityType: params.entityType as UntpEntityType,
    id: params.id,
  };
}

export function getUntpApiPath(target: UntpCredentialTarget) {
  const key = targetKey(target.kind, target.entityType);
  switch (key) {
    case 'dte:ore':
      return `/api/credentials/dte/ore/${target.id}`;
    case 'dte:bar':
      return `/api/credentials/dte/bar/${target.id}`;
    case 'dpp:product':
      return `/api/credentials/dpp/product/${target.id}`;
    case 'dcc:product':
      return `/api/credentials/dcc/product/${target.id}`;
    default:
      throw new Error(`Unsupported UNTP credential target: ${key}`);
  }
}

export function getUntpViewerPath(target: UntpCredentialTarget) {
  return `/vc/${target.kind}/${target.entityType}/${target.id}`;
}

export function describeUntpCredential(target: UntpCredentialTarget, document: Record<string, unknown> | null) {
  const { claims, header } = decodeCredentialDocument(document);

  if (!claims) {
    return null;
  }

  const key = targetKey(target.kind, target.entityType);
  switch (key) {
    case 'dte:ore':
      return buildOreDescription(claims, header);
    case 'dte:bar':
      return buildBarDescription(claims, header);
    case 'dpp:product':
      return buildProductPassportDescription(claims, header);
    case 'dcc:product':
      return buildProductConformityDescription(claims, header);
    default:
      return null;
  }
}
