import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Package,
  Truck,
  ArrowRightLeft,
  CheckCircle,
  AlertTriangle,
  Shield,
  Download,
  Scale,
  MapPin,
  FileText,
  Clock,
  Hash,
  ExternalLink,
  Building2,
} from 'lucide-react';
import * as api from '../services/api';
import type { Party, Facility, TimelineEvent } from '../types';

export default function BatchDetail() {
  const { batchId } = useParams<{ batchId: string }>();
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const { data: chainOfCustody, isLoading, error } = useQuery({
    queryKey: ['chainOfCustody', batchId],
    queryFn: () => api.getChainOfCustody(batchId!),
    enabled: !!batchId,
  });

  const { data: parties = [] } = useQuery({
    queryKey: ['parties'],
    queryFn: api.getParties,
  });

  const { data: facilities = [] } = useQuery({
    queryKey: ['facilities'],
    queryFn: api.getFacilities,
  });

  const shipMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.shipBatch>[1]) => api.shipBatch(batchId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chainOfCustody', batchId] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setActiveAction(null);
    },
  });

  const transferMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.transferBatch>[1]) => api.transferBatch(batchId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chainOfCustody', batchId] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setActiveAction(null);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.receiveBatch>[1]) => api.receiveBatch(batchId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chainOfCustody', batchId] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setActiveAction(null);
    },
  });

  const disputeMutation = useMutation({
    mutationFn: (data: Parameters<typeof api.disputeBatch>[1]) => api.disputeBatch(batchId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chainOfCustody', batchId] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      setActiveAction(null);
    },
  });

  const handleExport = async () => {
    const data = await api.exportBatch(batchId!);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-${chainOfCustody?.batch.batchId || batchId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'Create': return <Package size={20} />;
      case 'Ship': return <Truck size={20} />;
      case 'Transfer': return <ArrowRightLeft size={20} />;
      case 'Receive': return <CheckCircle size={20} />;
      case 'Dispute': return <AlertTriangle size={20} />;
      default: return <FileText size={20} />;
    }
  };

  if (isLoading) return <div className="loading">Loading batch details...</div>;
  if (error) return <div className="error">Error: {(error as Error).message}</div>;
  if (!chainOfCustody) return <div className="error">Batch not found</div>;

  const { batch, originFacility, timeline, verificationStatus } = chainOfCustody;

  return (
    <div className="page">
      <div className="page-header">
        <div className="header-with-back">
          <Link to="/" className="back-link">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1>Batch {batch.batchId.slice(0, 8)}...</h1>
            <p className="subtitle">Origin: {originFacility.name}</p>
          </div>
        </div>
        <div className="header-actions">
          <Link to={`/verify?batch=${batchId}`} className="btn btn-secondary">
            <Shield size={20} />
            Verify
          </Link>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Download size={20} />
            Export
          </button>
        </div>
      </div>

      {/* Batch Summary */}
      <div className="batch-summary">
        <div className="summary-card">
          <div className="summary-icon"><Scale size={24} /></div>
          <div>
            <div className="summary-label">Weight</div>
            <div className="summary-value">{batch.quantity?.weight || '-'} {batch.quantity?.unit || 'kg'}</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon"><Package size={24} /></div>
          <div>
            <div className="summary-label">Status</div>
            <div className={`summary-value status-${batch.status.toLowerCase()}`}>{batch.status}</div>
          </div>
        </div>
        {batch.declaredAssay?.value && (
          <div className="summary-card">
            <div className="summary-icon">%</div>
            <div>
              <div className="summary-label">Purity</div>
              <div className="summary-value">{batch.declaredAssay.value}%</div>
            </div>
          </div>
        )}
        <div className="summary-card">
          <div className="summary-icon"><FileText size={24} /></div>
          <div>
            <div className="summary-label">Events</div>
            <div className="summary-value">{timeline.length}</div>
          </div>
        </div>
        <div className="summary-card">
          <div className="summary-icon"><Building2 size={24} /></div>
          <div>
            <div className="summary-label">Origin</div>
            <div className="summary-value">{originFacility.location.country}</div>
          </div>
        </div>
        <div className="summary-card">
          <div className={`summary-icon ${verificationStatus.status === 'VERIFIED' ? 'text-success' : 'text-warning'}`}>
            <Shield size={24} />
          </div>
          <div>
            <div className="summary-label">Verification</div>
            <div className="summary-value">{verificationStatus.status}</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      {batch.status !== 'Closed' && batch.status !== 'Dispute' && (
        <div className="card actions-card">
          <h3>Actions</h3>
          <div className="action-buttons">
            {batch.status === 'Created' && (
              <button className="btn btn-primary" onClick={() => setActiveAction('ship')}>
                <Truck size={20} />
                Ship Batch
              </button>
            )}
            {batch.status === 'InTransit' && (
              <>
                <button className="btn btn-primary" onClick={() => setActiveAction('transfer')}>
                  <ArrowRightLeft size={20} />
                  Transfer Custody
                </button>
                <button className="btn btn-success" onClick={() => setActiveAction('receive')}>
                  <CheckCircle size={20} />
                  Receive Batch
                </button>
              </>
            )}
            <button className="btn btn-danger" onClick={() => setActiveAction('dispute')}>
              <AlertTriangle size={20} />
              Raise Dispute
            </button>
          </div>

          {/* Action Forms */}
          {activeAction === 'ship' && (
            <form className="action-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              shipMutation.mutate({
                toPartyId: formData.get('toPartyId') as string,
                toFacilityId: formData.get('toFacilityId') as string,
                transporterId: formData.get('transporterId') as string || undefined,
                notes: formData.get('notes') as string || undefined,
              });
            }}>
              <h4>Ship Batch</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Destination Party *</label>
                  <select name="toPartyId" required>
                    <option value="">Select party...</option>
                    {parties.map((p: Party) => (
                      <option key={p.partyId} value={p.partyId}>{p.legalName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Destination Facility *</label>
                  <select name="toFacilityId" required>
                    <option value="">Select facility...</option>
                    {facilities.map((f: Facility) => (
                      <option key={f.facilityId} value={f.facilityId}>{f.facilityName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Transporter</label>
                  <select name="transporterId">
                    <option value="">Select transporter...</option>
                    {parties.filter((p: Party) => p.partyType === 'Transporter').map((p: Party) => (
                      <option key={p.partyId} value={p.partyId}>{p.legalName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notes</label>
                  <input type="text" name="notes" placeholder="Optional notes" />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveAction(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={shipMutation.isPending}>
                  {shipMutation.isPending ? 'Shipping...' : 'Confirm Ship'}
                </button>
              </div>
            </form>
          )}

          {activeAction === 'transfer' && (
            <form className="action-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              transferMutation.mutate({
                toPartyId: formData.get('toPartyId') as string,
                toFacilityId: formData.get('toFacilityId') as string,
                notes: formData.get('notes') as string || undefined,
              });
            }}>
              <h4>Transfer Custody</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>New Custodian *</label>
                  <select name="toPartyId" required>
                    <option value="">Select party...</option>
                    {parties.map((p: Party) => (
                      <option key={p.partyId} value={p.partyId}>{p.legalName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Location *</label>
                  <select name="toFacilityId" required>
                    <option value="">Select facility...</option>
                    {facilities.map((f: Facility) => (
                      <option key={f.facilityId} value={f.facilityId}>{f.facilityName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Notes</label>
                  <input type="text" name="notes" placeholder="Optional notes" />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveAction(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={transferMutation.isPending}>
                  {transferMutation.isPending ? 'Transferring...' : 'Confirm Transfer'}
                </button>
              </div>
            </form>
          )}

          {activeAction === 'receive' && (
            <form className="action-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              receiveMutation.mutate({
                receiverPartyId: formData.get('receiverPartyId') as string,
                facilityId: formData.get('facilityId') as string,
                notes: formData.get('notes') as string || undefined,
              });
            }}>
              <h4>Receive Batch</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Receiving Party *</label>
                  <select name="receiverPartyId" required>
                    <option value="">Select party...</option>
                    {parties.map((p: Party) => (
                      <option key={p.partyId} value={p.partyId}>{p.legalName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Receiving Facility *</label>
                  <select name="facilityId" required>
                    <option value="">Select facility...</option>
                    {facilities.map((f: Facility) => (
                      <option key={f.facilityId} value={f.facilityId}>{f.facilityName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group full-width">
                  <label>Notes</label>
                  <input type="text" name="notes" placeholder="Optional notes" />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveAction(null)}>Cancel</button>
                <button type="submit" className="btn btn-success" disabled={receiveMutation.isPending}>
                  {receiveMutation.isPending ? 'Receiving...' : 'Confirm Receipt'}
                </button>
              </div>
            </form>
          )}

          {activeAction === 'dispute' && (
            <form className="action-form" onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              disputeMutation.mutate({
                raisedByPartyId: formData.get('raisedByPartyId') as string,
                reason: formData.get('reason') as string,
              });
            }}>
              <h4>Raise Dispute</h4>
              <div className="form-grid">
                <div className="form-group">
                  <label>Raised By *</label>
                  <select name="raisedByPartyId" required>
                    <option value="">Select party...</option>
                    {parties.map((p: Party) => (
                      <option key={p.partyId} value={p.partyId}>{p.legalName}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Reason *</label>
                  <input type="text" name="reason" required placeholder="Describe the dispute reason" />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setActiveAction(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger" disabled={disputeMutation.isPending}>
                  {disputeMutation.isPending ? 'Submitting...' : 'Submit Dispute'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Chain of Custody Timeline */}
      <div className="card">
        <h3>Chain of Custody</h3>
        <div className="timeline">
          {timeline.map((event: TimelineEvent, index: number) => (
            <div key={event.eventId} className={`timeline-item event-${event.eventType.toLowerCase()}`}>
              <div className="timeline-marker">
                {getEventIcon(event.eventType)}
              </div>
              <div className="timeline-content">
                <div className="timeline-header">
                  <span className={`event-badge event-${event.eventType.toLowerCase()}`}>
                    {event.eventType}
                  </span>
                  <span className="event-time">
                    <Clock size={14} />
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="event-details">
                  {event.from?.facility && (
                    <div className="detail">
                      <MapPin size={14} />
                      <span>From: {event.from.facility.name}</span>
                    </div>
                  )}
                  {event.to?.facility && (
                    <div className="detail">
                      <Building2 size={14} />
                      <span>To: {event.to.facility.name}</span>
                    </div>
                  )}
                  {event.notes && (
                    <div className="detail">
                      <FileText size={14} />
                      <span>{event.notes}</span>
                    </div>
                  )}
                </div>
                <div className="event-footer">
                  <div className="hash-info">
                    <Hash size={12} />
                    <code>{event.payloadHash.slice(0, 16)}...</code>
                  </div>
                  {event.txHash && (
                    <a
                      href={event.explorerUrl || `https://amoy.polygonscan.com/tx/${event.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="anchor-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        const url = event.explorerUrl || `https://amoy.polygonscan.com/tx/${event.txHash}`;
                        window.open(url, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <ExternalLink size={12} />
                      View on Amoy
                    </a>
                  )}
                </div>
              </div>
              {index < timeline.length - 1 && <div className="timeline-connector" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
