import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Pickaxe,
  Flame,
  Award,
  ArrowRight,
  CheckCircle,
  Plus,
  Scale,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Gem,
  Wallet,
  Link,
  AlertTriangle,
  Fuel,
  ShieldAlert,
  QrCode,
} from 'lucide-react';
import * as api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import type { OnChainOre, OnChainBar, OnChainProduct, TraceabilityStatus, GasStatus } from '../types';
import UntpCredentialModal from '../components/UntpCredentialModal';
import type { UntpCredentialTarget } from '../utils/untpCredentials';

const METAL_COLORS: Record<string, string> = {
  GOLD: '#d4af37',
  SILVER: '#c0c0c0',
};

function tsToDate(ts: number) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function shortId(id: string) {
  if (!id) return '—';
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function friendlyError(err: Error): string {
  const msg = err.message || '';
  if (msg.includes('insufficient funds') || msg.includes('INSUFFICIENT_FUNDS'))
    return '⚠️ Insufficient funds — your wallet needs more POL/ETH to pay gas. Top up via the Polygon faucet.';
  if (msg.includes('NONCE_EXPIRED') || msg.includes('nonce'))
    return '⚠️ Nonce conflict — please retry in a few seconds.';
  if (msg.includes('CALL_EXCEPTION'))
    return '⚠️ Contract call failed — check if the input IDs exist and you have the required role.';
  if (msg.includes('Transaction too expensive'))
    return `⛽ ${msg}`;
  return msg;
}

export default function OnChainTraceability() {
  const queryClient = useQueryClient();
  const { hasAnyRole, user } = useAuth();
  const [activeForm, setActiveForm] = useState<'ore' | 'refine' | 'certify' | 'transfer' | null>(null);
  const [expandedOre, setExpandedOre] = useState<string | null>(null);
  const [expandedBar, setExpandedBar] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);
  const [transferRecordType, setTransferRecordType] = useState<'ore' | 'bar' | 'product'>('product');

  const [untpTarget, setUntpTarget] = useState<UntpCredentialTarget | null>(null);

  // Role flags matching smart-contract roles
  const canMine    = hasAnyRole('MINER', 'ADMIN');
  const canRefine  = hasAnyRole('REFINER', 'ADMIN');
  const canCertify = hasAnyRole('ASSAYER', 'ADMIN');
  const canTransfer = hasAnyRole('DEALER', 'ADMIN');
  const canWrite   = canMine || canRefine || canCertify || canTransfer;

  // ── Queries ──────────────────────────────────────────────────────
  const { data: status } = useQuery<TraceabilityStatus>({
    queryKey: ['traceability-status'],
    queryFn: api.getTraceabilityStatus,
    refetchInterval: 15000,
  });

  const { data: ores = [] } = useQuery<OnChainOre[]>({
    queryKey: ['traceability-ores'],
    queryFn: api.getOres,
  });

  const { data: bars = [] } = useQuery<OnChainBar[]>({
    queryKey: ['traceability-bars'],
    queryFn: api.getBars,
  });

  const { data: products = [] } = useQuery<OnChainProduct[]>({
    queryKey: ['traceability-products'],
    queryFn: api.getProducts,
  });

  const { data: gasInfo } = useQuery<GasStatus>({
    queryKey: ['traceability-gas'],
    queryFn: api.getGasInfo,
    refetchInterval: 20000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['traceability-events'],
    queryFn: api.getTraceabilityEvents,
    refetchInterval: 15000,
  });

  // Track the last tx cost to show after mutation
  const [lastTxGas, setLastTxGas] = useState<{ action: string; gasUsed: number; gasPriceGwei: number; txCostPOL: number } | null>(null);

  const latestCustodyEventByRecord = new Map<string, string>();
  events.forEach((event) => {
    if (event.type !== 'CustodyTransferred') return;
    const recordType = typeof event.data?.recordType === 'string' ? event.data.recordType : null;
    const recordId = typeof event.data?.id === 'string' ? event.data.id : event.id;
    if (!recordType || !recordId) return;
    const eventId = typeof event.data?.txHash === 'string' && event.data.txHash
      ? event.data.txHash
      : String(event.data?.timestamp || event.timestamp);
    latestCustodyEventByRecord.set(`${recordType}:${recordId}`, eventId);
  });

  // ── Mutations ────────────────────────────────────────────────────
  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['traceability-ores'] });
    queryClient.invalidateQueries({ queryKey: ['traceability-bars'] });
    queryClient.invalidateQueries({ queryKey: ['traceability-products'] });
    queryClient.invalidateQueries({ queryKey: ['traceability-events'] });
    queryClient.invalidateQueries({ queryKey: ['traceability-status'] });
  };

  const oreMutation = useMutation({
    mutationFn: api.registerOre,
    onSuccess: (data) => {
      invalidateAll(); setActiveForm(null);
      if (data.gasInfo) setLastTxGas({ action: 'Register Ore', ...data.gasInfo });
    },
  });

  const refineMutation = useMutation({
    mutationFn: api.refineOre,
    onSuccess: (data) => {
      invalidateAll(); setActiveForm(null);
      if (data.gasInfo) setLastTxGas({ action: 'Refine Bar', ...data.gasInfo });
    },
  });

  const certifyMutation = useMutation({
    mutationFn: api.certifyBar,
    onSuccess: (data) => {
      invalidateAll(); setActiveForm(null);
      if (data.gasInfo) setLastTxGas({ action: 'Certify Product', ...data.gasInfo });
    },
  });

  const transferMutation = useMutation({
    mutationFn: api.transferTraceabilityCustody,
    onSuccess: (data) => {
      invalidateAll(); setActiveForm(null);
      if (data.gasInfo) setLastTxGas({ action: 'Transfer Custody', ...data.gasInfo });
    },
  });

  // ── Ore form handler ────────────────────────────────────────────
  const handleOreSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    oreMutation.mutate({
      metal: fd.get('metal') as string,
      mineId: fd.get('mineId') as string,
      originCountry: fd.get('originCountry') as string,
      mineralType: fd.get('mineralType') as string,
      weightGrams: parseInt(fd.get('weightGrams') as string, 10),
      estimatedGrade: fd.get('estimatedGrade') as string,
    });
  };

  // ── Refine form handler ─────────────────────────────────────────
  const handleRefineSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const selectedOreIds = Array.from(fd.getAll('oreIds') as string[]);
    refineMutation.mutate({
      oreIds: selectedOreIds,
      metal: fd.get('metal') as string,
      refineryId: fd.get('refineryId') as string,
      outputWeightGrams: parseInt(fd.get('outputWeightGrams') as string, 10),
      finenessPPT: parseInt(fd.get('finenessPPT') as string, 10),
      barSerialNumber: fd.get('barSerialNumber') as string,
    });
  };

  // ── Certify form handler ────────────────────────────────────────
  const handleCertifySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    certifyMutation.mutate({
      inputBarId: fd.get('inputBarId') as string,
      metal: fd.get('metal') as string,
      assayerId: fd.get('assayerId') as string,
      weightGrams: parseInt(fd.get('weightGrams') as string, 10),
      finenessPPT: parseInt(fd.get('finenessPPT') as string, 10),
      hallmark: fd.get('hallmark') as string,
      sku: fd.get('sku') as string,
      productType: fd.get('productType') as string,
    });
  };

  const transferableRecords = transferRecordType === 'ore'
    ? ores.map((ore) => ({ id: ore.id, label: `${ore.mineId} — ${ore.metal} (${ore.weightGrams.toLocaleString()} g)` }))
    : transferRecordType === 'bar'
      ? bars.map((bar) => ({ id: bar.id, label: `${bar.barSerialNumber} — ${bar.metal} (${bar.outputWeightGrams.toLocaleString()} g)` }))
      : products.map((product) => ({ id: product.id, label: `${product.hallmark} — ${product.productType} (${product.weightGrams.toLocaleString()} g)` }));

  const handleTransferSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    transferMutation.mutate({
      recordType: fd.get('recordType') as 'ore' | 'bar' | 'product',
      id: fd.get('recordId') as string,
      to: fd.get('toAddress') as string,
    });
  };

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1>On-Chain Traceability</h1>
          <p className="subtitle">
            Smart-contract supply chain: Ore → Refined Bar → Certified Product
          </p>
        </div>
        <div className="connection-status">
          <span className={`status-badge ${status?.live ? 'live' : 'simulation'}`}>
            {status?.live ? (
              <><CheckCircle size={16} /> Live &mdash; {status.network || 'On-Chain'}</>
            ) : (
              <><Gem size={16} /> Simulation</>
            )}
          </span>
        </div>
      </div>

      {/* ── Pipeline Stats ─────────────────────────────────────── */}
      <div className="pipeline-stats">
        <div className={`pipeline-card pipeline-ore ${canMine ? '' : 'pipeline-card-readonly'}`} onClick={() => canMine && setActiveForm(activeForm === 'ore' ? null : 'ore')}>
          <Pickaxe size={28} />
          <div className="pipeline-count">{ores.length}</div>
          <div className="pipeline-label">Raw Ores</div>
          {canMine && <div className="pipeline-role-tag">MINER</div>}
        </div>
        <div className="pipeline-arrow"><ArrowRight size={24} /></div>
        <div className={`pipeline-card pipeline-bar ${canRefine ? '' : 'pipeline-card-readonly'}`} onClick={() => canRefine && setActiveForm(activeForm === 'refine' ? null : 'refine')}>
          <Flame size={28} />
          <div className="pipeline-count">{bars.length}</div>
          <div className="pipeline-label">Refined Bars</div>
          {canRefine && <div className="pipeline-role-tag">REFINER</div>}
        </div>
        <div className="pipeline-arrow"><ArrowRight size={24} /></div>
        <div className={`pipeline-card pipeline-product ${canCertify ? '' : 'pipeline-card-readonly'}`} onClick={() => canCertify && setActiveForm(activeForm === 'certify' ? null : 'certify')}>
          <Award size={28} />
          <div className="pipeline-count">{products.length}</div>
          <div className="pipeline-label">Certified Products</div>
          {canCertify && <div className="pipeline-role-tag">ASSAYER</div>}
        </div>
      </div>

      {/* ── Contract Info Banner ─────────────────────────────── */}
      {status && !status.simulation && (
        <div className="contract-banner">
          <div className="contract-banner-row">
            <div className="contract-banner-item">
              <Link size={14} />
              <span className="contract-banner-label">Contract</span>
              <code>{shortId(status.contractAddress || '')}</code>
              {status.explorerUrl && (
                <a href={`${status.explorerUrl}/address/${status.contractAddress}`} target="_blank" rel="noopener noreferrer" className="contract-banner-link">
                  <ExternalLink size={12} /> View
                </a>
              )}
            </div>
            <div className="contract-banner-item">
              <Wallet size={14} />
              <span className="contract-banner-label">Wallet</span>
              <code>{shortId(status.wallet || '')}</code>
              {status.explorerUrl && (
                <a href={`${status.explorerUrl}/address/${status.wallet}`} target="_blank" rel="noopener noreferrer" className="contract-banner-link">
                  <ExternalLink size={12} />
                </a>
              )}
            </div>
            <div className="contract-banner-item">
              <CheckCircle size={14} />
              <span className="contract-banner-label">Network</span>
              <strong>{status.network}</strong>
            </div>
          </div>

          {/* Gas info row */}
          {gasInfo && !gasInfo.simulation && (
            <div className="contract-banner-row gas-row">
              <div className="contract-banner-item">
                <Fuel size={14} />
                <span className="contract-banner-label">Gas</span>
                <span className={`gas-price-value gas-${gasInfo.gasPriceStatus || 'normal'}`}>
                  {gasInfo.gasPriceGwei} gwei
                </span>
                <span className="gas-breakdown">
                  (base {gasInfo.baseFeeGwei} + tip {gasInfo.priorityFeeGwei})
                </span>
                {gasInfo.gasPriceStatus === 'high' && <span className="gas-warning-badge"><ShieldAlert size={12} /> HIGH</span>}
                {gasInfo.gasPriceStatus === 'elevated' && <span className="gas-elevated-badge"><AlertTriangle size={12} /> ELEVATED</span>}
              </div>
              <div className="contract-banner-item">
                <Wallet size={14} />
                <span className="contract-banner-label">Balance</span>
                <strong>{gasInfo.walletBalancePOL?.toFixed(4)} POL</strong>
                {gasInfo.estimatedTxsRemaining != null && (
                  <span className="gas-txs-remaining">
                    (~{gasInfo.estimatedTxsRemaining} txs left)
                  </span>
                )}
              </div>
              <div className="contract-banner-item">
                <Fuel size={14} />
                <span className="contract-banner-label">Est. Cost</span>
                <span>~{gasInfo.estimatedTxCostPOL} POL/tx</span>
              </div>
              <div className="contract-banner-item">
                <ShieldAlert size={14} />
                <span className="contract-banner-label">Cap</span>
                <span>{status.gasConfig?.maxGasPriceGwei} gwei / {status.gasConfig?.maxTxCostPOL} POL</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Last TX Cost Toast ─────────────────────────────────── */}
      {lastTxGas && (
        <div className="tx-cost-toast">
          <div className="tx-cost-toast-content">
            <CheckCircle size={16} color="#4caf50" />
            <strong>{lastTxGas.action}</strong> completed —
            <Fuel size={14} />
            <span>{lastTxGas.gasUsed.toLocaleString()} gas × {lastTxGas.gasPriceGwei} gwei</span>
            = <strong>{lastTxGas.txCostPOL.toFixed(6)} POL</strong>
          </div>
          <button className="tx-cost-toast-close" onClick={() => setLastTxGas(null)}>×</button>
        </div>
      )}

      {/* ── Gas Price Warning ──────────────────────────────────── */}
      {gasInfo && gasInfo.gasPriceStatus === 'high' && canWrite && (
        <div className="gas-high-warning">
          <ShieldAlert size={16} />
          <span>
            Network gas is <strong>{gasInfo.gasPriceGwei} gwei</strong> (above {gasInfo.maxGasPriceGwei} gwei cap).
            Transactions will use the capped price or be rejected if estimated cost exceeds {gasInfo.maxTxCostPOL} POL.
            Consider waiting for gas to drop.
          </span>
        </div>
      )}

      {/* ── Role Badge ─────────────────────────────────────────── */}
      {user && (
        <div className="role-badge-row">
          <span className="role-badge-label">Your Roles:</span>
          {user.roles.map((r) => (
            <span key={r} className={`role-chip ${['MINER','REFINER','ASSAYER','DEALER'].includes(r) ? 'role-chip-mining' : ''}`}>{r}</span>
          ))}
          {!canWrite && (
            <span className="role-hint">Read-only — ask an admin to assign MINER / REFINER / ASSAYER to write on-chain</span>
          )}
        </div>
      )}

      {/* ── Quick-Action Buttons ──────────────────────────────── */}
      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {canMine && (
          <button className={`btn ${activeForm === 'ore' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveForm(activeForm === 'ore' ? null : 'ore')}>
            <Plus size={18} /> Register Ore
          </button>
        )}
        {canRefine && (
          <button className={`btn ${activeForm === 'refine' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveForm(activeForm === 'refine' ? null : 'refine')} disabled={ores.length === 0}>
            <Flame size={18} /> Refine → Bar
          </button>
        )}
        {canCertify && (
          <button className={`btn ${activeForm === 'certify' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveForm(activeForm === 'certify' ? null : 'certify')} disabled={bars.length === 0}>
            <Award size={18} /> Certify → Product
          </button>
        )}
        {canTransfer && (
          <button className={`btn ${activeForm === 'transfer' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setActiveForm(activeForm === 'transfer' ? null : 'transfer')} disabled={ores.length + bars.length + products.length === 0}>
            <Link size={18} /> Transfer Custody
          </button>
        )}
        {!canWrite && (
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', padding: '8px 0' }}>
            🔒 You have read-only access to on-chain data
          </span>
        )}
      </div>

      {/* ══════════════════════ FORMS ══════════════════════════ */}

      {activeForm === 'ore' && canMine && (
        <div className="card form-card">
          <h3><Pickaxe size={20} /> Register Raw Ore</h3>
          <form onSubmit={handleOreSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Metal *</label>
                <select name="metal" required>
                  <option value="GOLD">🥇 Gold</option>
                  <option value="SILVER">🥈 Silver</option>
                </select>
              </div>
              <div className="form-group">
                <label>Mine ID *</label>
                <input name="mineId" required placeholder="e.g. MINE-ZA-DRIEFONTEIN" />
              </div>
              <div className="form-group">
                <label>Origin Country *</label>
                <input name="originCountry" required placeholder="e.g. South Africa" />
              </div>
              <div className="form-group">
                <label>Mineral Type *</label>
                <input name="mineralType" required placeholder="e.g. reef, alluvial, lode" />
              </div>
              <div className="form-group">
                <label>Weight (grams) *</label>
                <input name="weightGrams" type="number" required min="1" placeholder="500000" />
              </div>
              <div className="form-group">
                <label>Estimated Grade *</label>
                <input name="estimatedGrade" required placeholder="e.g. 8 g/t" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={oreMutation.isPending}>
                {oreMutation.isPending ? 'Registering…' : 'Register Ore'}
              </button>
            </div>
            {oreMutation.isError && <div className="error-message"><AlertTriangle size={14} /> {friendlyError(oreMutation.error as Error)}</div>}
          </form>
        </div>
      )}

      {activeForm === 'refine' && canRefine && (
        <div className="card form-card">
          <h3><Flame size={20} /> Refine Ore → Bar</h3>
          <form onSubmit={handleRefineSubmit}>
            <div className="form-grid">
              <div className="form-group full-width">
                <label>Select Ore(s) to Smelt *</label>
                <div className="checkbox-grid">
                  {ores.map((ore) => (
                    <label key={ore.id} className="checkbox-card">
                      <input type="checkbox" name="oreIds" value={ore.id} />
                      <span style={{ color: METAL_COLORS[ore.metal] }}>{ore.metal}</span>
                      <span>{ore.mineId}</span>
                      <span className="text-muted">{ore.weightGrams.toLocaleString()} g</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="form-group">
                <label>Metal *</label>
                <select name="metal" required>
                  <option value="GOLD">🥇 Gold</option>
                  <option value="SILVER">🥈 Silver</option>
                </select>
              </div>
              <div className="form-group">
                <label>Refinery ID *</label>
                <input name="refineryId" required placeholder="e.g. RAND-REFINERY-ZA" />
              </div>
              <div className="form-group">
                <label>Output Weight (grams) *</label>
                <input name="outputWeightGrams" type="number" required min="1" placeholder="400000" />
              </div>
              <div className="form-group">
                <label>Fineness (PPT) *</label>
                <input name="finenessPPT" type="number" required min="1" max="10000" placeholder="9999" />
              </div>
              <div className="form-group">
                <label>Bar Serial Number *</label>
                <input name="barSerialNumber" required placeholder="e.g. RR-2026-001234" />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={refineMutation.isPending}>
                {refineMutation.isPending ? 'Refining…' : 'Smelt & Register Bar'}
              </button>
            </div>
            {refineMutation.isError && <div className="error-message"><AlertTriangle size={14} /> {friendlyError(refineMutation.error as Error)}</div>}
          </form>
        </div>
      )}

      {activeForm === 'certify' && canCertify && (
        <div className="card form-card">
          <h3><Award size={20} /> Certify Bar → Product</h3>
          <form onSubmit={handleCertifySubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Select Bar *</label>
                <select name="inputBarId" required>
                  <option value="">Choose bar…</option>
                  {bars.map((bar) => (
                    <option key={bar.id} value={bar.id}>
                      {bar.barSerialNumber} — {bar.metal} ({bar.outputWeightGrams.toLocaleString()} g)
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Metal *</label>
                <select name="metal" required>
                  <option value="GOLD">🥇 Gold</option>
                  <option value="SILVER">🥈 Silver</option>
                </select>
              </div>
              <div className="form-group">
                <label>Assayer ID *</label>
                <input name="assayerId" required placeholder="e.g. LBMA-ASSAYER-UK-003" />
              </div>
              <div className="form-group">
                <label>Weight (grams) *</label>
                <input name="weightGrams" type="number" required min="1" placeholder="400000" />
              </div>
              <div className="form-group">
                <label>Fineness (PPT) *</label>
                <input name="finenessPPT" type="number" required min="1" max="10000" placeholder="9999" />
              </div>
              <div className="form-group">
                <label>Hallmark *</label>
                <input name="hallmark" required placeholder="e.g. LBMA Good Delivery" />
              </div>
              <div className="form-group">
                <label>SKU *</label>
                <input name="sku" required placeholder="e.g. AU-BAR-400-9999" />
              </div>
              <div className="form-group">
                <label>Product Type *</label>
                <select name="productType" required>
                  <option value="bar">Bar</option>
                  <option value="coin">Coin</option>
                  <option value="ingot">Ingot</option>
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={certifyMutation.isPending}>
                {certifyMutation.isPending ? 'Certifying…' : 'Certify Product'}
              </button>
            </div>
            {certifyMutation.isError && <div className="error-message"><AlertTriangle size={14} /> {friendlyError(certifyMutation.error as Error)}</div>}
          </form>
        </div>
      )}

      {activeForm === 'transfer' && canTransfer && (
        <div className="card form-card">
          <h3><Link size={20} /> Transfer Custody</h3>
          <form onSubmit={handleTransferSubmit}>
            <div className="form-grid">
              <div className="form-group">
                <label>Record Type *</label>
                <select
                  name="recordType"
                  value={transferRecordType}
                  onChange={(e) => setTransferRecordType(e.target.value as 'ore' | 'bar' | 'product')}
                  required
                >
                  <option value="product">Certified Product</option>
                  <option value="bar">Refined Bar</option>
                  <option value="ore">Raw Ore</option>
                </select>
              </div>
              <div className="form-group">
                <label>Select Record *</label>
                <select name="recordId" required>
                  <option value="">Choose record…</option>
                  {transferableRecords.map((record) => (
                    <option key={record.id} value={record.id}>{record.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group full-width">
                <label>Destination Wallet *</label>
                <input name="toAddress" required placeholder="0x..." />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={transferMutation.isPending}>
                {transferMutation.isPending ? 'Transferring…' : 'Transfer Custody'}
              </button>
            </div>
            {transferMutation.isError && <div className="error-message"><AlertTriangle size={14} /> {friendlyError(transferMutation.error as Error)}</div>}
          </form>
        </div>
      )}

      {/* ══════════════════ RAW ORES TABLE ═════════════════════ */}
      <div className="card">
        <h3><Pickaxe size={20} /> Raw Ores</h3>
        {ores.length > 0 ? (
          <div className="onchain-list">
            {ores.map((ore) => (
              <div key={ore.id} className="onchain-row">
                <div
                  className="onchain-row-header"
                  onClick={() => setExpandedOre(expandedOre === ore.id ? null : ore.id)}
                >
                  <div className="onchain-row-main">
                    <span className="metal-badge" style={{ background: METAL_COLORS[ore.metal] }}>
                      {ore.metal}
                    </span>
                    <span className="onchain-mine">{ore.mineId}</span>
                    <span className="onchain-country"><MapPin size={14} /> {ore.originCountry}</span>
                    <span className="onchain-weight"><Scale size={14} /> {ore.weightGrams.toLocaleString()} g</span>
                  </div>
                  <div className="onchain-row-actions">
                    <button
                      className="qr-btn"
                      title="Open ore extraction UNTP event"
                      onClick={e => { e.stopPropagation(); setUntpTarget({ kind: 'dte', entityType: 'ore', id: ore.id }); }}
                    >
                      <QrCode size={13} /> DTE
                    </button>
                    <button
                      className="qr-btn"
                      title="Open ore UNTP passport"
                      onClick={e => { e.stopPropagation(); setUntpTarget({ kind: 'dpp', entityType: 'ore', id: ore.id }); }}
                    >
                      <QrCode size={13} /> DPP
                    </button>
                    {latestCustodyEventByRecord.get(`ore:${ore.id}`) && (
                      <button
                        className="qr-btn"
                        title="Open latest ore custody transfer event"
                        onClick={e => {
                          e.stopPropagation();
                          setUntpTarget({ kind: 'dte', entityType: 'ore', id: ore.id, eventId: latestCustodyEventByRecord.get(`ore:${ore.id}`) });
                        }}
                      >
                        <QrCode size={13} /> TX DTE
                      </button>
                    )}
                    {ore.explorerUrl && (
                      <a href={ore.explorerUrl} target="_blank" rel="noopener noreferrer" className="anchor-link-inline" onClick={e => e.stopPropagation()}>
                        <ExternalLink size={12} /> TX
                      </a>
                    )}
                    {expandedOre === ore.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedOre === ore.id && (
                  <div className="onchain-row-detail">
                    <div className="detail-grid">
                      <div><span className="detail-label">ID</span><code>{ore.id}</code></div>
                      <div><span className="detail-label">Mineral Type</span>{ore.mineralType}</div>
                      <div><span className="detail-label">Estimated Grade</span>{ore.estimatedGrade}</div>
                      <div><span className="detail-label">Extracted At</span>{tsToDate(ore.extractedAt)}</div>
                      <div><span className="detail-label">Custodian</span><code>{shortId(ore.currentCustodian)}</code></div>
                      <div><span className="detail-label">TX Hash</span>{ore.explorerUrl
                        ? <a href={ore.explorerUrl} target="_blank" rel="noopener noreferrer" className="tx-hash-link"><code>{shortId(ore.txHash || '')}</code> <ExternalLink size={11} /></a>
                        : <code>{ore.txHash || 'none'}</code>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state-small">
            <Pickaxe size={32} />
            <p>No ores registered yet. Click "Register Ore" to start.</p>
          </div>
        )}
      </div>

      {/* ══════════════════ REFINED BARS TABLE ═════════════════ */}
      <div className="card">
        <h3><Flame size={20} /> Refined Bars</h3>
        {bars.length > 0 ? (
          <div className="onchain-list">
            {bars.map((bar) => (
              <div key={bar.id} className="onchain-row">
                <div
                  className="onchain-row-header"
                  onClick={() => setExpandedBar(expandedBar === bar.id ? null : bar.id)}
                >
                  <div className="onchain-row-main">
                    <span className="metal-badge" style={{ background: METAL_COLORS[bar.metal] }}>
                      {bar.metal}
                    </span>
                    <span className="onchain-serial">{bar.barSerialNumber}</span>
                    <span className="onchain-weight"><Scale size={14} /> {bar.outputWeightGrams.toLocaleString()} g</span>
                    <span className="onchain-fineness">{(bar.finenessPPT / 10).toFixed(1)}‰</span>
                  </div>
                  <div className="onchain-row-actions">
                    <button
                      className="qr-btn"
                      title="Open bar refinement UNTP event"
                      onClick={e => { e.stopPropagation(); setUntpTarget({ kind: 'dte', entityType: 'bar', id: bar.id }); }}
                    >
                      <QrCode size={13} /> DTE
                    </button>
                    <button
                      className="qr-btn"
                      title="Open refined bar UNTP passport"
                      onClick={e => { e.stopPropagation(); setUntpTarget({ kind: 'dpp', entityType: 'bar', id: bar.id }); }}
                    >
                      <QrCode size={13} /> DPP
                    </button>
                    {latestCustodyEventByRecord.get(`bar:${bar.id}`) && (
                      <button
                        className="qr-btn"
                        title="Open latest bar custody transfer event"
                        onClick={e => {
                          e.stopPropagation();
                          setUntpTarget({ kind: 'dte', entityType: 'bar', id: bar.id, eventId: latestCustodyEventByRecord.get(`bar:${bar.id}`) });
                        }}
                      >
                        <QrCode size={13} /> TX DTE
                      </button>
                    )}
                    {bar.explorerUrl && (
                      <a href={bar.explorerUrl} target="_blank" rel="noopener noreferrer" className="anchor-link-inline" onClick={e => e.stopPropagation()}>
                        <ExternalLink size={12} /> TX
                      </a>
                    )}
                    {expandedBar === bar.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedBar === bar.id && (
                  <div className="onchain-row-detail">
                    <div className="detail-grid">
                      <div><span className="detail-label">ID</span><code>{bar.id}</code></div>
                      <div><span className="detail-label">Refinery</span>{bar.refineryId}</div>
                      <div><span className="detail-label">Input Ores</span>{bar.inputOreIds.length} ore(s)</div>
                      <div><span className="detail-label">Refined At</span>{tsToDate(bar.refinedAt)}</div>
                      <div><span className="detail-label">Custodian</span><code>{shortId(bar.currentCustodian)}</code></div>
                      <div><span className="detail-label">TX Hash</span>{bar.explorerUrl
                        ? <a href={bar.explorerUrl} target="_blank" rel="noopener noreferrer" className="tx-hash-link"><code>{shortId(bar.txHash || '')}</code> <ExternalLink size={11} /></a>
                        : <code>{bar.txHash || 'none'}</code>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state-small">
            <Flame size={32} />
            <p>No bars yet. Refine registered ores into bars.</p>
          </div>
        )}
      </div>

      {/* ══════════════════ CERTIFIED PRODUCTS ═════════════════ */}
      <div className="card">
        <h3><Award size={20} /> Certified Products</h3>
        {products.length > 0 ? (
          <div className="onchain-list">
            {products.map((prod) => (
              <div key={prod.id} className="onchain-row">
                <div
                  className="onchain-row-header"
                  onClick={() => setExpandedProduct(expandedProduct === prod.id ? null : prod.id)}
                >
                  <div className="onchain-row-main">
                    <span className="metal-badge" style={{ background: METAL_COLORS[prod.metal] }}>
                      {prod.metal}
                    </span>
                    <span className="onchain-hallmark">{prod.hallmark}</span>
                    <span className="onchain-weight"><Scale size={14} /> {prod.weightGrams.toLocaleString()} g</span>
                    <span className="onchain-type">{prod.productType}</span>
                  </div>
                  <div className="onchain-row-actions">
                    <button
                      className="qr-btn"
                      title="Open product UNTP passport"
                      onClick={e => { e.stopPropagation(); setUntpTarget({ kind: 'dpp', entityType: 'product', id: prod.id }); }}
                    >
                      <QrCode size={13} /> DPP
                    </button>
                    <button
                      className="qr-btn"
                      title="Open product UNTP conformity credential"
                      onClick={e => { e.stopPropagation(); setUntpTarget({ kind: 'dcc', entityType: 'product', id: prod.id }); }}
                    >
                      <QrCode size={13} /> DCC
                    </button>
                    {latestCustodyEventByRecord.get(`product:${prod.id}`) && (
                      <button
                        className="qr-btn"
                        title="Open latest product custody transfer event"
                        onClick={e => {
                          e.stopPropagation();
                          setUntpTarget({ kind: 'dte', entityType: 'product', id: prod.id, eventId: latestCustodyEventByRecord.get(`product:${prod.id}`) });
                        }}
                      >
                        <QrCode size={13} /> TX DTE
                      </button>
                    )}
                    {prod.explorerUrl && (
                      <a href={prod.explorerUrl} target="_blank" rel="noopener noreferrer" className="anchor-link-inline" onClick={e => e.stopPropagation()}>
                        <ExternalLink size={12} /> TX
                      </a>
                    )}
                    {expandedProduct === prod.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>
                {expandedProduct === prod.id && (
                  <div className="onchain-row-detail">
                    <div className="detail-grid">
                      <div><span className="detail-label">ID</span><code>{prod.id}</code></div>
                      <div><span className="detail-label">Assayer</span>{prod.assayerId}</div>
                      <div><span className="detail-label">SKU</span>{prod.sku}</div>
                      <div><span className="detail-label">Fineness</span>{(prod.finenessPPT / 10).toFixed(1)}‰</div>
                      <div><span className="detail-label">Certified At</span>{tsToDate(prod.certifiedAt)}</div>
                      <div><span className="detail-label">Custodian</span><code>{shortId(prod.currentCustodian)}</code></div>
                      <div><span className="detail-label">Source Bar</span><code>{shortId(prod.inputBarId)}</code></div>
                      <div><span className="detail-label">TX Hash</span>{prod.explorerUrl
                        ? <a href={prod.explorerUrl} target="_blank" rel="noopener noreferrer" className="tx-hash-link"><code>{shortId(prod.txHash || '')}</code> <ExternalLink size={11} /></a>
                        : <code>{prod.txHash || 'none'}</code>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state-small">
            <Award size={32} />
            <p>No certified products yet. Certify bars for market delivery.</p>
          </div>
        )}
      </div>

      {/* ── UNTP QR Modal ─────────────────────────────────────── */}
      {untpTarget && <UntpCredentialModal target={untpTarget} onClose={() => setUntpTarget(null)} />}

      {/* ── Info Box ───────────────────────────────────────────── */}
      <div className="info-box">
        <h4>⛏️ On-Chain Traceability — Role Permissions</h4>
        <ul>
          <li><strong>MINER</strong> — can register raw ore extraction at mine sites</li>
          <li><strong>REFINER</strong> — can smelt one or more ores into refined bullion bars</li>
          <li><strong>ASSAYER</strong> — can assay, hallmark, and certify bars for market</li>
          <li><strong>DEALER</strong> — can transfer custody of ore, bars, and certified products through UNTP TransactionEvents</li>
          <li><strong>AUDITOR / VIEWER</strong> — read-only access to all on-chain data</li>
          <li><strong>ADMIN / SUPERADMIN</strong> — full access to all operations</li>
          <li>Every entity ID is a <code>keccak256</code> hash of its fields — any auditor can recompute and verify</li>
          <li>
            {status?.simulation
              ? 'Running in simulation mode — no on-chain transactions'
              : (<>Contract <code>{shortId(status?.contractAddress || '')}</code> on <strong>{status?.network}</strong>
                  {status?.explorerUrl && (
                    <> — <a href={`${status.explorerUrl}/address/${status.contractAddress}`} target="_blank" rel="noopener noreferrer">view on explorer <ExternalLink size={12} /></a></>
                  )}
                </>)}
          </li>
        </ul>
      </div>
    </div>
  );
}
