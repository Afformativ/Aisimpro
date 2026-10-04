import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, XCircle, Loader2, ExternalLink } from 'lucide-react';
import * as api from '../services/api';
import type { ZkDemoClaim } from '../types';
import { matchesDemoClaim, shortHash } from '../utils/zkClaim';

type Result =
  | { kind: 'verified'; attestation: ZkDemoClaim['attestation'] }
  | { kind: 'no-proof' }
  | { kind: 'failed' }
  | { kind: 'error' };

export default function ZkClaims() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['zk-demo-claims'],
    queryFn: api.getZkDemoClaims,
  });
  const claims = data?.claims ?? [];

  const [selectedId, setSelectedId] = useState('');
  const [checking, setChecking] = useState(false);
  const [slow, setSlow] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const selected = claims.find((c) => c.id === selectedId) ?? claims[0];

  const handleVerify = async () => {
    if (!selected) return;
    // The result always belongs to the batch that was selected when Verify was pressed.
    const claim = selected;
    setResult(null);

    if (!claim.proof || !claim.publicSignals) {
      setResult({ kind: 'no-proof' });
      return;
    }
    if (!matchesDemoClaim(claim.publicSignals)) {
      setResult({ kind: 'failed' });
      return;
    }

    setChecking(true);
    const slowTimer = setTimeout(() => setSlow(true), 5000);
    try {
      const check = await api.verifyZkClaim(claim.oreId, claim.proof, claim.publicSignals);
      setResult(check.localVerified && check.contractVerified
        ? { kind: 'verified', attestation: claim.attestation }
        : { kind: 'failed' });
    } catch {
      setResult({ kind: 'error' });
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setChecking(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Verify a batch claim</h1>
          <p className="subtitle">
            A valid proof shows that the values recorded at registration meet these conditions, without including the values.
          </p>
        </div>
      </div>

      <div className="card zk-panel">
        {isLoading && <div className="loading">Loading demo batches...</div>}

        {error && (
          <div className="zk-result zk-err">
            <h4><XCircle size={18} /> Verification could not be completed.</h4>
            <p>Please try again in a minute.</p>
          </div>
        )}

        {!isLoading && !error && claims.length === 0 && (
          <div className="empty-state-small">No demo batches are prepared yet.</div>
        )}

        {claims.length > 0 && (
          <>
            <div className="form-group">
              <label htmlFor="zk-batch">Batch</label>
              <select
                id="zk-batch"
                value={selected?.id ?? ''}
                disabled={checking}
                onChange={(e) => {
                  setSelectedId(e.target.value);
                  setResult(null);
                }}
              >
                {claims.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <p className="zk-hint">This demo includes two prepared batches.</p>
            </div>

            <div className="zk-claim">
              <span className="zk-claim-label">Claim (fixed)</span>
              <ul>
                <li>Recorded country of origin is in the demo list: Canada, Australia, United States</li>
                <li>Grade recorded at registration is at least 5.00 g/t</li>
              </ul>
            </div>

            <button className="btn btn-primary" onClick={handleVerify} disabled={checking || !selected}>
              Verify
            </button>

            <div className="zk-result-area" aria-live="polite">
              {checking && (
                <div className="zk-loading">
                  <Loader2 size={18} className="zk-spin" />
                  <span>
                    {slow
                      ? 'Connecting to the verification service. The first request may take longer.'
                      : 'Checking the proof against the on-chain verifier.'}
                  </span>
                </div>
              )}

              {!checking && result?.kind === 'verified' && (
                <>
                  <div className="zk-result zk-ok">
                    <h4><CheckCircle size={18} /> Proof verified</h4>
                    <ul>
                      <li>Recorded country of origin is in the demo list</li>
                      <li>Recorded grade is at least 5.00 g/t</li>
                      <li>The proof does not include the exact country or grade</li>
                    </ul>
                  </div>
                  <div className="zk-record">
                    {result.attestation ? (
                      <>
                        Existing ZK attestation (Polygon Amoy testnet):{' '}
                        {result.attestation.explorerUrl ? (
                          <a href={result.attestation.explorerUrl} target="_blank" rel="noopener noreferrer">
                            {shortHash(result.attestation.txHash)} <ExternalLink size={12} />
                          </a>
                        ) : (
                          shortHash(result.attestation.txHash)
                        )}
                      </>
                    ) : (
                      'No ZK attestation is linked.'
                    )}
                  </div>
                </>
              )}

              {!checking && (result?.kind === 'no-proof' || result?.kind === 'failed') && (
                <>
                  <div className="zk-result zk-warn">
                    <h4><AlertTriangle size={18} /> Not verified</h4>
                    <p>
                      {result.kind === 'no-proof'
                        ? 'No proof is available for this batch and claim.'
                        : 'The proof does not pass the check for this claim.'}
                    </p>
                  </div>
                  <div className="zk-record">No ZK attestation is linked.</div>
                </>
              )}

              {!checking && result?.kind === 'error' && (
                <>
                  <div className="zk-result zk-err">
                    <h4><XCircle size={18} /> Verification could not be completed.</h4>
                    <p>Please try again in a minute.</p>
                  </div>
                  <button className="btn btn-secondary" onClick={handleVerify}>Try again</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
