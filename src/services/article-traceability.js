import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import zkOreProofService from './zk-ore-proof.js';
import zkNumericProofService from './zk-numeric-proof.js';
import { computeTaggedCommitment, encodeCommitmentHex, normalizeBigInt } from './zk-commitments.js';
import {
  closeBatchesByScope,
  getAnchorBatch,
  getProof as getMerkleProof,
  ingestCertificate,
  processUnanchoredBatches,
  getMetrics as getMerkleMetrics,
} from './merkle/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'article_traceability_private.json');
const PERSIST = process.env.DB_TYPE === 'file' || process.env.DB_TYPE === undefined;
const DEFAULT_SCOPE_TYPE = process.env.ARTICLE_TRACEABILITY_SCOPE_TYPE || 'shipment';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadState() {
  if (!PERSIST || !fs.existsSync(DATA_FILE)) {
    return {
      records: {},
      events: {},
      scopes: {},
    };
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return {
      records: {},
      events: {},
      scopes: {},
    };
  }
}

function hashStrings(values) {
  return `0x${createHash('sha256').update(values.join('|')).digest('hex')}`;
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeRecord(record) {
  if (!record) return null;
  return {
    id: record.id,
    lifecycleId: record.lifecycleId,
    stage: record.stage,
    metal: record.metal,
    status: record.status,
    publicState: record.publicState,
    parentBatchIds: [...record.parentBatchIds],
    latestEventId: record.latestEventId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

class ArticleTraceabilityService {
  constructor() {
    const state = loadState();
    this.records = new Map(Object.entries(state.records || {}));
    this.events = new Map(Object.entries(state.events || {}));
    this.scopes = new Map(Object.entries(state.scopes || {}));
  }

  _persist() {
    if (!PERSIST) return;
    ensureDir(DATA_DIR);
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      records: Object.fromEntries(this.records),
      events: Object.fromEntries(this.events),
      scopes: Object.fromEntries(this.scopes),
    }, null, 2));
  }

  _saveRecord(record) {
    this.records.set(record.id, record);
    this._persist();
    return record;
  }

  _saveEvent(event) {
    this.events.set(event.eventId, event);
    this._persist();
    return event;
  }

  _saveScope(scopeId, eventId) {
    const current = this.scopes.get(scopeId) || { scopeId, eventIds: [], lastUpdatedAt: null };
    current.eventIds.push(eventId);
    current.lastUpdatedAt = nowIso();
    this.scopes.set(scopeId, current);
    this._persist();
    return current;
  }

  _requireRecord(id) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error(`Private traceability record ${id} not found`);
    }
    return record;
  }

  _counterpartySalt(salt, fallbackLabel) {
    if (salt != null) return normalizeBigInt(salt, 'salt');
    return normalizeBigInt(hashStrings([fallbackLabel]), 'fallbackSalt');
  }

  async _commitCounterparty(ref, salt) {
    return computeTaggedCommitment('counterpartyRef', [
      hashStrings([String(ref || '').trim()]),
      normalizeBigInt(salt, 'counterpartySalt'),
    ]);
  }

  async _commitNumeric(tag, value, salt) {
    return computeTaggedCommitment(tag, [
      normalizeBigInt(value, `${tag}Value`),
      normalizeBigInt(salt, `${tag}Salt`),
    ]);
  }

  async _ingestPublicEvent({ scopeId, scopeType, eventId, payload, issuerKeyId }) {
    const merkle = ingestCertificate({
      certificateId: eventId,
      certificateJson: payload,
      docHashList: [],
      shipmentId: scopeId,
      issuerKeyId,
      schemaVersion: 'article-trace-v1',
      scopeType: scopeType || DEFAULT_SCOPE_TYPE,
      userId: 'article-traceability',
    });

    this._saveScope(scopeId, eventId);
    return merkle;
  }

  async registerOrePrivate({
    metal = 'GOLD',
    mineId,
    mineralType,
    weightGrams,
    countryCode,
    gradeValue,
    salt,
    ownerRef,
    ownerSalt,
    priceCents = null,
    priceSalt = null,
    scopeId = `lifecycle:${uuidv4()}`,
    scopeType = DEFAULT_SCOPE_TYPE,
  }) {
    if (!mineId || !mineralType || !weightGrams || !countryCode || gradeValue == null || salt == null || !ownerRef) {
      throw new Error('mineId, mineralType, weightGrams, countryCode, gradeValue, salt, and ownerRef are required');
    }

    const batchId = `ore:${uuidv4()}`;
    const oreCommitment = await zkOreProofService.computeCommitment({ countryCode, gradeValue, salt });
    const ownerCommitment = await this._commitCounterparty(ownerRef, ownerSalt ?? this._counterpartySalt(salt, ownerRef));
    const priceCommitment = priceCents == null
      ? null
      : await this._commitNumeric('priceCents', priceCents, priceSalt ?? salt);

    const eventId = uuidv4();
    const publicPayload = {
      _schemaVersion: 'article-trace-v1',
      eventType: 'ore_registered',
      batchId,
      lifecycleId: scopeId,
      stage: 'ORE',
      metal,
      mineralType,
      attributeCommitments: {
        originGrade: oreCommitment.commitmentHex,
        counterparty: ownerCommitment.commitmentHex,
        price: priceCommitment?.commitmentHex || null,
      },
      lineageRoot: null,
      documentRoot: null,
      createdAt: nowIso(),
    };

    const merkle = await this._ingestPublicEvent({
      scopeId,
      scopeType,
      eventId,
      payload: publicPayload,
      issuerKeyId: ownerCommitment.commitmentHex,
    });

    const record = {
      id: batchId,
      lifecycleId: scopeId,
      stage: 'ORE',
      metal,
      status: 'ACTIVE',
      parentBatchIds: [],
      latestEventId: eventId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      publicState: {
        mineIdHash: hashStrings([mineId]),
        mineralType,
        commitmentRefs: {
          originGrade: oreCommitment.commitmentHex,
          counterparty: ownerCommitment.commitmentHex,
          price: priceCommitment?.commitmentHex || null,
        },
      },
      privateState: {
        mineId,
        weightGrams: Number(weightGrams),
        countryCode,
        gradeValue: Number(gradeValue),
        salt: String(salt),
        ownerRef,
        ownerSalt: String(ownerSalt ?? this._counterpartySalt(salt, ownerRef)),
        priceCents: priceCents == null ? null : Number(priceCents),
        priceSalt: priceSalt == null ? null : String(priceSalt),
      },
    };

    this._saveRecord(record);
    this._saveEvent({
      eventId,
      batchId,
      lifecycleId: scopeId,
      eventType: 'ore_registered',
      scopeId,
      merkleBatchId: merkle.anchorBatch.batchId,
      createdAt: nowIso(),
      publicPayload,
    });

    return {
      record: sanitizeRecord(record),
      merkle,
    };
  }

  async transferCustodyPrivate({
    batchId,
    toCounterpartyRef,
    toCounterpartySalt,
    fromCounterpartyRef = null,
    fromCounterpartySalt = null,
    scopeId = null,
    scopeType = DEFAULT_SCOPE_TYPE,
  }) {
    const record = this._requireRecord(batchId);
    if (!toCounterpartyRef) {
      throw new Error('toCounterpartyRef is required');
    }

    const actualFromRef = fromCounterpartyRef || record.privateState.ownerRef;
    const fromCommitment = await this._commitCounterparty(
      actualFromRef,
      fromCounterpartySalt ?? record.privateState.ownerSalt,
    );
    const toCommitment = await this._commitCounterparty(
      toCounterpartyRef,
      toCounterpartySalt ?? this._counterpartySalt(record.privateState.salt, toCounterpartyRef),
    );
    const eventId = uuidv4();
    const lifecycleId = scopeId || record.lifecycleId;
    const publicPayload = {
      _schemaVersion: 'article-trace-v1',
      eventType: 'custody_transferred',
      batchId,
      lifecycleId,
      stage: record.stage,
      metal: record.metal,
      transferCommitment: (await computeTaggedCommitment('custodyTransfer', [
        normalizeBigInt(fromCommitment.commitment, 'fromCommitment'),
        normalizeBigInt(toCommitment.commitment, 'toCommitment'),
      ])).commitmentHex,
      createdAt: nowIso(),
    };

    const merkle = await this._ingestPublicEvent({
      scopeId: lifecycleId,
      scopeType,
      eventId,
      payload: publicPayload,
      issuerKeyId: toCommitment.commitmentHex,
    });

    record.publicState.commitmentRefs.counterparty = toCommitment.commitmentHex;
    record.privateState.ownerRef = toCounterpartyRef;
    record.privateState.ownerSalt = String(toCounterpartySalt ?? this._counterpartySalt(record.privateState.salt, toCounterpartyRef));
    record.latestEventId = eventId;
    record.updatedAt = nowIso();

    this._saveRecord(record);
    this._saveEvent({
      eventId,
      batchId,
      lifecycleId,
      eventType: 'custody_transferred',
      scopeId: lifecycleId,
      merkleBatchId: merkle.anchorBatch.batchId,
      createdAt: nowIso(),
      publicPayload,
    });

    return {
      record: sanitizeRecord(record),
      merkle,
    };
  }

  async refinePrivate({
    inputBatchIds,
    metal = 'GOLD',
    refineryRef,
    refinerySalt,
    outputWeightGrams,
    finenessPPT,
    puritySalt,
    yieldSalt,
    priceCents = null,
    priceSalt = null,
    scopeId = `lifecycle:${uuidv4()}`,
    scopeType = DEFAULT_SCOPE_TYPE,
  }) {
    if (!Array.isArray(inputBatchIds) || inputBatchIds.length === 0) {
      throw new Error('inputBatchIds must contain at least one batch');
    }
    if (!refineryRef || outputWeightGrams == null || finenessPPT == null || puritySalt == null || yieldSalt == null) {
      throw new Error('refineryRef, outputWeightGrams, finenessPPT, puritySalt, and yieldSalt are required');
    }

    const inputs = inputBatchIds.map((id) => this._requireRecord(id));
    const totalInputWeight = inputs.reduce((sum, item) => sum + BigInt(item.privateState.weightGrams), 0n);
    if (totalInputWeight === 0n) {
      throw new Error('Total input weight must be greater than zero');
    }

    const outputWeight = normalizeBigInt(outputWeightGrams, 'outputWeightGrams');
    const yieldBps = Number((outputWeight * 10000n) / totalInputWeight);
    const purityCommitment = await zkNumericProofService.computeCommitment({
      fieldTag: 'purityPPT',
      value: finenessPPT,
      salt: puritySalt,
    });
    const yieldCommitment = await this._commitNumeric('yieldBps', yieldBps, yieldSalt);
    const refinerCommitment = await this._commitCounterparty(refineryRef, refinerySalt ?? this._counterpartySalt(puritySalt, refineryRef));
    const priceCommitment = priceCents == null
      ? null
      : await this._commitNumeric('priceCents', priceCents, priceSalt ?? puritySalt);

    const batchId = `bar:${uuidv4()}`;
    const eventId = uuidv4();
    const inputRoot = hashStrings([...inputBatchIds].sort());
    const publicPayload = {
      _schemaVersion: 'article-trace-v1',
      eventType: 'transformation_recorded',
      batchId,
      lifecycleId: scopeId,
      stage: 'BAR',
      metal,
      lineageRoot: inputRoot,
      attributeCommitments: {
        purity: purityCommitment.commitmentHex,
        yield: yieldCommitment.commitmentHex,
        counterparty: refinerCommitment.commitmentHex,
        price: priceCommitment?.commitmentHex || null,
      },
      createdAt: nowIso(),
    };

    const merkle = await this._ingestPublicEvent({
      scopeId,
      scopeType,
      eventId,
      payload: publicPayload,
      issuerKeyId: refinerCommitment.commitmentHex,
    });

    for (const input of inputs) {
      input.status = 'CONSUMED';
      input.updatedAt = nowIso();
      this._saveRecord(input);
    }

    const record = {
      id: batchId,
      lifecycleId: scopeId,
      stage: 'BAR',
      metal,
      status: 'ACTIVE',
      parentBatchIds: [...inputBatchIds],
      latestEventId: eventId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      publicState: {
        lineageRoot: inputRoot,
        commitmentRefs: {
          purity: purityCommitment.commitmentHex,
          yield: yieldCommitment.commitmentHex,
          counterparty: refinerCommitment.commitmentHex,
          price: priceCommitment?.commitmentHex || null,
        },
      },
      privateState: {
        refineryRef,
        ownerRef: refineryRef,
        ownerSalt: String(refinerySalt ?? this._counterpartySalt(puritySalt, refineryRef)),
        weightGrams: Number(outputWeightGrams),
        finenessPPT: Number(finenessPPT),
        puritySalt: String(puritySalt),
        yieldBps,
        yieldSalt: String(yieldSalt),
        priceCents: priceCents == null ? null : Number(priceCents),
        priceSalt: priceSalt == null ? null : String(priceSalt),
      },
    };

    this._saveRecord(record);
    this._saveEvent({
      eventId,
      batchId,
      lifecycleId: scopeId,
      eventType: 'transformation_recorded',
      scopeId,
      merkleBatchId: merkle.anchorBatch.batchId,
      createdAt: nowIso(),
      publicPayload,
    });

    return {
      record: sanitizeRecord(record),
      merkle,
    };
  }

  async certifyPrivate({
    inputBatchId,
    assayerRef,
    assayerSalt,
    productType,
    hallmark,
    sku,
    finenessPPT = null,
    puritySalt = null,
    priceCents = null,
    priceSalt = null,
    scopeId = `lifecycle:${uuidv4()}`,
    scopeType = DEFAULT_SCOPE_TYPE,
  }) {
    const input = this._requireRecord(inputBatchId);
    if (!assayerRef || !productType || !hallmark || !sku) {
      throw new Error('assayerRef, productType, hallmark, and sku are required');
    }

    const purityValue = finenessPPT == null ? input.privateState.finenessPPT : Number(finenessPPT);
    const actualPuritySalt = puritySalt ?? input.privateState.puritySalt;
    if (purityValue == null || actualPuritySalt == null) {
      throw new Error('A purity commitment is required to certify a product');
    }

    const purityCommitment = await zkNumericProofService.computeCommitment({
      fieldTag: 'purityPPT',
      value: purityValue,
      salt: actualPuritySalt,
    });
    const assayerCommitment = await this._commitCounterparty(assayerRef, assayerSalt ?? this._counterpartySalt(actualPuritySalt, assayerRef));
    const priceCommitment = priceCents == null
      ? null
      : await this._commitNumeric('priceCents', priceCents, priceSalt ?? actualPuritySalt);

    const batchId = `product:${uuidv4()}`;
    const eventId = uuidv4();
    const publicPayload = {
      _schemaVersion: 'article-trace-v1',
      eventType: 'attestation_recorded',
      batchId,
      lifecycleId: scopeId,
      stage: 'PRODUCT',
      metal: input.metal,
      lineageRoot: hashStrings([inputBatchId]),
      attributeCommitments: {
        purity: purityCommitment.commitmentHex,
        counterparty: assayerCommitment.commitmentHex,
        price: priceCommitment?.commitmentHex || null,
      },
      productTypeHash: hashStrings([productType]),
      hallmarkHash: hashStrings([hallmark]),
      skuHash: hashStrings([sku]),
      createdAt: nowIso(),
    };

    const merkle = await this._ingestPublicEvent({
      scopeId,
      scopeType,
      eventId,
      payload: publicPayload,
      issuerKeyId: assayerCommitment.commitmentHex,
    });

    input.status = 'ATTESTED_INPUT';
    input.updatedAt = nowIso();
    this._saveRecord(input);

    const record = {
      id: batchId,
      lifecycleId: scopeId,
      stage: 'PRODUCT',
      metal: input.metal,
      status: 'ACTIVE',
      parentBatchIds: [inputBatchId],
      latestEventId: eventId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      publicState: {
        lineageRoot: hashStrings([inputBatchId]),
        commitmentRefs: {
          purity: purityCommitment.commitmentHex,
          counterparty: assayerCommitment.commitmentHex,
          price: priceCommitment?.commitmentHex || null,
        },
      },
      privateState: {
        assayerRef,
        ownerRef: assayerRef,
        ownerSalt: String(assayerSalt ?? this._counterpartySalt(actualPuritySalt, assayerRef)),
        productType,
        hallmark,
        sku,
        weightGrams: input.privateState.weightGrams,
        finenessPPT: purityValue,
        puritySalt: String(actualPuritySalt),
        priceCents: priceCents == null ? null : Number(priceCents),
        priceSalt: priceSalt == null ? null : String(priceSalt),
      },
    };

    this._saveRecord(record);
    this._saveEvent({
      eventId,
      batchId,
      lifecycleId: scopeId,
      eventType: 'attestation_recorded',
      scopeId,
      merkleBatchId: merkle.anchorBatch.batchId,
      createdAt: nowIso(),
      publicPayload,
    });

    return {
      record: sanitizeRecord(record),
      merkle,
    };
  }

  getRecord(id, { includePrivate = false } = {}) {
    const record = this._requireRecord(id);
    return includePrivate ? record : sanitizeRecord(record);
  }

  getEvent(eventId) {
    return this.events.get(eventId) || null;
  }

  async proveOriginGrade(batchId, { countryCode, gradeValue, salt, minGrade, allowedCountries }) {
    const record = this._requireRecord(batchId);
    if (record.stage !== 'ORE') {
      throw new Error('Origin/grade proof is only available for ore records');
    }

    const proof = await zkOreProofService.generateProof({
      countryCode,
      gradeValue,
      salt,
      minGrade,
      allowedCountries,
      expectedCommitment: record.publicState.commitmentRefs.originGrade,
    });

    return {
      batchId,
      expectedCommitment: record.publicState.commitmentRefs.originGrade,
      proof,
    };
  }

  async provePurity(batchId, { purityPPT, salt, minValue }) {
    const record = this._requireRecord(batchId);
    const commitment = record.publicState.commitmentRefs.purity;
    if (!commitment) {
      throw new Error('This record does not carry a purity commitment');
    }

    const proof = await zkNumericProofService.generateProof({
      fieldTag: 'purityPPT',
      value: purityPPT,
      salt,
      minValue,
      expectedCommitment: commitment,
    });

    return {
      batchId,
      expectedCommitment: commitment,
      proof,
    };
  }

  async closeAndAnchorScope(scopeId) {
    const closed = closeBatchesByScope(scopeId, 'article-traceability');
    const anchors = await processUnanchoredBatches();
    return {
      scopeId,
      closed,
      anchors,
    };
  }

  getVerificationBundle(batchId) {
    const record = this._requireRecord(batchId);
    const event = this.events.get(record.latestEventId);
    const merkleProof = event?.merkleBatchId ? getMerkleProof(event.eventId, event.merkleBatchId) : null;
    const anchorBatch = event?.merkleBatchId ? getAnchorBatch(event.merkleBatchId) : null;

    return {
      record: sanitizeRecord(record),
      latestEvent: event || null,
      merkleProof,
      anchorBatch,
    };
  }

  getMetrics() {
    const records = Array.from(this.records.values());
    const merkleMetrics = getMerkleMetrics();

    return {
      totalRecords: records.length,
      activeRecords: records.filter((record) => record.status === 'ACTIVE').length,
      consumedRecords: records.filter((record) => record.status === 'CONSUMED').length,
      stages: {
        ore: records.filter((record) => record.stage === 'ORE').length,
        bar: records.filter((record) => record.stage === 'BAR').length,
        product: records.filter((record) => record.stage === 'PRODUCT').length,
      },
      confidentialAttributesOnChain: [
        'counterparty identity',
        'grade',
        'yield',
        'price',
      ],
      architecture: {
        onChain: ['Merkle roots', 'commitments', 'batch state'],
        offChain: ['counterparty refs', 'exact grades', 'exact yields', 'prices', 'weights'],
      },
      merkle: merkleMetrics,
    };
  }
}

export { ArticleTraceabilityService, sanitizeRecord, encodeCommitmentHex };
export default new ArticleTraceabilityService();
