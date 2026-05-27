import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, MapPin, Scale, Pickaxe, ExternalLink, ShieldCheck, Hash, Clock, User } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:3000/api`;
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');

const METAL_COLOR: Record<string, string> = {
  AU: '#d4af37',
  GOLD: '#d4af37',
  AG: '#c0c0c0',
  SILVER: '#c0c0c0',
};

function Field({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value == null || value === '') return null;
  return (
    <div className="vc-field">
      <span className="vc-field-label">{label}</span>
      <span className={mono ? 'vc-field-mono' : 'vc-field-value'}>{String(value)}</span>
    </div>
  );
}

export default function OreCredential() {
  const { id } = useParams<{ id: string }>();
  const [vc, setVc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`${SERVER_BASE}/api/credentials/dte/ore/${id}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setVc)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div className="vc-page">
      <div className="vc-loading">
        <div className="loading-spinner" />
        <p>Loading credential…</p>
      </div>
    </div>
  );

  if (error || !vc) return (
    <div className="vc-page">
      <div className="vc-error">
        <ShieldCheck size={48} color="#e53e3e" />
        <h2>Credential Not Found</h2>
        <p>{error || 'This credential could not be loaded.'}</p>
      </div>
    </div>
  );

  const subject = vc.credentialSubject || {};
  const issuer = typeof vc.issuer === 'object' ? vc.issuer : { id: vc.issuer, name: vc.issuer };
  const epcItem = subject.epcList?.[0] || {};
  const readPoint = subject.readPoint || {};
  const ilmd = subject.ilmd || {};
  const evidence = vc.evidence?.[0] || {};
  const proof = vc.proof || {};
  const metalCode = epcItem.metalCode || ilmd.metalCode || 'AU';
  const metalColor = METAL_COLOR[metalCode] || '#d4af37';
  const metalName = metalCode === 'AU' || metalCode === 'GOLD' ? 'Gold' : metalCode === 'AG' || metalCode === 'SILVER' ? 'Silver' : metalCode;
  const weightVal = epcItem.weight?.value;
  const weightUnit = epcItem.weight?.unit || 'GRM';
  const issuedDate = vc.validFrom || vc.issuanceDate;

  return (
    <div className="vc-page">
      <div className="vc-card">

        {/* Header */}
        <div className="vc-header" style={{ borderColor: metalColor }}>
          <div className="vc-header-icon" style={{ background: metalColor }}>
            <Pickaxe size={28} color="#fff" />
          </div>
          <div className="vc-header-text">
            <div className="vc-badge">UNTP Digital Traceability Event</div>
            <h1 className="vc-title">
              {metalName} Ore Extraction
            </h1>
            <p className="vc-subtitle">{epcItem.name || subject.bizLocation || readPoint.id || '—'}</p>
          </div>
          <div className="vc-verified-badge">
            <CheckCircle size={20} color="#38a169" />
            <span>Verifiable Credential</span>
          </div>
        </div>

        {/* Key stats */}
        <div className="vc-stats">
          {weightVal && (
            <div className="vc-stat">
              <Scale size={20} style={{ color: metalColor }} />
              <div>
                <div className="vc-stat-value">{Number(weightVal).toLocaleString()} {weightUnit === 'GRM' ? 'g' : weightUnit}</div>
                <div className="vc-stat-label">Weight</div>
              </div>
            </div>
          )}
          {(readPoint.country || ilmd.originCountry) && (
            <div className="vc-stat">
              <MapPin size={20} style={{ color: metalColor }} />
              <div>
                <div className="vc-stat-value">{readPoint.country || ilmd.originCountry}</div>
                <div className="vc-stat-label">Origin Country</div>
              </div>
            </div>
          )}
          {ilmd.mineralType && (
            <div className="vc-stat">
              <Pickaxe size={20} style={{ color: metalColor }} />
              <div>
                <div className="vc-stat-value">{ilmd.mineralType}</div>
                <div className="vc-stat-label">Mineral Type</div>
              </div>
            </div>
          )}
          {issuedDate && (
            <div className="vc-stat">
              <Clock size={20} style={{ color: metalColor }} />
              <div>
                <div className="vc-stat-value">{new Date(issuedDate).toLocaleDateString()}</div>
                <div className="vc-stat-label">Issued</div>
              </div>
            </div>
          )}
        </div>

        {/* Sections */}
        <div className="vc-sections">

          <div className="vc-section">
            <div className="vc-section-title"><Pickaxe size={15} /> Extraction Details</div>
            <Field label="Mine / Location" value={readPoint.id || subject.bizLocation} />
            <Field label="Origin Country" value={readPoint.country || ilmd.originCountry} />
            <Field label="Mineral Type" value={ilmd.mineralType} />
            <Field label="Estimated Grade" value={ilmd.estimatedGrade} />
            <Field label="Metal" value={metalName} />
            {weightVal && <Field label="Weight" value={`${Number(weightVal).toLocaleString()} ${weightUnit === 'GRM' ? 'grams' : weightUnit}`} />}
            <Field label="Event Time" value={subject.eventTime ? new Date(subject.eventTime).toLocaleString() : null} />
            <Field label="Disposition" value={subject.disposition} />
          </div>

          <div className="vc-section">
            <div className="vc-section-title"><User size={15} /> Issuer</div>
            <Field label="Name" value={issuer.name} />
            <Field label="DID" value={issuer.id} mono />
          </div>

          {evidence.txHash && (
            <div className="vc-section">
              <div className="vc-section-title"><Hash size={15} /> Blockchain Evidence</div>
              <Field label="Type" value={evidence.name || evidence.type} />
              <Field label="TX Hash" value={evidence.txHash} mono />
              {evidence.explorerUrl && (
                <a href={evidence.explorerUrl} target="_blank" rel="noopener noreferrer" className="vc-explorer-link">
                  <ExternalLink size={14} /> View on Blockchain Explorer
                </a>
              )}
            </div>
          )}

          <div className="vc-section vc-section-proof">
            <div className="vc-section-title"><ShieldCheck size={15} /> Proof</div>
            <Field label="Type" value={proof.type} />
            <Field label="Suite" value={proof.cryptosuite} />
            <Field label="Created" value={proof.created ? new Date(proof.created).toLocaleString() : null} />
            <Field label="Purpose" value={proof.proofPurpose} />
            <Field label="Verification Method" value={proof.verificationMethod} mono />
          </div>

          <div className="vc-section vc-section-id">
            <div className="vc-section-title"><Hash size={15} /> Credential ID</div>
            <code className="vc-id-code">{vc.id}</code>
          </div>

        </div>

        <div className="vc-footer">
          <span>Issued under the <strong>UN Transparency Protocol (UNTP)</strong> — Digital Traceability Event v0.6</span>
          <a href="https://uncefact.github.io/spec-untp/" target="_blank" rel="noopener noreferrer">
            Learn more <ExternalLink size={11} />
          </a>
        </div>

      </div>
    </div>
  );
}
