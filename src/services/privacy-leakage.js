function hasPlaintextExposure(value) {
  if (value == null) return false;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'bigint') return value > 0n;
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) return false;
    if (normalized === 'PRIVATE') return false;
    if (/^0x[a-fA-F0-9]{64}$/.test(normalized)) return false;
    if (/hash$/i.test(normalized)) return false;
    return true;
  }
  return false;
}

function buildArticleLeakageChecks(record) {
  const commitments = record.publicState?.commitmentRefs || {};

  return [
    {
      category: 'counterparty_identity',
      applicable: Boolean(commitments.counterparty),
      inferable: hasPlaintextExposure(record.publicState?.ownerRef)
        || hasPlaintextExposure(record.publicState?.currentCustodian)
        || hasPlaintextExposure(record.counterpartyRef),
      evidence: 'Counterparty should only appear as a commitment reference.',
    },
    {
      category: 'grade',
      applicable: record.stage === 'ORE' && Boolean(commitments.originGrade),
      inferable: hasPlaintextExposure(record.publicState?.countryCode)
        || hasPlaintextExposure(record.publicState?.gradeValue)
        || hasPlaintextExposure(record.publicState?.estimatedGrade),
      evidence: 'Origin and grade should remain hidden behind the ore commitment.',
    },
    {
      category: 'yield',
      applicable: record.stage === 'BAR' && Boolean(commitments.yield),
      inferable: hasPlaintextExposure(record.publicState?.yieldBps)
        || hasPlaintextExposure(record.publicState?.outputWeightGrams)
        || hasPlaintextExposure(record.publicState?.inputWeightGrams),
      evidence: 'Yield should remain hidden behind the transformation commitment.',
    },
    {
      category: 'price',
      applicable: Boolean(commitments.price),
      inferable: hasPlaintextExposure(record.publicState?.priceCents)
        || hasPlaintextExposure(record.priceCents),
      evidence: 'Price should only appear as a commitment reference.',
    },
  ];
}

function scoreArticleModeLeakage(records) {
  const checks = [];

  for (const record of records) {
    const recordChecks = buildArticleLeakageChecks(record)
      .filter((check) => check.applicable)
      .map((check) => ({
        batchId: record.id,
        stage: record.stage,
        ...check,
      }));
    checks.push(...recordChecks);
  }

  const inferableCount = checks.filter((check) => check.inferable).length;
  const totalApplicable = checks.length;
  const leakagePercent = totalApplicable === 0
    ? 0
    : (inferableCount / totalApplicable) * 100;

  const byCategory = checks.reduce((acc, check) => {
    const current = acc[check.category] || { applicable: 0, inferable: 0 };
    current.applicable += 1;
    if (check.inferable) current.inferable += 1;
    acc[check.category] = current;
    return acc;
  }, {});

  return {
    metricDefinition: 'Fraction of confidential attribute instances inferable by an adversary restricted to public article-mode data.',
    inferableCount,
    totalApplicable,
    leakagePercent: Math.round(leakagePercent * 1000) / 1000,
    byCategory,
    checks,
  };
}

export { buildArticleLeakageChecks, scoreArticleModeLeakage };
