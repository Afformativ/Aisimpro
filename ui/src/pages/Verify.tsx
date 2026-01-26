import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, ExternalLink, Search } from 'lucide-react';
import * as api from '../services/api';
import type { Batch } from '../types';

export default function Verify() {
  const [searchParams] = useSearchParams();
  const initialBatchId = searchParams.get('batch') || '';
  const [batchId, setBatchId] = useState(initialBatchId);
  const [searchId, setSearchId] = useState(initialBatchId);

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: api.getBatches,
  });

  const { data: verification, isLoading, error } = useQuery({
    queryKey: ['verify', searchId],
    queryFn: () => api.verifyBatch(searchId),
    enabled: !!searchId,
  });

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchId(batchId);
  };

  const handleSelectBatch = (id: string) => {
    setBatchId(id);
    setSearchId(id);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Verify Batch</h1>
          <p className="subtitle">Verify batch integrity and blockchain anchors</p>
        </div>
      </div>

      <div className="card">
        <h3>Search Batch</h3>
        <form onSubmit={handleVerify} className="search-form">
          <div className="search-input-group">
            <input
              type="text"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              placeholder="Enter batch ID or select from list"
              className="search-input"
            />
            <button type="submit" className="btn btn-primary" disabled={!batchId || isLoading}>
              <Search size={20} />
              Verify
            </button>
          </div>
        </form>

        {batches.length > 0 && (
          <div className="batch-select-list">
            <p className="select-label">Or select a batch:</p>
            <div className="batch-chips">
              {batches.map((batch: Batch) => (
                <button
                  key={batch.batchId}
                  className={`batch-chip ${searchId === batch.batchId ? 'active' : ''}`}
                  onClick={() => handleSelectBatch(batch.batchId)}
                >
                  {batch.externalReferenceNumber || batch.batchId.slice(0, 12) + '...'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="loading-card">
          <div className="loading-spinner" />
          <p>Verifying batch integrity...</p>
        </div>
      )}

      {error && (
        <div className="card error-card">
          <XCircle size={48} />
          <h3>Verification Failed</h3>
          <p>{(error as Error).message}</p>
        </div>
      )}

      {verification && (
        <div className="verification-results">
          {/* Overall Status */}
          <div className={`verification-status ${verification.overallValid ? 'valid' : 'invalid'}`}>
            {verification.overallValid ? (
              <>
                <CheckCircle size={64} />
                <h2>Batch Verified</h2>
                <p>All integrity checks passed</p>
              </>
            ) : (
              <>
                <XCircle size={64} />
                <h2>Verification Failed</h2>
                <p>One or more integrity checks failed</p>
              </>
            )}
          </div>

          {/* Check Summary */}
          <div className="verification-checks">
            <div className={`check-card ${verification.batchHashValid ? 'valid' : 'invalid'}`}>
              <div className="check-icon">
                {verification.batchHashValid ? <CheckCircle size={32} /> : <XCircle size={32} />}
              </div>
              <div>
                <h4>Batch Hash</h4>
                <p>{verification.batchHashValid ? 'Batch hash is valid' : 'Batch hash invalid'}</p>
              </div>
            </div>

            <div className={`check-card ${verification.events.every(e => e.hashMatch) ? 'valid' : 'invalid'}`}>
              <div className="check-icon">
                {verification.events.every(e => e.hashMatch) ? <CheckCircle size={32} /> : <XCircle size={32} />}
              </div>
              <div>
                <h4>Event Hashes</h4>
                <p>{verification.events.every(e => e.hashMatch) ? 'All event hashes match' : 'Some event hashes invalid'}</p>
              </div>
            </div>

            <div className={`check-card ${verification.anchorVerifications.every(a => a.verified) ? 'valid' : 'invalid'}`}>
              <div className="check-icon">
                {verification.anchorVerifications.every(a => a.verified) ? <CheckCircle size={32} /> : <AlertTriangle size={32} />}
              </div>
              <div>
                <h4>Blockchain Anchors</h4>
                <p>{verification.anchorVerifications.every(a => a.verified) ? 'All anchors verified on chain' : 'Some anchors not verified'}</p>
              </div>
            </div>
          </div>

          {/* Event Details */}
          <div className="card">
            <h3>Event Verification Details</h3>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Hash Valid</th>
                    <th>Anchor</th>
                  </tr>
                </thead>
                <tbody>
                  {verification.events.map((event) => {
                    const anchor = verification.anchorVerifications.find(a => a.eventId === event.eventId);
                    return (
                      <tr key={event.eventId}>
                        <td>
                          <span className={`event-badge event-${event.eventType.toLowerCase()}`}>
                            {event.eventType}
                          </span>
                          <code className="event-id">{event.eventId.slice(0, 8)}...</code>
                        </td>
                        <td>
                          {event.hashMatch ? (
                            <span className="status-valid"><CheckCircle size={16} /> Valid</span>
                          ) : (
                            <span className="status-invalid"><XCircle size={16} /> Invalid</span>
                          )}
                        </td>
                        <td>
                          {anchor?.txHash ? (
                            <a 
                              href={`https://amoy.polygonscan.com/tx/${anchor.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="anchor-link-inline"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(`https://amoy.polygonscan.com/tx/${anchor.txHash}`, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              {anchor.verified ? (
                                <>
                                  <CheckCircle size={16} /> 
                                  <span>View TX</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle size={16} /> 
                                  <span>View TX (Pending)</span>
                                </>
                              )}
                              <ExternalLink size={12} />
                            </a>
                          ) : (
                            <span className="status-warning"><AlertTriangle size={16} /> Not Anchored</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="info-box">
        <h4> Verification Process</h4>
        <ul>
          <li><strong>Hash Chain:</strong> Verifies each event's SHA-256 hash matches its data</li>
          <li><strong>Blockchain Anchors:</strong> Confirms hashes are anchored to Polygon Amoy Testnet</li>
          <li>In simulation mode, blockchain anchors show as "Simulated"</li>
        </ul>
      </div>
    </div>
  );
}
